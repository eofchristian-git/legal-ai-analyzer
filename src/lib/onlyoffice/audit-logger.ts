/**
 * ONLYOFFICE Audit Logger
 * Feature 009 T037: Comprehensive logging for ONLYOFFICE operations
 *
 * Logs document view, edit, export, comment injection, tracked change, and session events
 * to console with structured format. Can be extended to persist to database or external service.
 */

export type AuditAction =
  | 'session.create'
  | 'session.refresh'
  | 'session.expire'
  | 'session.revoke'
  | 'session.cleanup'
  | 'document.view'
  | 'document.edit'
  | 'document.save'
  | 'document.export'
  | 'document.export_clean'
  | 'document.download'
  | 'comment.inject'
  | 'comment.navigate'
  | 'tracked_change.inject'
  | 'tracked_change.toggle'
  | 'tracked_change.accept'
  | 'tracked_change.reject'
  | 'lock.acquire'
  | 'lock.release'
  | 'lock.transfer'
  | 'lock.idle_release'
  | 'health.check'
  | 'callback.received'
  | 'error';

export interface AuditEntry {
  action: AuditAction;
  contractId?: string;
  userId?: string;
  sessionId?: string;
  details?: Record<string, unknown>;
  timestamp: string;
  success: boolean;
  error?: string;
}

/**
 * Log an ONLYOFFICE audit event.
 * Structured logging output for observability.
 */
export function logAuditEvent(
  action: AuditAction,
  options: {
    contractId?: string;
    userId?: string;
    sessionId?: string;
    details?: Record<string, unknown>;
    success?: boolean;
    error?: string;
  } = {}
): AuditEntry {
  const entry: AuditEntry = {
    action,
    contractId: options.contractId,
    userId: options.userId,
    sessionId: options.sessionId,
    details: options.details,
    timestamp: new Date().toISOString(),
    success: options.success ?? true,
    error: options.error,
  };

  // Structured console output
  const level = entry.success ? 'info' : 'error';
  const prefix = `[ONLYOFFICE-AUDIT]`;
  const summary = [
    entry.action,
    entry.contractId ? `contract=${entry.contractId}` : null,
    entry.userId ? `user=${entry.userId}` : null,
    entry.sessionId ? `session=${entry.sessionId}` : null,
    entry.error ? `error=${entry.error}` : null,
  ]
    .filter(Boolean)
    .join(' ');

  if (level === 'error') {
    console.error(`${prefix} ${summary}`, entry.details || '');
  } else {
    console.log(`${prefix} ${summary}`, entry.details ? JSON.stringify(entry.details) : '');
  }

  return entry;
}

/**
 * Create an audit logger scoped to a specific context (contractId + userId).
 * Convenience wrapper for repeated logging within a request.
 */
export function createScopedAuditLogger(contractId: string, userId?: string) {
  return {
    log(
      action: AuditAction,
      options: Omit<Parameters<typeof logAuditEvent>[1], 'contractId' | 'userId'> = {}
    ) {
      return logAuditEvent(action, {
        ...options,
        contractId,
        userId,
      });
    },
  };
}
