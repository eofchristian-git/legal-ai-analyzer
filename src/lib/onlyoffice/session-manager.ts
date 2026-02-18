/**
 * ONLYOFFICE Session Lifecycle Manager
 * Feature 009: Create, refresh, expire, revoke, and find active sessions
 */

import { db } from '@/lib/db';
import { generateAccessToken, generateDownloadToken } from './jwt';
import {
  generateDocumentKey,
  ACCESS_TOKEN_EXPIRY_MS,
  SESSION_CLEANUP_DAYS,
  EDITOR_IDLE_TIMEOUT_MS,
  buildDownloadUrl,
  buildCallbackUrl,
  buildOnlyOfficeConfig,
} from './config';
import type { SessionMode, TokenResponse } from '@/types/onlyoffice';
import { logAuditEvent } from './audit-logger';

// ─── Create Session ──────────────────────────────────────────────────────────

export interface CreateSessionOptions {
  contractId: string;
  userId: string;
  userName: string;
  contractTitle: string;
  fileType: string;
  mode: SessionMode;
}

/**
 * Create a new ONLYOFFICE session for a contract.
 * Generates JWT tokens, builds ONLYOFFICE config, and persists session to database.
 */
export async function createSession(options: CreateSessionOptions): Promise<TokenResponse> {
  const { contractId, userId, userName, contractTitle, fileType, mode } = options;

  // Generate unique document key and tokens
  const documentKey = generateDocumentKey(contractId);
  const accessToken = generateAccessToken(contractId, userId, mode);
  const downloadToken = generateDownloadToken(contractId);

  // Build URLs
  const downloadUrl = buildDownloadUrl(contractId, downloadToken);
  const callbackUrl = buildCallbackUrl(contractId);

  // Build ONLYOFFICE editor configuration
  const config = buildOnlyOfficeConfig({
    documentKey,
    contractTitle,
    fileType,
    downloadUrl,
    callbackUrl,
    mode,
    userId,
    userName,
    accessToken,
  });

  // Calculate expiration time (4 hours from now)
  const expiresAt = new Date(Date.now() + ACCESS_TOKEN_EXPIRY_MS);

  // Persist session to database
  const session = await db.onlyOfficeSession.create({
    data: {
      contractId,
      userId,
      documentKey,
      accessToken,
      downloadToken,
      mode,
      status: 'active',
      expiresAt,
    },
  });

  logAuditEvent('session.create', {
    contractId,
    userId,
    sessionId: session.id,
    details: { mode, documentKey },
  });

  return {
    sessionId: session.id,
    documentKey,
    accessToken,
    downloadToken,
    downloadUrl,
    callbackUrl,
    mode,
    expiresAt: expiresAt.toISOString(),
    config,
  };
}

// ─── Refresh Session ─────────────────────────────────────────────────────────

/**
 * Refresh the access token for an active session.
 * Generates a new token and extends the session expiration by 4 hours.
 */
export async function refreshSession(sessionId: string): Promise<{
  accessToken: string;
  downloadToken: string;
  expiresAt: string;
}> {
  // Find the session
  const session = await db.onlyOfficeSession.findUnique({
    where: { id: sessionId },
  });

  if (!session) {
    throw new Error('Session not found');
  }

  if (session.status !== 'active') {
    throw new Error(`Session is ${session.status}`);
  }

  // Generate new tokens
  const newAccessToken = generateAccessToken(
    session.contractId,
    session.userId,
    session.mode as SessionMode
  );
  const newDownloadToken = generateDownloadToken(session.contractId);
  const newExpiresAt = new Date(Date.now() + ACCESS_TOKEN_EXPIRY_MS);

  // Update session in database
  await db.onlyOfficeSession.update({
    where: { id: sessionId },
    data: {
      accessToken: newAccessToken,
      downloadToken: newDownloadToken,
      expiresAt: newExpiresAt,
      lastRefreshedAt: new Date(),
    },
  });

  logAuditEvent('session.refresh', {
    sessionId,
    contractId: session.contractId,
    userId: session.userId,
  });

  return {
    accessToken: newAccessToken,
    downloadToken: newDownloadToken,
    expiresAt: newExpiresAt.toISOString(),
  };
}

// ─── Expire Session ──────────────────────────────────────────────────────────

/**
 * Mark a session as expired.
 */
export async function expireSession(sessionId: string): Promise<void> {
  await db.onlyOfficeSession.update({
    where: { id: sessionId },
    data: { status: 'expired' },
  });
  logAuditEvent('session.expire', { sessionId });
}

// ─── Revoke Session ──────────────────────────────────────────────────────────

/**
 * Manually revoke a session (admin or user action).
 */
export async function revokeSession(sessionId: string): Promise<void> {
  await db.onlyOfficeSession.update({
    where: { id: sessionId },
    data: { status: 'revoked' },
  });
  logAuditEvent('session.revoke', { sessionId });
}

// ─── Find Active Sessions ────────────────────────────────────────────────────

/**
 * Find all active sessions for a given contract.
 * Returns sessions that are active and not yet expired.
 */
export async function findActiveSessions(contractId: string) {
  return db.onlyOfficeSession.findMany({
    where: {
      contractId,
      status: 'active',
      expiresAt: { gt: new Date() },
    },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  });
}

/**
 * Find a specific active session by document key.
 */
export async function findSessionByDocumentKey(documentKey: string) {
  return db.onlyOfficeSession.findUnique({
    where: { documentKey },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
    },
  });
}

// ─── Editor Lock Management (US5 T031) ───────────────────────────────────────

/**
 * Acquire editor lock for a contract. Only one user can edit at a time.
 * Returns true if lock acquired, false if another user holds the lock.
 */
export async function acquireEditorLock(contractId: string, userId: string): Promise<{
  acquired: boolean;
  currentEditor?: { userId: string; userName: string; lockedAt: string };
}> {
  // Find existing edit session for this contract
  const existingEditSession = await db.onlyOfficeSession.findFirst({
    where: {
      contractId,
      mode: 'edit',
      status: 'active',
      expiresAt: { gt: new Date() },
    },
    include: {
      user: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  // If another user holds the lock
  if (existingEditSession && existingEditSession.userId !== userId) {
    logAuditEvent('lock.acquire', {
      contractId,
      userId,
      success: false,
      details: { blockedBy: existingEditSession.userId },
    });
    return {
      acquired: false,
      currentEditor: {
        userId: existingEditSession.userId,
        userName: existingEditSession.user.name,
        lockedAt: existingEditSession.createdAt.toISOString(),
      },
    };
  }

  logAuditEvent('lock.acquire', { contractId, userId });
  return { acquired: true };
}

/**
 * Release editor lock (T032: idle timeout auto-release after 15 minutes).
 * Marks the edit session as expired.
 */
export async function releaseEditorLock(contractId: string, userId: string): Promise<void> {
  await db.onlyOfficeSession.updateMany({
    where: {
      contractId,
      userId,
      mode: 'edit',
      status: 'active',
    },
    data: { status: 'expired' },
  });
  logAuditEvent('lock.release', { contractId, userId });
}

/**
 * T032: Check and release idle editor locks.
 * Any edit session that hasn't been refreshed within EDITOR_IDLE_TIMEOUT_MS
 * is auto-released so other users can acquire the lock.
 */
export async function checkAndReleaseIdleLocks(): Promise<number> {
  const idleCutoff = new Date(Date.now() - EDITOR_IDLE_TIMEOUT_MS);

  // Find edit sessions where lastRefreshedAt (or createdAt if never refreshed) is older than idle cutoff
  const idleSessions = await db.onlyOfficeSession.findMany({
    where: {
      mode: 'edit',
      status: 'active',
      OR: [
        // Never refreshed and created before idle cutoff
        { lastRefreshedAt: null, createdAt: { lt: idleCutoff } },
        // Last refreshed before idle cutoff
        { lastRefreshedAt: { lt: idleCutoff } },
      ],
    },
    select: { id: true, contractId: true, userId: true },
  });

  if (idleSessions.length === 0) return 0;

  // Expire all idle edit sessions
  const result = await db.onlyOfficeSession.updateMany({
    where: {
      id: { in: idleSessions.map((s) => s.id) },
    },
    data: { status: 'expired' },
  });

  if (result.count > 0) {
    logAuditEvent('lock.idle_release', {
      details: { releasedCount: result.count, sessionIds: idleSessions.map((s) => s.id) },
    });
  }
  return result.count;
}

/**
 * Get current viewers and editors for a contract (T034: presence indicators).
 */
export async function getActiveUsers(contractId: string): Promise<Array<{
  userId: string;
  userName: string;
  mode: string;
  since: string;
}>> {
  const sessions = await db.onlyOfficeSession.findMany({
    where: {
      contractId,
      status: 'active',
      expiresAt: { gt: new Date() },
    },
    include: {
      user: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: 'asc' },
  });

  return sessions.map((s) => ({
    userId: s.userId,
    userName: s.user.name,
    mode: s.mode,
    since: s.createdAt.toISOString(),
  }));
}

/**
 * Transfer editor lock from current editor to requesting user (T035).
 */
export async function transferEditorLock(
  contractId: string,
  fromUserId: string,
  toUserId: string
): Promise<boolean> {
  // Release current editor's lock
  await releaseEditorLock(contractId, fromUserId);
  logAuditEvent('lock.transfer', {
    contractId,
    userId: toUserId,
    details: { fromUserId },
  });
  // New lock will be acquired when the new user creates an edit session
  return true;
}

// ─── Cleanup Expired Sessions ────────────────────────────────────────────────

/**
 * Delete expired and revoked sessions older than SESSION_CLEANUP_DAYS (7 days).
 * Designed to be called by a scheduled job.
 */
export async function cleanupExpiredSessions(): Promise<number> {
  const cutoff = new Date(Date.now() - SESSION_CLEANUP_DAYS * 24 * 60 * 60 * 1000);

  // First, mark any sessions past their expiresAt as expired
  await db.onlyOfficeSession.updateMany({
    where: {
      status: 'active',
      expiresAt: { lt: new Date() },
    },
    data: { status: 'expired' },
  });

  // Then delete old expired/revoked sessions
  const deleted = await db.onlyOfficeSession.deleteMany({
    where: {
      status: { in: ['expired', 'revoked'] },
      createdAt: { lt: cutoff },
    },
  });

  logAuditEvent('session.cleanup', {
    details: { deletedCount: deleted.count },
  });

  return deleted.count;
}
