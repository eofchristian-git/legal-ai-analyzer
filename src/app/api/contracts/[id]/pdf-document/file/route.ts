/**
 * GET /api/contracts/[id]/pdf-document/file
 * Streams the converted PDF binary for the PDF viewer.
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSessionOrUnauthorized } from '@/lib/auth-utils';
import fs from 'fs/promises';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await getSessionOrUnauthorized();
  if (error) return error;

  const { id: contractId } = await params;

  const doc = await db.contractDocument.findUnique({
    where: { contractId },
    select: { pdfPath: true, pdfConversionStatus: true },
  });

  if (!doc?.pdfPath || doc.pdfConversionStatus !== 'completed') {
    return NextResponse.json({ error: 'PDF not available' }, { status: 404 });
  }

  try {
    const pdfBuffer = await fs.readFile(doc.pdfPath);
    return new NextResponse(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Length': String(pdfBuffer.length),
        'Cache-Control': 'private, max-age=3600',
      },
    });
  } catch {
    return NextResponse.json({ error: 'PDF file not accessible' }, { status: 500 });
  }
}
