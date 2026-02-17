// Feature 008: Interactive Document Viewer & Redline Export
// API endpoint to fetch HTML document and position mappings

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { hasPermission } from '@/lib/permissions';
import type { ClausePosition, FindingPosition } from '@/types/document-viewer';

/**
 * GET /api/contracts/[id]/document
 * Fetch HTML document and position mappings for rendering in document viewer
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Check authentication
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      );
    }

    const { id } = await params;

    // Check permissions
    const canReview = await hasPermission(session.user.id, 'REVIEW_CONTRACTS');
    if (!canReview) {
      return NextResponse.json(
        { success: false, error: 'Insufficient permissions to view this contract' },
        { status: 403 }
      );
    }

    // Fetch contract with document data
    const contract = await db.contract.findUnique({
      where: { id },
      include: {
        contractDocument: true,
      },
    });

    if (!contract) {
      return NextResponse.json(
        { success: false, error: 'Contract not found' },
        { status: 404 }
      );
    }

    if (!contract.contractDocument) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Document not converted yet',
          conversionStatus: 'pending',
        },
        { status: 400 }
      );
    }

    const doc = contract.contractDocument;

    // Check conversion status
    if (doc.conversionStatus !== 'completed') {
      return NextResponse.json(
        {
          success: false,
          error: `Document conversion ${doc.conversionStatus}`,
          conversionStatus: doc.conversionStatus,
          conversionError: doc.conversionError,
        },
        { status: 400 }
      );
    }

    // Parse position mappings from JSON
    let clausePositions: ClausePosition[] = [];
    let findingPositions: FindingPosition[] = [];

    try {
      clausePositions = JSON.parse(doc.clausePositions);
      findingPositions = JSON.parse(doc.findingPositions);
    } catch (error) {
      console.error('Failed to parse position mappings:', error);
      // Continue with empty arrays - viewer will handle missing positions
    }

    // Return document data
    return NextResponse.json({
      success: true,
      document: {
        id: doc.id,
        htmlContent: doc.htmlContent,
        pageCount: doc.pageCount,
        conversionStatus: doc.conversionStatus,
        clausePositions,
        findingPositions,
      },
      contract: {
        id: contract.id,
        title: contract.title,
        status: contract.status,
      },
    }, {
      headers: {
        // Cache for 5 minutes
        'Cache-Control': 'private, max-age=300',
        // Next.js handles compression automatically, don't set Content-Encoding manually
      },
    });

  } catch (error) {
    console.error('Document API error:', error);
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
