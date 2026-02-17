# API Contracts: Per-Finding Decision Actions

**Feature**: 007-per-finding-actions
**Date**: 2026-02-17

## Modified Endpoints

### POST /api/clauses/[id]/decisions

**Change**: `findingId` is now **required** (not optional). All decisions are finding-level.

#### Request Body

```typescript
interface ApplyDecisionRequest {
  actionType: DecisionActionType;
  payload: ClauseDecisionPayload;
  clauseUpdatedAtWhenLoaded: string;  // ISO 8601 timestamp for conflict detection
  findingId: string;                  // REQUIRED — must reference a valid finding in this clause
}
```

#### Validation Changes

| Field | Rule | Error |
|-------|------|-------|
| `findingId` | Must be present (non-null, non-empty) | 400: `"findingId is required for all decisions"` |
| `findingId` | Must reference an existing `AnalysisFinding` | 404: `"Finding not found"` |
| `findingId` | Finding must belong to the same clause | 400: `"Finding does not belong to this clause"` |
| `findingId` + UNDO | `undoneDecisionId` must reference a decision with same `findingId` | 400: `"Cannot undo a decision from a different finding"` |

#### Escalation Lock (Finding-Scoped)

```
For each decision request:
  Check if THIS FINDING is escalated (via findingStatuses)
  If escalated → block non-approver decisions on THIS finding only
  Other findings remain actionable regardless
```

#### Response (shape unchanged)

```typescript
interface ApplyDecisionResponse {
  decision: ClauseDecision;        // Now always includes findingId
  projection: ProjectionResult;    // Includes findingStatuses + derived clause status
  conflictWarning?: string;
}
```

#### Examples

**Accept Finding A:**
```json
POST /api/clauses/clause-123/decisions
{
  "actionType": "ACCEPT_DEVIATION",
  "findingId": "finding-abc",
  "payload": { "comment": "Business approved" },
  "clauseUpdatedAtWhenLoaded": "2026-02-17T10:00:00Z"
}
```

**Apply Finding B's Fallback:**
```json
POST /api/clauses/clause-123/decisions
{
  "actionType": "APPLY_FALLBACK",
  "findingId": "finding-xyz",
  "payload": {
    "replacementText": "Liability capped at $1,000,000",
    "source": "fallback",
    "playbookRuleId": "rule-789"
  },
  "clauseUpdatedAtWhenLoaded": "2026-02-17T10:05:00Z"
}
```

**Undo Finding A's Last Decision:**
```json
POST /api/clauses/clause-123/decisions
{
  "actionType": "UNDO",
  "findingId": "finding-abc",
  "payload": { "undoneDecisionId": "decision-999" },
  "clauseUpdatedAtWhenLoaded": "2026-02-17T10:10:00Z"
}
```

**Revert Finding A (all its decisions inactive):**
```json
POST /api/clauses/clause-123/decisions
{
  "actionType": "REVERT",
  "findingId": "finding-abc",
  "payload": {},
  "clauseUpdatedAtWhenLoaded": "2026-02-17T10:15:00Z"
}
```

**Accept All Findings (client-side loop):**
```
For each finding in clause.findings where finding is unresolved and not escalated:
  POST /api/clauses/clause-123/decisions
  {
    "actionType": "ACCEPT_DEVIATION",
    "findingId": finding.id,
    "payload": { "comment": "Bulk accept" },
    "clauseUpdatedAtWhenLoaded": "..."
  }
```

**Reset All Findings (client-side loop):**
```
For each finding in clause.findings that has active decisions:
  POST /api/clauses/clause-123/decisions
  {
    "actionType": "REVERT",
    "findingId": finding.id,
    "payload": {},
    "clauseUpdatedAtWhenLoaded": "..."
  }
```

Note: "Accept All" and "Reset All" are client-side operations sending N individual requests. No batch endpoint needed.

---

### GET /api/clauses/[id]/projection

**Change**: Response includes `findingStatuses`, `resolvedCount`, `totalFindingCount`, and derived `effectiveStatus`.

#### Response

```typescript
interface GetProjectionResponse {
  projection: {
    clauseId: string;
    originalText: string;
    effectiveText: string;
    effectiveStatus: DerivedClauseStatus; // PENDING | PARTIALLY_RESOLVED | RESOLVED | ESCALATED | NO_ISSUES
    trackedChanges: TrackedChange[];
    decisionCount: number;
    lastDecisionTimestamp: string | null;  // ISO 8601

    // NEW: resolution tracking
    resolvedCount: number;
    totalFindingCount: number;

    // Escalation info (from most recent escalated finding, if any)
    escalatedToUserId: string | null;
    escalatedToUserName: string | null;
    escalationReason: string | null;
    hasUnresolvedEscalation: boolean;

    // NEW: per-finding status map
    findingStatuses: {
      [findingId: string]: {
        status: 'PENDING' | 'ACCEPTED' | 'ESCALATED' | 'RESOLVED_APPLIED_FALLBACK' | 'RESOLVED_MANUAL_EDIT';
        escalatedTo: string | null;
        escalatedToName: string | null;
        noteCount: number;
        lastActionType: string | null;
        lastActionTimestamp: string | null;  // ISO 8601
      };
    };
  };
  cached: boolean;
}
```

**Notes:**
- `findingStatuses` includes entries for ALL findings in the clause, including those with no decisions (status: PENDING)
- `resolvedCount` / `totalFindingCount` enables the `{resolved}/{total}` display in the clause list
- Legacy decisions (findingId=null) do NOT affect the projection computation

---

### GET /api/clauses/[id]/decisions

**Change**: Response items include `findingId` and finding info. Legacy records have null findingId.

#### Response

```typescript
interface GetDecisionsResponse {
  decisions: Array<{
    id: string;
    clauseId: string;
    findingId: string | null;        // null for legacy clause-level records
    userId: string;
    actionType: string;
    timestamp: string;               // ISO 8601
    payload: object;                 // Parsed JSON
    user: { id: string; name: string; role: string };
    finding?: {                      // Included when findingId is present
      id: string;
      riskLevel: string;
      matchedRuleTitle: string;
    } | null;
    isLegacy: boolean;               // NEW: true when findingId is null (Feature 006 record)
  }>;
}
```

---

## No New Endpoints Required

The existing three endpoints (POST decisions, GET projection, GET decisions) are sufficient. "Accept All" and "Reset All" are client-side loops.
