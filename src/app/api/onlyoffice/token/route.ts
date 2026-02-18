/**
 * ONLYOFFICE Session Token Generation API
 * Feature 009: POST /api/onlyoffice/token
 * Generates JWT tokens for ONLYOFFICE document viewing/editing sessions
 * Authentication: User session (NextAuth)
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { createSession, refreshSession } from '@/lib/onlyoffice/session-manager';
import type { SessionMode, TokenRequest } from '@/types/onlyoffice';

export async function POST(request: NextRequest) {
  try {
    // Authenticate user via NextAuth session
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized', message: 'Authentication required' },
        { status: 401 }
      );
    }

    // Parse and validate request body
    const body: TokenRequest = await request.json();
    const { contractId, mode } = body;

    if (!contractId) {
      return NextResponse.json(
        { error: 'Bad Request', message: 'Contract ID is required' },
        { status: 400 }
      );
    }

    // Validate mode if provided
    if (mode && mode !== 'view' && mode !== 'edit') {
      return NextResponse.json(
        { error: 'Bad Request', message: 'Mode must be "view" or "edit"' },
        { status: 400 }
      );
    }

    // Fetch contract with document and permissions check
    const contract = await db.contract.findUnique({
      where: { id: contractId },
      include: {
        document: true,
        client: true,
      },
    });

    if (!contract) {
      return NextResponse.json(
        { error: 'Not Found', message: 'Contract not found', contractId },
        { status: 404 }
      );
    }

    if (!contract.document) {
      return NextResponse.json(
        { error: 'Not Found', message: 'Contract has no associated document', contractId },
        { status: 404 }
      );
    }

    // Check ownership permissions
    if (contract.createdBy && contract.createdBy !== session.user.id) {
      // Allow admin users to access any contract
      if (session.user.role !== 'admin') {
        return NextResponse.json(
          { error: 'Forbidden', message: 'You do not have permission to access this contract', contractId },
          { status: 403 }
        );
      }
    }

    // Determine session mode: explicit mode > contract status
    const sessionMode: SessionMode = mode || (contract.status === 'finalized' ? 'view' : 'edit');

    // Create new ONLYOFFICE session
    const tokenResponse = await createSession({
      contractId: contract.id,
      userId: session.user.id,
      userName: session.user.name || 'User',
      contractTitle: contract.title,
      fileType: contract.document.fileType,
      mode: sessionMode,
    });

    console.log({
      timestamp: new Date().toISOString(),
      action: 'onlyoffice_session_created',
      userId: session.user.id,
      contractId,
      mode: sessionMode,
      sessionId: tokenResponse.sessionId,
    });

    return NextResponse.json(tokenResponse);
  } catch (error) {
    console.error('Token generation error:', error);
    return NextResponse.json(
      { error: 'Internal Server Error', message: 'Failed to generate session tokens' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/onlyoffice/token — Refresh an existing session
 */
export async function PATCH(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized', message: 'Authentication required' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { sessionId } = body;

    if (!sessionId) {
      return NextResponse.json(
        { error: 'Bad Request', message: 'Session ID is required' },
        { status: 400 }
      );
    }

    const refreshed = await refreshSession(sessionId);

    console.log({
      timestamp: new Date().toISOString(),
      action: 'onlyoffice_session_refreshed',
      userId: session.user.id,
      sessionId,
    });

    return NextResponse.json(refreshed);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to refresh session';
    console.error('Token refresh error:', error);
    return NextResponse.json(
      { error: 'Internal Server Error', message },
      { status: 500 }
    );
  }
}
