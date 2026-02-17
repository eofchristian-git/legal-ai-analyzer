/**
 * Type Definitions: Clause Decision Actions & Undo System
 * Feature 006
 * 
 * Centralized type definitions for decision workflows, projections, and tracked changes.
 */

// ============================================================================
// Decision Action Types (matching database actionType values)
// ============================================================================

export const DecisionActionType = {
  ACCEPT_DEVIATION: 'ACCEPT_DEVIATION',
  APPLY_FALLBACK: 'APPLY_FALLBACK',
  EDIT_MANUAL: 'EDIT_MANUAL',
  ESCALATE: 'ESCALATE',
  ADD_NOTE: 'ADD_NOTE',
  UNDO: 'UNDO',
  REVERT: 'REVERT',
} as const;

export type DecisionActionType = typeof DecisionActionType[keyof typeof DecisionActionType];

// ============================================================================
// Clause Status (computed by projection engine)
// ============================================================================

export const ClauseStatus = {
  DEVIATION_DETECTED: 'DEVIATION_DETECTED',       // Initial state
  ACCEPTED: 'ACCEPTED',                           // Reviewer accepted deviation
  RESOLVED_APPLIED_FALLBACK: 'RESOLVED_APPLIED_FALLBACK', // Replaced with playbook language
  RESOLVED_MANUAL_EDIT: 'RESOLVED_MANUAL_EDIT',   // Manually edited
  ESCALATED: 'ESCALATED',                         // Escalated to approver
  NO_DEVIATION: 'NO_DEVIATION',                   // No findings (v2 format only)
} as const;

export type ClauseStatus = typeof ClauseStatus[keyof typeof ClauseStatus];

// ============================================================================
// Permission Types (RBAC)
// ============================================================================

export const Permission = {
  REVIEW_CONTRACTS: 'REVIEW_CONTRACTS',
  APPROVE_ESCALATIONS: 'APPROVE_ESCALATIONS',
  MANAGE_USERS: 'MANAGE_USERS',
  MANAGE_PLAYBOOK: 'MANAGE_PLAYBOOK',
} as const;

export type Permission = typeof Permission[keyof typeof Permission];

// ============================================================================
// Decision Payloads (JSON data for each action type)
// ============================================================================

export interface AcceptDeviationPayload {
  comment?: string;
  isAdminOverride?: boolean;
}

export interface ApplyFallbackPayload {
  replacementText: string;
  source: 'fallback' | 'preferred';
  playbookRuleId: string;
  isAdminOverride?: boolean;
}

export interface EditManualPayload {
  replacementText: string;
  isAdminOverride?: boolean;
}

export interface EscalatePayload {
  reason: 'Exceeds tolerance' | 'Commercial impact' | 'Regulatory' | 'Other';
  comment: string;
  assigneeId: string;
  reassignedByAdminId?: string;
}

export interface AddNotePayload {
  noteText: string;
}

export interface UndoPayload {
  undoneDecisionId: string;
}

export interface RevertPayload {
  // Empty - REVERT has no additional data
}

export type ClauseDecisionPayload =
  | AcceptDeviationPayload
  | ApplyFallbackPayload
  | EditManualPayload
  | EscalatePayload
  | AddNotePayload
  | UndoPayload
  | RevertPayload;

// ============================================================================
// ClauseDecision Entity (with parsed payload)
// ============================================================================

export interface ClauseDecision {
  id: string;
  clauseId: string;
  userId: string;
  actionType: DecisionActionType;
  timestamp: Date;
  payload: ClauseDecisionPayload;
  
  // Optional relations
  user?: {
    id: string;
    name: string;
    email: string;
  };
}

// ============================================================================
// Projection Result (computed clause state)
// ============================================================================

export interface ProjectionResult {
  clauseId: string;
  originalText: string | null;
  effectiveText: string | null;
  effectiveStatus: ClauseStatus;
  trackedChanges: TrackedChange[];
  decisionCount: number;
  lastDecisionTimestamp: Date | null;
  escalatedToUserId: string | null;
  escalatedToUserName: string | null;
  escalationReason: string | null;
  hasUnresolvedEscalation: boolean;
}

// ============================================================================
// Tracked Changes (text diff representation)
// ============================================================================

export interface TrackedChange {
  type: 'delete' | 'insert' | 'equal';
  text: string;
}

// ============================================================================
// API Request/Response Types
// ============================================================================

export interface ApplyDecisionRequest {
  actionType: DecisionActionType;
  payload: ClauseDecisionPayload;
  clauseUpdatedAtWhenLoaded?: string; // ISO timestamp for conflict detection
}

export interface ApplyDecisionResponse {
  success: boolean;
  decision: ClauseDecision;
  projection: ProjectionResult;
  conflictWarning?: {
    message: string;
    lastUpdatedAt: string;
    lastUpdatedBy: string;
  };
}

export interface GetDecisionHistoryResponse {
  decisions: ClauseDecision[];
}

export interface GetProjectionResponse {
  projection: ProjectionResult;
  cached: boolean;
}

// ============================================================================
// Utility Types
// ============================================================================

export interface ConflictDetectionResult {
  hasConflict: boolean;
  message?: string;
  lastUpdatedAt?: Date;
  lastUpdatedBy?: string;
}
