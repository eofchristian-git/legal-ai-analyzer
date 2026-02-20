/**
 * @deprecated Collabora session endpoint. Deprecated by Feature 012 (PDF viewer).
 * The new PDF viewer uses pdfjs-dist with no external service.
 *
 * Collabora Viewer Session Endpoint
 * Feature 010 T010: POST /api/collabora/session
 *
 * Authenticates the user (via NextAuth session cookie), validates access
 * to the contract, generates a WOPI access token, resolves the Collabora
 * iframe URL from the discovery endpoint, and returns everything the
 * frontend needs to render the iframe.
 *
 * Replaces: POST /api/onlyoffice/token
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { generateWopiToken } from '@/lib/collabora/wopi-token';
import { getCollaboraViewerUrl, buildIframeUrl } from '@/lib/collabora/discovery';
import {
  buildWopiSrc,
  getPublicCollaboraServerUrl,
  WOPI_TOKEN_EXPIRY_MS,
} from '@/lib/collabora/config';
import type { CreateSessionRequest, CreateSessionResponse } from '@/types/collabora';

export async function POST(request: NextRequest) {
  try {
    // ─── Authenticate user via NextAuth session ────────────────────────
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized', message: 'Authentication required' },
        { status: 401 }
      );
    }

    // ─── Parse request body ────────────────────────────────────────────
    let body: CreateSessionRequest;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: 'Bad Request', message: 'Invalid JSON body' },
        { status: 400 }
      );
    }

    const { contractId } = body;
    if (!contractId) {
      return NextResponse.json(
        { error: 'Bad Request', message: 'contractId is required' },
        { status: 400 }
      );
    }

    // ─── Validate contract exists and user has access ──────────────────
    const contract = await db.contract.findUnique({
      where: { id: contractId },
      include: { document: true },
    });

    if (!contract || !contract.document) {
      return NextResponse.json(
        { error: 'Not Found', message: 'Contract or document not found' },
        { status: 404 }
      );
    }

    // ─── Generate WOPI access token ────────────────────────────────────
    const accessToken = generateWopiToken(
      contractId,
      session.user.id,
      session.user.name || session.user.email || 'User',
      'view'
    );

    // ─── Resolve Collabora viewer URL from discovery ───────────────────
    let viewerBaseUrl: string;
    try {
      viewerBaseUrl = await getCollaboraViewerUrl();
    } catch (error) {
      console.error('[Collabora Session] Discovery failed:', error);
      return NextResponse.json(
        {
          error: 'Service Unavailable',
          message: 'Collabora server is not available. Please try again later.',
        },
        { status: 503 }
      );
    }

    // ─── Build iframe URL ──────────────────────────────────────────────
    const wopiSrc = buildWopiSrc(contractId);
    const iframeUrl = buildIframeUrl(viewerBaseUrl, wopiSrc, accessToken);

    // ─── Build response ────────────────────────────────────────────────
    const fileVersion = contract.document.updatedAt.getTime().toString();

    const response: CreateSessionResponse = {
      iframeUrl,
      accessToken,
      accessTokenTtl: WOPI_TOKEN_EXPIRY_MS,
      fileId: contractId,
      collaboraOrigin: getPublicCollaboraServerUrl(),
      fileVersion,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('[Collabora Session] Error:', error);
    return NextResponse.json(
      { error: 'Internal Server Error', message: 'Failed to create viewer session' },
      { status: 500 }
    );
  }
}
