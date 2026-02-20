/**
 * ONLYOFFICE Presence API — Active Users & Editor Lock Status
 * Feature 009 T033-T034: Returns active viewers/editors and lock status for a contract
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import {
  getActiveUsers,
  checkAndReleaseIdleLocks,
} from '@/lib/onlyoffice/session-manager';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ contractId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { contractId } = await params;

  try {
    // T032: Check and release idle locks before reporting status
    await checkAndReleaseIdleLocks();

    // Get active users for this contract
    const activeUsers = await getActiveUsers(contractId);

    // Derive lock status from active users (read-only — no audit log)
    const currentEditor = activeUsers.find(
      (u) => u.mode === 'edit' && u.userId !== session.user!.id
    );

    return NextResponse.json({
      activeUsers,
      editorLock: currentEditor
        ? {
            locked: true,
            holder: {
              userId: currentEditor.userId,
              userName: currentEditor.userName,
              lockedAt: currentEditor.since,
            },
          }
        : { locked: false },
      currentUserId: session.user.id,
    });
  } catch (error) {
    console.error('[ONLYOFFICE] Presence check error:', error);
    return NextResponse.json(
      { error: 'Failed to check presence' },
      { status: 500 }
    );
  }
}
