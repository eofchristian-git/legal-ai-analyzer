/**
 * WOPI File Contents Endpoints
 * Feature 010: GET (GetFile) + POST (PutFile)
 *
 * GET  /api/wopi/files/[fileId]/contents — Collabora downloads the raw DOCX bytes
 * POST /api/wopi/files/[fileId]/contents — Collabora saves the modified DOCX bytes back
 *
 * Authentication: WOPI access_token query parameter (JWT).
 */

import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import { db } from '@/lib/db';
import { validateWopiTokenForFile } from '@/lib/collabora/wopi-token';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ fileId: string }> }
) {
  try {
    const { fileId } = await params;

    // ─── Validate WOPI access token ────────────────────────────────────
    const accessToken = request.nextUrl.searchParams.get('access_token');
    if (!accessToken) {
      return NextResponse.json(
        { error: 'Unauthorized', message: 'WOPI access token is missing' },
        { status: 401 }
      );
    }

    try {
      validateWopiTokenForFile(accessToken, fileId);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Invalid WOPI token';
      return NextResponse.json(
        { error: 'Unauthorized', message },
        { status: 401 }
      );
    }

    // ─── Fetch contract and document from database ─────────────────────
    const contract = await db.contract.findUnique({
      where: { id: fileId },
      include: { document: true },
    });

    if (!contract || !contract.document) {
      return NextResponse.json(
        { error: 'Not Found', message: 'Contract or document not found' },
        { status: 404 }
      );
    }

    // ─── Read and return file bytes ────────────────────────────────────
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
    const contentType =
      contract.document.fileType === 'application/pdf'
        ? 'application/pdf'
        : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

    return new NextResponse(new Uint8Array(fileBuffer), {
      headers: {
        'Content-Type': contentType,
        'Content-Length': fileBuffer.length.toString(),
        'X-WOPI-ItemVersion': contract.document.updatedAt.getTime().toString(),
      },
    });
  } catch (error) {
    console.error('[WOPI GetFile] Error:', error);
    return NextResponse.json(
      { error: 'Internal Server Error', message: 'Failed to serve document file' },
      { status: 500 }
    );
  }
}

// ─── WOPI PutFile: Collabora saves the modified document back ────────────────
//
// Called by Collabora when Action_Save is triggered. Receives the full DOCX
// bytes in the request body and writes them to disk, replacing the original.
// Also updates the document's `updatedAt` timestamp so the WOPI Version field
// changes, preventing Collabora from using a stale cached copy on the next load.

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ fileId: string }> }
) {
  try {
    const { fileId } = await params;

    // ─── Validate WOPI access token ──────────────────────────────────
    const accessToken = request.nextUrl.searchParams.get('access_token');
    if (!accessToken) {
      return NextResponse.json(
        { error: 'Unauthorized', message: 'WOPI access token is missing' },
        { status: 401 }
      );
    }

    try {
      validateWopiTokenForFile(accessToken, fileId);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Invalid WOPI token';
      return NextResponse.json(
        { error: 'Unauthorized', message },
        { status: 401 }
      );
    }

    // ─── Fetch contract and document ─────────────────────────────────
    const contract = await db.contract.findUnique({
      where: { id: fileId },
      include: { document: true },
    });

    if (!contract || !contract.document) {
      return NextResponse.json(
        { error: 'Not Found', message: 'Contract or document not found' },
        { status: 404 }
      );
    }

    // ─── Read the incoming file bytes ────────────────────────────────
    const bodyBuffer = Buffer.from(await request.arrayBuffer());

    if (bodyBuffer.length === 0) {
      return NextResponse.json(
        { error: 'Bad Request', message: 'Empty file body' },
        { status: 400 }
      );
    }

    console.log(
      `[WOPI PutFile] Saving ${bodyBuffer.length} bytes for contract ${fileId}`
    );

    // ─── Write the file to disk ──────────────────────────────────────
    const filePath = contract.document.filePath;

    // Ensure the directory exists (defensive)
    await fs.mkdir(path.dirname(filePath), { recursive: true });

    await fs.writeFile(filePath, bodyBuffer);

    // ─── Update the document timestamp ───────────────────────────────
    // This bumps the WOPI Version field so Collabora knows the file changed.
    await db.document.update({
      where: { id: contract.document.id },
      data: { updatedAt: new Date() },
    });

    console.log(`[WOPI PutFile] ✓ File saved successfully for contract ${fileId}`);

    return NextResponse.json(
      { status: 'ok' },
      {
        status: 200,
        headers: {
          'X-WOPI-ItemVersion': new Date().getTime().toString(),
        },
      }
    );
  } catch (error) {
    console.error('[WOPI PutFile] Error:', error);
    return NextResponse.json(
      { error: 'Internal Server Error', message: 'Failed to save document file' },
      { status: 500 }
    );
  }
}
