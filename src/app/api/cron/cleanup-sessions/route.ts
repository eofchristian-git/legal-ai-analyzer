/**
 * Session Cleanup Scheduled Job
 * Feature 009 T038: Deletes expired/revoked OnlyOffice sessions older than 7 days
 *
 * Intended to be called by:
 * - A cron job (e.g., Vercel Cron, GitHub Actions)
 * - An admin endpoint
 *
 * Protected by CRON_SECRET environment variable for security.
 */

import { NextRequest, NextResponse } from 'next/server';
import { cleanupExpiredSessions } from '@/lib/onlyoffice/session-manager';

export async function GET(request: NextRequest) {
  // Verify cron secret for security
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get('authorization');

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const deletedCount = await cleanupExpiredSessions();

    console.log(`[CRON] Session cleanup completed: ${deletedCount} sessions deleted`);

    return NextResponse.json({
      success: true,
      deletedCount,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[CRON] Session cleanup failed:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Cleanup failed',
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}
