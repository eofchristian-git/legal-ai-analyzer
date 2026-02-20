/**
 * @deprecated Replaced by /api/contracts/[id]/export-modified (Feature 012).
 * This endpoint uses the reconstructed DOCX approach (document-exporter.ts).
 * The new endpoint uses the original DOCX with native Word Track Changes.
 */
// Feature 008: Interactive Document Viewer & Redline Export
// API endpoint to generate redline exports (Word or PDF) (T039)

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { computeProjection } from '@/lib/projection';
import { generateWordDocument, generatePDFDocument } from '@/lib/document-exporter';
import type { ClauseExportData } from '@/lib/document-exporter';
import type { ExportMetadata } from '@/types/document-viewer';
import type { TrackedChange } from '@/types/decisions';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { format?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const format = body.format === 'pdf' ? 'pdf' : 'docx';

  const contract = await db.contract.findUnique({
    where: { id: id },
    include: {
      document: true,
      analysis: {
        include: {
          clauses: {
            orderBy: { position: 'asc' },
            include: { findings: true },
          },
        },
      },
    },
  });

  if (!contract) {
    return NextResponse.json({ error: 'Contract not found' }, { status: 404 });
  }
  if (!contract.analysis) {
    return NextResponse.json({ error: 'Contract has not been analyzed yet' }, { status: 400 });
  }

  const clauseExportData: ClauseExportData[] = [];

  for (const clause of contract.analysis.clauses) {
    let trackedChanges: TrackedChange[] = [];
    let effectiveText: string | null = clause.clauseText ?? null;
    let originalText: string | null = clause.clauseText ?? null;

    try {
      const projection = await computeProjection(clause.id);
      trackedChanges = projection.trackedChanges || [];
      effectiveText = projection.effectiveText;
      originalText = projection.originalText;
    } catch (err) {
      console.error(`Failed to compute projection for clause ${clause.id}:`, err);
    }

    const hasChanges =
      trackedChanges.length > 0 &&
      trackedChanges.some((c: TrackedChange) => c.type !== 'equal');

    // Carry findings so the exporter can annotate unresolved deviations
    const findings = clause.findings.map((f) => ({
      riskLevel: f.riskLevel as 'RED' | 'YELLOW' | 'GREEN',
      summary: f.summary,
      matchedRuleTitle: f.matchedRuleTitle,
      excerpt: f.excerpt,
    }));

    clauseExportData.push({
      clauseId: clause.id,
      clauseName: clause.clauseName,
      clauseNumber: clause.clauseNumber || '',
      position: clause.position,
      originalText,
      effectiveText,
      trackedChanges,
      hasChanges,
      findings,
    });
  }

  const metadata: ExportMetadata = {
    contractTitle: contract.title,
    counterparty: contract.counterparty ?? null,
    exportDate: new Date(),
    reviewerName: session.user.name || session.user.email || 'Unknown Reviewer',
    organizationName: contract.ourSide ?? undefined,
  };

  try {
    let fileBuffer: Buffer;
    let contentType: string;
    let filename: string;

    if (format === 'docx') {
      fileBuffer = await generateWordDocument({ clauses: clauseExportData, metadata, format: 'docx' });
      contentType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
      filename = `redline-${contract.title.replace(/[^a-z0-9]/gi, '-').toLowerCase()}.docx`;
    } else {
      fileBuffer = await generatePDFDocument({ clauses: clauseExportData, metadata, format: 'pdf' });
      contentType = 'application/pdf';
      filename = `redline-${contract.title.replace(/[^a-z0-9]/gi, '-').toLowerCase()}.pdf`;
    }

    return new NextResponse(fileBuffer.buffer as ArrayBuffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': String(fileBuffer.length),
      },
    });
  } catch (error) {
    console.error('Export generation failed:', error);
    return NextResponse.json(
      {
        error: 'Export generation failed',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
