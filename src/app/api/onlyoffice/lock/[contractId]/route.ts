/**
 * ONLYOFFICE Editor Lock API — Request/Release/Transfer Lock
 * Feature 009 T035: Manages editor lock for collaborative review
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import {
  acquireEditorLock,
  releaseEditorLock,
  transferEditorLock,
} from '@/lib/onlyoffice/session-manager';

/**
 * POST: Request or release editor lock
 * Body: { action: 'acquire' | 'release' | 'transfer', fromUserId?: string }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ contractId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { contractId } = await params;
  const body = await request.json();
  const { action } = body;

  try {
    switch (action) {
      case 'acquire': {
        const result = await acquireEditorLock(contractId, session.user.id);
        return NextResponse.json({
          success: result.acquired,
          currentEditor: result.currentEditor || null,
        });
      }

      case 'release': {
        await releaseEditorLock(contractId, session.user.id);
        return NextResponse.json({ success: true });
      }

      case 'transfer': {
        const { fromUserId } = body;
        if (!fromUserId) {
          return NextResponse.json(
            { error: 'fromUserId required for transfer' },
            { status: 400 }
          );
        }
        const transferred = await transferEditorLock(
          contractId,
          fromUserId,
          session.user.id
        );
        return NextResponse.json({ success: transferred });
      }

      default:
        return NextResponse.json(
          { error: `Invalid action: ${action}. Use 'acquire', 'release', or 'transfer'` },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error('[ONLYOFFICE] Lock management error:', error);
    return NextResponse.json(
      { error: 'Lock operation failed' },
      { status: 500 }
    );
  }
}
