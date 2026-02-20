/**
 * GET /api/contracts/[id]/export-modified
 * Export the original DOCX with tracked changes + Word comments.
 * Optionally ?format=pdf for annotated PDF (Phase 5/US6).
 *
 * Feature 012 (T030)
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSessionOrUnauthorized } from '@/lib/auth-utils';
import { modifyOriginalDocx } from '@/lib/docx-modifier';
import { generateAnnotatedPdf } from '@/lib/pdf-export';
import path from 'path';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await getSessionOrUnauthorized();
  if (error) return error;

  const { id: contractId } = await params;
  const format = req.nextUrl.searchParams.get('format') ?? 'docx';

  // Load contract for filename
  const contract = await db.contract.findUnique({
    where: { id: contractId },
    include: { document: true, contractDocument: true },
  });

  if (!contract) {
    return NextResponse.json({ error: 'Contract not found' }, { status: 404 });
  }

  if (!contract.document) {
    return NextResponse.json({ error: 'Contract has no document' }, { status: 404 });
  }

  const originalFilename = contract.document.filename;
  const baseName = path.basename(originalFilename, path.extname(originalFilename));
  const safeTitle = baseName.replace(/[^a-zA-Z0-9._-]/g, '-');

  if (format === 'pdf') {
    // Phase 5 / US6: Annotated PDF export
    const doc = contract.contractDocument;
    if (!doc?.pdfPath || doc.pdfConversionStatus !== 'completed') {
      return NextResponse.json(
        {
          error:
            'PDF conversion not completed. Run analysis first, then wait for PDF preparation.',
        },
        { status: 422 }
      );
    }

    try {
      const pdfBuffer = await generateAnnotatedPdf(contractId, doc.pdfPath);
      return new NextResponse(new Uint8Array(pdfBuffer), {
        status: 200,
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="${safeTitle}-reviewed.pdf"`,
        },
      });
    } catch (err) {
      console.error('[ExportModified] PDF generation failed:', err);
      return NextResponse.json(
        { error: 'Failed to generate annotated PDF' },
        { status: 500 }
      );
    }
  }

  // Default: DOCX with tracked changes
  if (!originalFilename.endsWith('.docx') && !originalFilename.endsWith('.doc')) {
    return NextResponse.json(
      { error: 'Original file is not a DOCX. Only DOCX files support tracked changes export.' },
      { status: 422 }
    );
  }

  try {
    const docxBuffer = await modifyOriginalDocx(contractId);

    return new NextResponse(new Uint8Array(docxBuffer), {
      status: 200,
      headers: {
        'Content-Type':
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename="${safeTitle}-reviewed.docx"`,
      },
    });
  } catch (err) {
    console.error('[ExportModified] DOCX modification failed:', err);

    const msg = err instanceof Error ? err.message : 'Export failed';

    if (msg.startsWith('UNPROCESSABLE:')) {
      return NextResponse.json({ error: msg.replace('UNPROCESSABLE: ', '') }, { status: 422 });
    }
    if (msg.includes('not found')) {
      return NextResponse.json({ error: msg }, { status: 404 });
    }
    return NextResponse.json({ error: 'Failed to generate export document' }, { status: 500 });
  }
}
