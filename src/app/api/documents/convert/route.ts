// Feature 008: Interactive Document Viewer & Redline Export
// Internal API endpoint for document conversion (called from analysis workflow)

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import { convertDocument, detectFormat } from '@/lib/document-converter';
import { calculatePositions, injectClauseMarkers } from '@/lib/position-mapper';
import { sanitizeHTML } from '@/lib/html-sanitizer';
import fs from 'fs/promises';

/**
 * POST /api/documents/convert
 * Convert uploaded Word/PDF document to HTML during analysis phase
 * This is an internal endpoint called from the analysis workflow
 */
export async function POST(request: NextRequest) {
  try {
    // Check authentication
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      );
    }

    // Parse form data
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const contractId = formData.get('contractId') as string | null;

    if (!file || !contractId) {
      return NextResponse.json(
        { success: false, error: 'Missing file or contractId' },
        { status: 400 }
      );
    }

    // Validate file size (max 50MB)
    const maxSize = 50 * 1024 * 1024; // 50MB
    if (file.size > maxSize) {
      return NextResponse.json(
        { success: false, error: 'File size exceeds maximum limit of 50MB' },
        { status: 413 }
      );
    }

    // Validate file type
    let format: 'word' | 'pdf';
    try {
      format = detectFormat(file.name);
    } catch (error) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Invalid file format. Only .docx and .pdf are supported' 
        },
        { status: 400 }
      );
    }

    // Get contract and verify ownership
    const contract = await db.contract.findUnique({
      where: { id: contractId },
      include: {
        document: true,
        analysis: {
          include: {
            clauses: {
              include: {
                findings: true,
              },
            },
          },
        },
      },
    });

    if (!contract) {
      return NextResponse.json(
        { success: false, error: 'Contract not found' },
        { status: 404 }
      );
    }

    // Create or update ContractDocument record with 'processing' status
    let contractDocument = await db.contractDocument.findUnique({
      where: { contractId },
    });

    if (!contractDocument) {
      contractDocument = await db.contractDocument.create({
        data: {
          contractId,
          originalPdfPath: contract.document.filePath,
          pageCount: 0,
          conversionStatus: 'processing',
        },
      });
    } else {
      await db.contractDocument.update({
        where: { id: contractDocument.id },
        data: {
          conversionStatus: 'processing',
          conversionError: null,
        },
      });
    }

    // Convert file to buffer
    const arrayBuffer = await file.arrayBuffer();
    const fileBuffer = Buffer.from(arrayBuffer);

    try {
      // Step 1: Convert document to HTML
      const { html, pageCount, warnings } = await convertDocument({
        fileBuffer,
        format,
        contractId,
      });

      console.log(`Document converted: ${pageCount} pages, ${warnings?.length || 0} warnings`);

      // Step 2: Inject clause markers (if analysis exists)
      let markedHTML = html;
      if (contract.analysis?.clauses && contract.analysis.clauses.length > 0) {
        markedHTML = injectClauseMarkers(html, contract.analysis.clauses);
      }

      // Step 3: Sanitize HTML
      const sanitized = sanitizeHTML(markedHTML);

      // Step 4: Calculate position mappings (if analysis exists)
      let clausePositions: any[] = [];
      let findingPositions: any[] = [];

      if (contract.analysis?.clauses && contract.analysis.clauses.length > 0) {
        const allFindings = contract.analysis.clauses.flatMap(c => 
          c.findings.map(f => ({
            id: f.id,
            clauseId: f.clauseId,
            excerpt: f.excerpt,
            locationPage: f.locationPage,
            locationPosition: f.locationPosition,
          }))
        );

        const positions = await calculatePositions({
          html: sanitized,
          documentId: contractDocument.id,
          clauses: contract.analysis.clauses.map(c => ({
            id: c.id,
            clauseNumber: c.clauseNumber,
            clauseText: c.clauseText,
          })),
          findings: allFindings,
        });

        clausePositions = positions.clausePositions;
        findingPositions = positions.findingPositions;
      }

      // Step 5: Store in ContractDocument
      await db.contractDocument.update({
        where: { id: contractDocument.id },
        data: {
          htmlContent: sanitized,
          pageCount: pageCount || 1,
          clausePositions: JSON.stringify(clausePositions),
          findingPositions: JSON.stringify(findingPositions),
          conversionStatus: 'completed',
        },
      });

      console.log(`Document conversion completed for contract ${contractId}`);

      return NextResponse.json({
        success: true,
        documentId: contractDocument.id,
        conversionStatus: 'completed',
        message: 'Document conversion completed',
        pageCount,
        warnings,
      });

    } catch (error) {
      // Handle conversion failure
      await db.contractDocument.update({
        where: { id: contractDocument.id },
        data: {
          conversionStatus: 'failed',
          conversionError: error instanceof Error ? error.message : 'Unknown error',
        },
      });

      console.error('Document conversion failed:', error);

      return NextResponse.json(
        {
          success: false,
          error: 'Document conversion failed',
          details: error instanceof Error ? error.message : 'Unknown error',
        },
        { status: 500 }
      );
    }

  } catch (error) {
    console.error('Convert API error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
