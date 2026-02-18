/**
 * ONLYOFFICE Track Changes Injector Utility
 * Feature 009 T022: Map ClauseDecision events to ONLYOFFICE tracked changes
 * with user attribution, timestamps, and per-user color coding
 */

import type { TrackChangeData, TrackChangeInjectionResult, DecisionActionType } from '@/types/onlyoffice';

// ─── Decision Type Mapping ───────────────────────────────────────────────────

/**
 * Determine whether a decision action type produces tracked changes.
 *
 * | Decision Type      | Track Change Type          |
 * |--------------------|----------------------------|
 * | ACCEPT_DEVIATION   | None (no change)           |
 * | APPLY_FALLBACK     | Delete original + Insert   |
 * | EDIT_MANUAL        | Delete original + Insert   |
 * | ESCALATE           | None                       |
 * | ADD_NOTE           | None                       |
 * | UNDO               | None (reverts prior)       |
 * | REVERT             | None (reverts prior)       |
 */
export function producesTrackChange(actionType: DecisionActionType): boolean {
  return actionType === 'APPLY_FALLBACK' || actionType === 'EDIT_MANUAL';
}

// ─── Per-User Color Assignment ───────────────────────────────────────────────

const USER_COLORS = [
  '#3b82f6', // blue
  '#8b5cf6', // violet
  '#06b6d4', // cyan
  '#f59e0b', // amber
  '#ef4444', // red
  '#10b981', // emerald
  '#f97316', // orange
  '#ec4899', // pink
];

const userColorMap = new Map<string, string>();
let nextColorIndex = 0;

/**
 * Get a consistent color for a user (same user always gets same color).
 */
export function getUserColor(userId: string): string {
  if (!userColorMap.has(userId)) {
    userColorMap.set(userId, USER_COLORS[nextColorIndex % USER_COLORS.length]);
    nextColorIndex++;
  }
  return userColorMap.get(userId)!;
}

// ─── Track Change Payload Builder ────────────────────────────────────────────

/**
 * Build the ONLYOFFICE SearchAndReplace payload for a track change.
 */
export function buildTrackChangePayload(change: TrackChangeData): Record<string, unknown> {
  return {
    searchString: change.originalText,
    replaceString: change.replacementText,
    matchCase: true,
    trackChanges: true,
    author: change.author,
    date: new Date(change.timestamp),
  };
}

// ─── Injection via ONLYOFFICE Connector ──────────────────────────────────────

/**
 * Enable Track Changes mode on the ONLYOFFICE editor.
 */
export async function enableTrackChanges(
  connector: { executeMethod: (method: string, args?: unknown[]) => Promise<void> }
): Promise<void> {
  try {
    await connector.executeMethod('StartTrackChanges');
    await connector.executeMethod('SetTrackChangesDisplay', [{ mode: 'markup' }]);
  } catch (error) {
    console.error('[TrackChanges] Failed to enable track changes:', error);
  }
}

/**
 * Disable Track Changes display (show clean document).
 */
export async function disableTrackChangesDisplay(
  connector: { executeMethod: (method: string, args?: unknown[]) => Promise<void> }
): Promise<void> {
  try {
    await connector.executeMethod('SetTrackChangesDisplay', [{ mode: 'final' }]);
  } catch (error) {
    console.error('[TrackChanges] Failed to disable track changes display:', error);
  }
}

/**
 * Inject a single tracked change via the ONLYOFFICE connector.
 */
async function injectSingleChange(
  connector: { executeMethod: (method: string, args?: unknown[]) => Promise<void> },
  change: TrackChangeData
): Promise<TrackChangeInjectionResult> {
  try {
    if (!producesTrackChange(change.actionType)) {
      return {
        decisionId: change.decisionId,
        success: true,
        error: `Action type ${change.actionType} does not produce track changes`,
      };
    }

    const payload = buildTrackChangePayload(change);
    await connector.executeMethod('SearchAndReplace', [payload]);

    return {
      decisionId: change.decisionId,
      success: true,
    };
  } catch (error) {
    console.error(`[TrackChanges] Failed to inject change ${change.decisionId}:`, error);
    return {
      decisionId: change.decisionId,
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Inject multiple tracked changes from decision events.
 * Filters to only APPLY_FALLBACK and EDIT_MANUAL actions.
 */
export async function injectTrackedChanges(
  connector: { executeMethod: (method: string, args?: unknown[]) => Promise<void> },
  changes: TrackChangeData[]
): Promise<TrackChangeInjectionResult[]> {
  const results: TrackChangeInjectionResult[] = [];

  // Filter to only actions that produce changes
  const applicableChanges = changes.filter((c) => producesTrackChange(c.actionType));

  if (applicableChanges.length === 0) {
    return results;
  }

  // Enable track changes mode first
  await enableTrackChanges(connector);

  // Inject changes sequentially (order matters for text positions)
  for (const change of applicableChanges) {
    const result = await injectSingleChange(connector, change);
    results.push(result);

    // Small delay between changes to avoid race conditions
    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  return results;
}
