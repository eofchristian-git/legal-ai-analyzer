/**
 * Document Download API Endpoint
 * Feature 009: GET /api/contracts/[id]/download
 * Serves contract document files to ONLYOFFICE Document Server
 * Authentication: Token-based (not user session)
 */

import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import { db } from '@/lib/db';
import { validateDownloadToken } from '@/lib/onlyoffice/jwt';
import jwt from 'jsonwebtoken';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: contractId } = await params;

    // Extract download token from query parameters
    const token = request.nextUrl.searchParams.get('token');
    if (!token) {
      return NextResponse.json(
        { error: 'Unauthorized', message: 'Download token is missing' },
        { status: 401 }
      );
    }

    // Validate and decode the download token
    let decoded;
    try {
      decoded = validateDownloadToken(token);
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        return NextResponse.json(
          { error: 'Forbidden', message: 'Download token has expired' },
          { status: 403 }
        );
      }
      return NextResponse.json(
        { error: 'Unauthorized', message: 'Invalid download token' },
        { status: 401 }
      );
    }

    // Verify contract ID matches token
    if (decoded.contractId !== contractId) {
      return NextResponse.json(
        { error: 'Forbidden', message: 'Token contract ID mismatch' },
        { status: 403 }
      );
    }

    // Fetch contract and document from database
    const contract = await db.contract.findUnique({
      where: { id: contractId },
      include: { document: true },
    });

    if (!contract || !contract.document) {
      return NextResponse.json(
        { error: 'Not Found', message: 'Contract or document not found', contractId },
        { status: 404 }
      );
    }

    // Read file from file system
    let fileBuffer: Buffer;
    try {
      fileBuffer = await fs.readFile(contract.document.filePath);
    } catch {
      return NextResponse.json(
        { error: 'Internal Server Error', message: 'Failed to read document file' },
        { status: 500 }
      );
    }

    // Determine Content-Type based on file type
    const contentType = contract.document.fileType === 'application/pdf'
      ? 'application/pdf'
      : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

    const fileExtension = contract.document.fileType === 'application/pdf' ? 'pdf' : 'docx';

    // Return file as response
    return new NextResponse(fileBuffer, {
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `inline; filename="${contract.title}.${fileExtension}"`,
        'Content-Length': fileBuffer.length.toString(),
      },
    });
  } catch (error) {
    console.error('Document download error:', error);
    return NextResponse.json(
      { error: 'Internal Server Error', message: 'Failed to download document' },
      { status: 500 }
    );
  }
}
