/**
 * GET /api/contracts/[id]/pdf-document
 * Returns PDF metadata and position mappings for the PDF viewer.
 *
 * Query params:
 *   dataOnly=true  → returns JSON only (no PDF URL), used for overlay refresh
 *
 * Sub-route /file streams the PDF binary.
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSessionOrUnauthorized } from '@/lib/auth-utils';
import { runPdfPipeline } from '@/lib/pdf-pipeline';
import type { PdfDocumentResponse } from '@/types/pdf-viewer';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await getSessionOrUnauthorized();
  if (error) return error;

  const { id: contractId } = await params;
  const dataOnly = req.nextUrl.searchParams.get('dataOnly') === 'true';

  // Load the contract and its document
  const contract = await db.contract.findUnique({
    where: { id: contractId },
    include: { contractDocument: true },
  });

  if (!contract) {
    return NextResponse.json({ error: 'Contract not found' }, { status: 404 });
  }

  const doc = contract.contractDocument;

  if (!doc) {
    return NextResponse.json(
      {
        conversionStatus: 'pending',
        pdfUrl: null,
        pageCount: 0,
        clauseMappings: [],
        findingMappings: [],
      } satisfies Partial<PdfDocumentResponse>,
      { status: 200 }
    );
  }

  const status = doc.pdfConversionStatus as PdfDocumentResponse['conversionStatus'];

  if (status !== 'completed') {
    const response: Partial<PdfDocumentResponse> = {
      conversionStatus: status,
      pdfUrl: null,
      pageCount: 0,
      clauseMappings: [],
      findingMappings: [],
    };
    if (doc.pdfConversionError) {
      response.conversionError = doc.pdfConversionError;
    }
    return NextResponse.json(response, { status: 200 });
  }

  const clauseMappings = doc.clausePositionMappings
    ? JSON.parse(doc.clausePositionMappings)
    : [];
  const findingMappings = doc.findingPositionMappings
    ? JSON.parse(doc.findingPositionMappings)
    : [];

  const response: PdfDocumentResponse = {
    pdfUrl: dataOnly ? null : `/api/contracts/${contractId}/pdf-document/file`,
    pageCount: doc.pdfPageCount ?? 0,
    conversionStatus: 'completed',
    clauseMappings,
    findingMappings,
  };

  return NextResponse.json(response);
}

/**
 * POST /api/contracts/[id]/pdf-document
 * Manually trigger the PDF pipeline for an existing contract.
 * Returns immediately; pipeline runs asynchronously.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await getSessionOrUnauthorized();
  if (error) return error;

  const { id: contractId } = await params;

  // Verify contract exists and has analysis
  const contract = await db.contract.findUnique({
    where: { id: contractId },
    select: { id: true, analysis: { select: { id: true } }, contractDocument: { select: { pdfConversionStatus: true } } },
  });

  if (!contract) {
    return NextResponse.json({ error: 'Contract not found' }, { status: 404 });
  }
  if (!contract.analysis) {
    return NextResponse.json({ error: 'Contract has no analysis yet' }, { status: 422 });
  }

  // Don't re-run if currently in progress
  const status = contract.contractDocument?.pdfConversionStatus;
  if (status === 'converting' || status === 'extracting' || status === 'mapping') {
    return NextResponse.json({ status: 'already_running' });
  }

  // Fire-and-forget
  runPdfPipeline(contractId).catch((err) => {
    console.error('[PdfDocument POST] Pipeline error:', err);
  });

  return NextResponse.json({ status: 'started' });
}
