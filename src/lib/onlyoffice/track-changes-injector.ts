/**
 * ONLYOFFICE Track Changes Injector Utility
 * Feature 009 T022: Map ClauseDecision events to ONLYOFFICE tracked changes
 * with user attribution, timestamps, and per-user color coding
 */

import type { TrackChangeData, TrackChangeInjectionResult, DecisionActionType } from '@/types/onlyoffice';
import type { OOConnector } from '@/app/(app)/contracts/[id]/_components/onlyoffice-viewer/onlyoffice-document-viewer';

// ─── Promise wrapper ──────────────────────────────────────────────────────────

/**
 * Wrap the callback-based ONLYOFFICE executeMethod in a Promise.
 */
function execMethod<T = unknown>(
  connector: OOConnector,
  method: string,
  args?: unknown[]
): Promise<T> {
  return new Promise<T>((resolve) => {
    connector.executeMethod(method, args ?? [], (result) => resolve(result as T));
  });
}

// ─── Decision Type Mapping ───────────────────────────────────────────────────

export function producesTrackChange(actionType: DecisionActionType): boolean {
  return actionType === 'APPLY_FALLBACK' || actionType === 'EDIT_MANUAL';
}

// ─── Track Change Payload Builder ────────────────────────────────────────────

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

export async function enableTrackChanges(connector: OOConnector): Promise<void> {
  try {
    await execMethod(connector, 'StartTrackChanges');
    await execMethod(connector, 'SetTrackChangesDisplay', [{ mode: 'markup' }]);
  } catch (error) {
    console.error('[TrackChanges] Failed to enable track changes:', error);
  }
}

export async function disableTrackChangesDisplay(connector: OOConnector): Promise<void> {
  try {
    await execMethod(connector, 'SetTrackChangesDisplay', [{ mode: 'final' }]);
  } catch (error) {
    console.error('[TrackChanges] Failed to disable track changes display:', error);
  }
}

async function injectSingleChange(
  connector: OOConnector,
  change: TrackChangeData
): Promise<TrackChangeInjectionResult> {
  if (!producesTrackChange(change.actionType)) {
    return {
      decisionId: change.decisionId,
      success: true,
      error: `Action type ${change.actionType} does not produce track changes`,
    };
  }

  try {
    const payload = buildTrackChangePayload(change);
    await execMethod(connector, 'SearchAndReplace', [payload]);

    return { decisionId: change.decisionId, success: true };
  } catch (error) {
    console.error(`[TrackChanges] Failed to inject change ${change.decisionId}:`, error);
    return {
      decisionId: change.decisionId,
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

export async function injectTrackedChanges(
  connector: OOConnector,
  changes: TrackChangeData[]
): Promise<TrackChangeInjectionResult[]> {
  const results: TrackChangeInjectionResult[] = [];

  const applicableChanges = changes.filter((c) => producesTrackChange(c.actionType));
  if (applicableChanges.length === 0) return results;

  await enableTrackChanges(connector);

  for (const change of applicableChanges) {
    const result = await injectSingleChange(connector, change);
    results.push(result);
    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  return results;
}
