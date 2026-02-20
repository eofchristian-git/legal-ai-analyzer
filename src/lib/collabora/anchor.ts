/**
 * Collabora Clause Anchor Utilities
 * Feature 011 T004: UNO command builders for named bookmark insertion and navigation.
 *
 * V2 Validation result (T002): ❌ FAILED
 * .uno:InsertBookmark is a DIALOG-BASED command in Collabora Online. When dispatched
 * via Send_UNO_Command postMessage, it opens the native "Insert Bookmark" dialog UI
 * to the user instead of silently inserting a bookmark. This breaks the read-only
 * viewer experience. There is no non-dialog programmatic alternative available via
 * the Collabora postMessage channel.
 *
 * All bookmark functions are NO-OPS that log a warning. Callers (use-clause-highlighting,
 * use-clause-navigation) fall back to the enhanced text-search navigation implemented
 * in navigation.ts (T005 normalizations).
 */

// ─── Anchor Naming ────────────────────────────────────────────────────────────

/**
 * Return the canonical bookmark name for a clause.
 * Format: 'clause-{clauseId}'
 * Retained for potential future use if Collabora adds silent bookmark insertion.
 */
export function clauseAnchorName(clauseId: string): string {
  return `clause-${clauseId}`;
}

// ─── UNO Command Message Builders (NO-OPS — V2 FAILED) ──────────────────────

/**
 * NO-OP: .uno:InsertBookmark opens a dialog in Collabora Online.
 * Returns null. Callers must check for null and skip sending.
 */
export function buildInsertBookmarkMessage(clauseId: string): null {
  console.warn(
    `[Collabora Anchor] InsertBookmark is a dialog command — skipping bookmark for clause ${clauseId}. ` +
    `Using text-search navigation fallback.`
  );
  return null;
}

/**
 * NO-OP: .uno:GoToBookmark depends on bookmarks being inserted (which failed).
 * Returns null. Callers must check for null and fall back to text search.
 */
export function buildGoToBookmarkMessage(clauseId: string): null {
  console.warn(
    `[Collabora Anchor] GoToBookmark unavailable — no bookmarks embedded for clause ${clauseId}. ` +
    `Using text-search navigation fallback.`
  );
  return null;
}
