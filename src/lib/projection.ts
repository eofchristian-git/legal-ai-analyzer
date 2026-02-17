/**
 * Projection Engine: Compute Effective Clause State (Finding-Level)
 * Feature 007: Per-Finding Decision Actions
 *
 * Rewrites Feature 006 clause-level projection to finding-level.
 * All decisions are scoped to individual findings. Clause status is
 * derived by aggregating finding statuses.
 *
 * Legacy decisions (findingId=null from Feature 006) are filtered out
 * of projection computation and preserved as display-only history.
 */

import { db } from '@/lib/db';
import {
  ClauseDecisionPayload,
  DecisionActionType,
  DerivedClauseStatus,
  FindingStatusEntry,
  FindingStatusValue,
  ProjectionResult,
  TrackedChange,
  ApplyFallbackPayload,
  EditManualPayload,
  EscalatePayload,
  AddNotePayload,
  UndoPayload,
} from '@/types/decisions';
import { computeTrackedChanges } from './tracked-changes';

interface RawDecision {
  id: string;
  clauseId: string;
  findingId: string | null;
  userId: string;
  actionType: string;
  timestamp: Date;
  payload: string;
  user: { id: string; name: string; email: string };
}

interface ParsedDecision {
  id: string;
  clauseId: string;
  findingId: string | null;
  userId: string;
  actionType: DecisionActionType;
  timestamp: Date;
  payload: ClauseDecisionPayload;
  user: { id: string; name: string; email: string };
}

/**
 * Compute per-finding statuses from a group of decisions for one finding.
 * Handles UNDO (marks referenced decision as undone) and REVERT (resets all).
 */
function replayFindingDecisions(
  decisions: ParsedDecision[],
  escalationNames: Map<string, string>
): FindingStatusEntry {
  // Build undone set and find last REVERT
  const undoneIds = new Set<string>();
  let lastRevertIndex = -1;

  for (let i = 0; i < decisions.length; i++) {
    const d = decisions[i];
    if (d.actionType === DecisionActionType.UNDO) {
      const payload = d.payload as UndoPayload;
      undoneIds.add(payload.undoneDecisionId);
    }
    if (d.actionType === DecisionActionType.REVERT) {
      lastRevertIndex = i;
    }
  }

  // Only replay decisions after last REVERT
  const toReplay = lastRevertIndex >= 0 ? decisions.slice(lastRevertIndex + 1) : decisions;

  let status: FindingStatusValue = FindingStatusValue.PENDING;
  let escalatedTo: string | null = null;
  let escalatedToName: string | null = null;
  let escalationReason: string | null = null;
  let escalationComment: string | null = null;
  let noteCount = 0;
  const notes: Array<{ text: string; timestamp: Date; userName: string }> = [];
  let lastActionType: DecisionActionType | null = null;
  let lastActionTimestamp: Date | null = null;

  for (const d of toReplay) {
    if (undoneIds.has(d.id) ||
        d.actionType === DecisionActionType.UNDO ||
        d.actionType === DecisionActionType.REVERT) {
      continue;
    }

    switch (d.actionType) {
      case DecisionActionType.ACCEPT_DEVIATION:
        status = FindingStatusValue.ACCEPTED;
        escalatedTo = null;
        escalatedToName = null;
        escalationReason = null;
        escalationComment = null;
        break;
      case DecisionActionType.APPLY_FALLBACK:
        status = FindingStatusValue.RESOLVED_APPLIED_FALLBACK;
        escalatedTo = null;
        escalatedToName = null;
        escalationReason = null;
        escalationComment = null;
        break;
      case DecisionActionType.EDIT_MANUAL:
        status = FindingStatusValue.RESOLVED_MANUAL_EDIT;
        escalatedTo = null;
        escalatedToName = null;
        escalationReason = null;
        escalationComment = null;
        break;
      case DecisionActionType.ESCALATE: {
        const payload = d.payload as EscalatePayload;
        status = FindingStatusValue.ESCALATED;
        escalatedTo = payload.assigneeId;
        escalatedToName = escalationNames.get(payload.assigneeId) ?? 'Unknown User';
        escalationReason = payload.reason;
        escalationComment = payload.comment;
        break;
      }
      case DecisionActionType.ADD_NOTE: {
        const payload = d.payload as AddNotePayload;
        noteCount++;
        notes.push({
          text: payload.noteText,
          timestamp: d.timestamp,
          userName: d.user.name,
        });
        // Notes don't change status — skip lastActionType update below
        continue;
      }
      default:
        continue;
    }

    lastActionType = d.actionType;
    lastActionTimestamp = d.timestamp;
  }

  // Count notes separately (they're active even after REVERT skips them, but we
  // already only count in toReplay which excludes pre-revert)
  return {
    status,
    escalatedTo,
    escalatedToName,
    escalationReason,
    escalationComment,
    noteCount,
    notes,
    lastActionType,
    lastActionTimestamp,
  };
}

/**
 * Derive clause-level status from finding statuses.
 */
export function deriveClauseStatus(
  findingStatuses: Record<string, FindingStatusEntry>,
  totalFindingCount: number
): DerivedClauseStatus {
  if (totalFindingCount === 0) return DerivedClauseStatus.NO_ISSUES;

  const entries = Object.values(findingStatuses);
  const resolvedStatuses: FindingStatusValue[] = [
    FindingStatusValue.ACCEPTED,
    FindingStatusValue.RESOLVED_APPLIED_FALLBACK,
    FindingStatusValue.RESOLVED_MANUAL_EDIT,
  ];

  const resolvedCount = entries.filter(e => resolvedStatuses.includes(e.status)).length;
  const hasEscalated = entries.some(e => e.status === FindingStatusValue.ESCALATED);

  if (hasEscalated) return DerivedClauseStatus.ESCALATED;
  if (resolvedCount === totalFindingCount) return DerivedClauseStatus.RESOLVED;
  if (resolvedCount > 0) return DerivedClauseStatus.PARTIALLY_RESOLVED;
  return DerivedClauseStatus.PENDING;
}

/**
 * Compute projection for a clause using finding-level decisions.
 *
 * Algorithm:
 * 1. Fetch clause with findings and all decisions
 * 2. Filter out legacy decisions (findingId=null)
 * 3. Group finding-level decisions by findingId
 * 4. Replay each finding's decisions independently
 * 5. Compute effective text via last-write-wins across all active text-modifying decisions
 * 6. Derive clause status from finding statuses
 * 7. Return ProjectionResult
 */
export async function computeProjection(clauseId: string): Promise<ProjectionResult> {
  const startTime = Date.now();

  // Fetch clause with findings
  const clause = await db.analysisClause.findUnique({
    where: { id: clauseId },
    select: {
      id: true,
      originalText: true,
      clauseText: true,
      findings: {
        select: { id: true },
      },
    },
  });

  if (!clause) {
    throw new Error(`Clause ${clauseId} not found`);
  }

  const originalText = clause.originalText ?? clause.clauseText ?? null;
  const findingIds = clause.findings.map(f => f.id);
  const totalFindingCount = findingIds.length;

  // Fetch all decisions for this clause
  const rawDecisions: RawDecision[] = await db.clauseDecision.findMany({
    where: { clauseId },
    orderBy: { timestamp: 'asc' },
    include: {
      user: {
        select: { id: true, name: true, email: true },
      },
    },
  });

  // Parse and filter: only finding-level decisions for projection
  const allParsed: ParsedDecision[] = rawDecisions.map(d => ({
    id: d.id,
    clauseId: d.clauseId,
    findingId: d.findingId,
    userId: d.userId,
    actionType: d.actionType as DecisionActionType,
    timestamp: d.timestamp,
    payload: JSON.parse(d.payload) as ClauseDecisionPayload,
    user: d.user,
  }));

  const findingDecisions = allParsed.filter(d => d.findingId !== null);

  // Group decisions by findingId
  const decisionsByFinding = new Map<string, ParsedDecision[]>();
  for (const d of findingDecisions) {
    const fid = d.findingId!;
    if (!decisionsByFinding.has(fid)) {
      decisionsByFinding.set(fid, []);
    }
    decisionsByFinding.get(fid)!.push(d);
  }

  // Pre-fetch escalation assignee names
  const assigneeIds = new Set<string>();
  for (const d of findingDecisions) {
    if (d.actionType === DecisionActionType.ESCALATE) {
      const payload = d.payload as EscalatePayload;
      assigneeIds.add(payload.assigneeId);
    }
  }
  const escalationNames = new Map<string, string>();
  if (assigneeIds.size > 0) {
    const assignees = await db.user.findMany({
      where: { id: { in: Array.from(assigneeIds) } },
      select: { id: true, name: true },
    });
    for (const a of assignees) {
      escalationNames.set(a.id, a.name);
    }
  }

  // Compute per-finding statuses
  const findingStatuses: Record<string, FindingStatusEntry> = {};
  for (const fid of findingIds) {
    const decisions = decisionsByFinding.get(fid) ?? [];
    findingStatuses[fid] = replayFindingDecisions(decisions, escalationNames);
  }

  // Compute effective text: last-write-wins across ALL active text-modifying decisions
  let effectiveText = originalText;
  {
    // Collect all finding-level decisions, build global undone set
    const globalUndone = new Set<string>();
    const globalReverts = new Map<string, number>(); // findingId -> last revert index in findingDecisions

    for (const d of findingDecisions) {
      if (d.actionType === DecisionActionType.UNDO) {
        const payload = d.payload as UndoPayload;
        globalUndone.add(payload.undoneDecisionId);
      }
    }

    // Build per-finding last revert index
    for (const [fid, decisions] of decisionsByFinding) {
      for (let i = 0; i < decisions.length; i++) {
        if (decisions[i].actionType === DecisionActionType.REVERT) {
          globalReverts.set(fid, i);
        }
      }
    }

    // Find last active text-modifying decision across all findings (chronologically)
    const textModifyingTypes: string[] = [DecisionActionType.APPLY_FALLBACK, DecisionActionType.EDIT_MANUAL];
    let lastTextDecision: ParsedDecision | null = null;

    for (const d of findingDecisions) {
      if (!textModifyingTypes.includes(d.actionType)) continue;
      if (globalUndone.has(d.id)) continue;

      // Check if this decision is before its finding's last REVERT
      const fid = d.findingId!;
      const findingDecs = decisionsByFinding.get(fid) ?? [];
      const lastRevertIdx = globalReverts.get(fid) ?? -1;
      if (lastRevertIdx >= 0) {
        const dIndexInFinding = findingDecs.indexOf(d);
        if (dIndexInFinding <= lastRevertIdx) continue;
      }

      lastTextDecision = d;
    }

    if (lastTextDecision) {
      const payload = lastTextDecision.payload as ApplyFallbackPayload | EditManualPayload;
      effectiveText = payload.replacementText;
    }
  }

  // Derive clause status
  const resolvedStatuses: FindingStatusValue[] = [
    FindingStatusValue.ACCEPTED,
    FindingStatusValue.RESOLVED_APPLIED_FALLBACK,
    FindingStatusValue.RESOLVED_MANUAL_EDIT,
  ];
  const resolvedCount = Object.values(findingStatuses)
    .filter(e => resolvedStatuses.includes(e.status)).length;

  const effectiveStatus = deriveClauseStatus(findingStatuses, totalFindingCount);

  // Escalation info from the most recent escalated finding
  let escalatedToUserId: string | null = null;
  let escalatedToUserName: string | null = null;
  let escalationReason: string | null = null;
  const hasUnresolvedEscalation = Object.values(findingStatuses)
    .some(e => e.status === FindingStatusValue.ESCALATED);

  if (hasUnresolvedEscalation) {
    // Find the most recent escalation across all findings
    for (const d of [...findingDecisions].reverse()) {
      if (d.actionType === DecisionActionType.ESCALATE && d.findingId) {
        const fStatus = findingStatuses[d.findingId];
        if (fStatus?.status === FindingStatusValue.ESCALATED) {
          const payload = d.payload as EscalatePayload;
          escalatedToUserId = payload.assigneeId;
          escalatedToUserName = escalationNames.get(payload.assigneeId) ?? 'Unknown User';
          escalationReason = payload.reason;
          break;
        }
      }
    }
  }

  // Compute tracked changes
  const trackedChanges: TrackedChange[] = computeTrackedChanges(originalText, effectiveText);

  // Count active decisions (non-legacy, non-undone, non-meta)
  const activeCount = findingDecisions.filter(d =>
    d.actionType !== DecisionActionType.UNDO &&
    d.actionType !== DecisionActionType.REVERT
  ).length;

  const lastDecisionTimestamp = findingDecisions.length > 0
    ? findingDecisions[findingDecisions.length - 1].timestamp
    : null;

  const projection: ProjectionResult = {
    clauseId,
    originalText,
    effectiveText,
    effectiveStatus,
    trackedChanges,
    decisionCount: activeCount,
    lastDecisionTimestamp,
    escalatedToUserId,
    escalatedToUserName,
    escalationReason,
    hasUnresolvedEscalation,
    findingStatuses,
    resolvedCount,
    totalFindingCount,
  };

  const duration = Date.now() - startTime;
  console.log(
    `[projection] Computed finding-level projection for clause ${clauseId} in ${duration}ms ` +
    `(${rawDecisions.length} total decisions, ${findingDecisions.length} finding-level, ` +
    `${totalFindingCount} findings, ${resolvedCount}/${totalFindingCount} resolved)`
  );

  return projection;
}

/**
 * Helper: Get active (non-undone) decisions for a clause.
 * Includes both legacy and finding-level decisions for history display.
 */
export async function getActiveDecisions(clauseId: string) {
  const rawDecisions = await db.clauseDecision.findMany({
    where: { clauseId },
    orderBy: { timestamp: 'asc' },
    include: {
      user: {
        select: { id: true, name: true, email: true },
      },
    },
  });

  const decisions = rawDecisions.map(d => ({
    id: d.id,
    clauseId: d.clauseId,
    findingId: d.findingId,
    userId: d.userId,
    actionType: d.actionType as DecisionActionType,
    timestamp: d.timestamp,
    payload: JSON.parse(d.payload) as ClauseDecisionPayload,
    user: d.user,
  }));

  // Build set of undone decision IDs
  const undoneIds = new Set<string>();
  for (const d of decisions) {
    if (d.actionType === DecisionActionType.UNDO) {
      const payload = d.payload as UndoPayload;
      undoneIds.add(payload.undoneDecisionId);
    }
  }

  return decisions.filter(d => !undoneIds.has(d.id));
}
