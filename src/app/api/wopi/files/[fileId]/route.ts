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

    const response: CheckFileInfoResponse = {
      BaseFileName: `${contract.title}.docx`,
      Size: fileSize,
      Version: version,
      OwnerId: contract.createdBy || 'system',
      UserId: tokenPayload.userId,
      UserFriendlyName: tokenPayload.userName,

      // Permission flags — we set UserCanWrite: true so that Collabora enters
      // "edit mode" internally. This is required because Collabora's read-only
      // mode blocks `.uno:ExecuteSearch` via postMessage (it has a hardcoded
      // allowlist). With UserCanWrite: true, search/navigation via postMessage
      // works. Saves only happen programmatically (via Action_Save after
      // applying a fallback redline). The document is safe because:
      //   1. PutFile endpoint writes changes only when triggered by our code
      //   2. We strip all editing UI (toolbar, menubar) via postMessage
      //   3. HideSaveOption: true hides the save button from the user
      UserCanWrite: true,
      UserCanNotWriteRelative: true,
      UserCanRename: false,

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
