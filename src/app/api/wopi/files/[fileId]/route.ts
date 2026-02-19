/**
 * WOPI CheckFileInfo Endpoint
 * Feature 010 T008: GET /api/wopi/files/[fileId]
 *
 * Called by Collabora when loading a document. Returns metadata about the
 * file including name, size, permissions, and version information.
 * Authentication: WOPI access_token query parameter (JWT).
 */

import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import { db } from '@/lib/db';
import { validateWopiTokenForFile } from '@/lib/collabora/wopi-token';
import { getAppBaseUrl } from '@/lib/collabora/config';
import type { CheckFileInfoResponse } from '@/types/collabora';

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

    let tokenPayload;
    try {
      tokenPayload = validateWopiTokenForFile(accessToken, fileId);
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

    // ─── Get file size ─────────────────────────────────────────────────
    let fileSize = 0;
    try {
      const stat = await fs.stat(contract.document.filePath);
      fileSize = stat.size;
    } catch {
      return NextResponse.json(
        { error: 'Internal Server Error', message: 'Document file not accessible' },
        { status: 500 }
      );
    }

    // ─── Build CheckFileInfo response ──────────────────────────────────
    // Version derived from document updatedAt timestamp — changes on every
    // backend DOCX mutation, forcing Collabora to re-fetch the file.
    const version = contract.document.updatedAt.getTime().toString();

    // V1 Validation result (T001/T006): ReadOnly: true added to CheckFileInfo.
    // Research R1/R5 confirms ReadOnly (WOPI presentation-mode flag) is distinct
    // from UserCanWrite and does not affect the postMessage UNO command channel.
    // Both can be true simultaneously: host app writes programmatically
    // (UserCanWrite: true) while end user sees a read-only UI (ReadOnly: true).
    // If .uno:ExecuteSearch stops working in your Collabora instance with
    // ReadOnly: true, remove that field and rely on the transparent overlay only.
    const response: CheckFileInfoResponse = {
      BaseFileName: `${contract.title}.docx`,
      Size: fileSize,
      Version: version,
      OwnerId: contract.createdBy || 'system',
      UserId: tokenPayload.userId,
      UserFriendlyName: tokenPayload.userName,

      // Permission flags — UserCanWrite: true enables programmatic UNO commands
      // via postMessage (Collabora's read-only mode blocks the UNO command channel).
      // ReadOnly: true instructs Collabora to present view-only UI (no edit cursor,
      // no toolbar) without affecting postMessage. This is layer 1 of read-only
      // enforcement; the transparent overlay in collabora-document-viewer.tsx is layer 2.
      UserCanWrite: true,
      UserCanNotWriteRelative: true,
      UserCanRename: false,
      ReadOnly: true,

      // UI flags
      DisablePrint: false,
      DisableExport: false,
      HidePrintOption: false,
      HideExportOption: false,
      HideSaveOption: true,

      // PostMessage integration — must match the host app origin
      PostMessageOrigin: getAppBaseUrl(),
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('[WOPI CheckFileInfo] Error:', error);
    return NextResponse.json(
      { error: 'Internal Server Error', message: 'Failed to process WOPI CheckFileInfo' },
      { status: 500 }
    );
  }
}
