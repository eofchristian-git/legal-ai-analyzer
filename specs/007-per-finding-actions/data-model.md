# Data Model: Per-Finding Decision Actions

**Feature**: 007-per-finding-actions
**Date**: 2026-02-17

## Schema Changes

### Modified: `ClauseDecision`

**Change**: Add nullable `findingId` foreign key to `AnalysisFinding`. Nullable at schema level for legacy records; API enforces non-null for all new decisions.

```prisma
model ClauseDecision {
  id         String         @id @default(cuid())
  clauseId   String
  findingId  String?        // Required for new decisions; null only for legacy clause-level records
  userId     String
  actionType String         // ACCEPT_DEVIATION | APPLY_FALLBACK | EDIT_MANUAL | ESCALATE | ADD_NOTE | UNDO | REVERT
  timestamp  DateTime       @default(now())
  payload    String         // JSON

  clause     AnalysisClause   @relation(fields: [clauseId], references: [id], onDelete: Cascade)
  finding    AnalysisFinding? @relation(fields: [findingId], references: [id], onDelete: SetNull)
  user       User             @relation("ClauseDecisions", fields: [userId], references: [id])

  @@index([clauseId, timestamp])
  @@index([clauseId, findingId, timestamp]) // For finding-level projection queries
  @@index([clauseId])
}
```

**New fields:**
| Field | Type | Nullable | Default | Description |
|-------|------|----------|---------|-------------|
| `findingId` | String | Yes (schema) | null | FK to AnalysisFinding. Required for new decisions (enforced by API). Null only for legacy clause-level records from Feature 006. |

**New indexes:**
| Index | Fields | Purpose |
|-------|--------|---------|
| Composite | `[clauseId, findingId, timestamp]` | Efficient per-finding decision queries for projection |

**FK behavior:**
- `onDelete: SetNull` — if a finding is deleted, its decisions remain as historical records (findingId becomes null, same as legacy)

### Modified: `AnalysisFinding`

**Change**: Add reverse relation to `ClauseDecision`.

```prisma
model AnalysisFinding {
  // ... existing fields unchanged ...

  decisions  ClauseDecision[] // NEW: reverse relation
}
```

No new columns — only a Prisma relation field for type safety and includes.

## Migration Strategy

1. **Add column**: `findingId String?` to `ClauseDecision` (nullable, no default needed)
2. **Add FK constraint**: Reference to `AnalysisFinding.id` with `ON DELETE SET NULL`
3. **Add index**: `[clauseId, findingId, timestamp]` composite index
4. **No data migration**: Existing records keep `findingId = null` (legacy display-only records)

**Command**: `npx prisma db push` (per project convention for non-interactive environments)

## Type Changes

### New: `FindingStatusValue`

```typescript
type FindingStatusValue =
  | 'PENDING'                    // No finding-level decision yet (or all decisions undone/reverted)
  | 'ACCEPTED'                   // Finding deviation accepted
  | 'ESCALATED'                  // Finding escalated to approver
  | 'RESOLVED_APPLIED_FALLBACK'  // Finding's fallback text applied
  | 'RESOLVED_MANUAL_EDIT';      // Finding manually edited
```

### New: `FindingStatusEntry`

```typescript
interface FindingStatusEntry {
  status: FindingStatusValue;
  escalatedTo: string | null;      // userId of assigned approver
  escalatedToName: string | null;  // Display name of approver
  noteCount: number;               // Number of ADD_NOTE decisions for this finding
  lastActionType: DecisionActionType | null;
  lastActionTimestamp: Date | null;
}
```

### New: `DerivedClauseStatus`

```typescript
type DerivedClauseStatus =
  | 'PENDING'             // No findings resolved
  | 'PARTIALLY_RESOLVED'  // Some findings resolved, some pending
  | 'RESOLVED'            // All findings resolved
  | 'ESCALATED'           // Any finding is escalated (takes visual priority)
  | 'NO_ISSUES';          // Clause has zero findings
```

### Extended: `ProjectionResult`

```typescript
interface ProjectionResult {
  // Existing fields
  clauseId: string;
  originalText: string;
  effectiveText: string;
  trackedChanges: TrackedChange[];
  lastDecisionTimestamp: Date | null;
  decisionCount: number;

  // CHANGED: now derived from finding statuses
  effectiveStatus: DerivedClauseStatus;

  // NEW: resolution tracking
  resolvedCount: number;
  totalFindingCount: number;

  // NEW: per-finding status map
  findingStatuses: Record<string, FindingStatusEntry>;

  // KEPT: escalation info (from first/most-recent escalated finding)
  escalatedToUserId: string | null;
  escalatedToUserName: string | null;
  escalationReason: string | null;
  hasUnresolvedEscalation: boolean;
}
```

## State Transitions (Per-Finding)

```
PENDING ──── ACCEPT_DEVIATION ────→ ACCEPTED
PENDING ──── APPLY_FALLBACK ──────→ RESOLVED_APPLIED_FALLBACK
PENDING ──── EDIT_MANUAL ─────────→ RESOLVED_MANUAL_EDIT
PENDING ──── ESCALATE ────────────→ ESCALATED
PENDING ──── ADD_NOTE ────────────→ PENDING (no status change)

ACCEPTED ─── UNDO ───────────────→ PENDING
ESCALATED ── UNDO ───────────────→ PENDING
RESOLVED ─── UNDO ───────────────→ PENDING

Any state ── REVERT ─────────────→ PENDING (all finding's decisions marked inactive)
```

### Derived Clause Status Rules

```
totalFindingCount === 0           → NO_ISSUES
any finding ESCALATED             → ESCALATED
all findings resolved             → RESOLVED
some findings resolved            → PARTIALLY_RESOLVED
no findings resolved              → PENDING
```

## Validation Rules

1. All new decisions MUST include a `findingId`. The API returns 400 if missing.
2. `findingId` MUST reference an existing `AnalysisFinding` that belongs to the same clause (`finding.clauseId === clauseId`). Returns 404/400 otherwise.
3. UNDO: The `undoneDecisionId` MUST reference a decision with the same `findingId`
4. REVERT: Creates a REVERT event scoped to the specified `findingId`, marking all that finding's prior decisions as inactive during projection replay
5. ESCALATE: Lock only applies to that specific finding; other findings remain actionable
6. Legacy records (`findingId = null`): Ignored by projection engine; displayed as "Legacy" in decision history
