# Feature Specification: Per-Finding Decision Actions

**Feature Branch**: `007-per-finding-actions`
**Created**: 2026-02-17
**Status**: Draft
**Depends On**: Feature 006 (Clause Decision Actions & Undo System)
**Priority**: P2 (Post-MVP Enhancement)

---

## Executive Summary

This feature **replaces** the clause-level decision system (Feature 006) with **finding-level actions**. Instead of making decisions on an entire clause, reviewers make decisions on individual findings. Clause status is **derived automatically** — when all findings in a clause are resolved, the clause itself is marked as resolved. The left panel (clause list) reflects this resolution progress.

**Key Capability**: Reviewers resolve findings one by one. The clause list shows progress (e.g., "2/3 resolved"). When the last finding is resolved, the clause turns green — fully resolved.

---

## Problem Statement

### Current Limitation (Feature 006)

In the current implementation:
- **All decisions operate at the clause level**: When a clause has 3 findings, clicking "Accept deviation" accepts the entire clause, not a specific finding
- **"Replace with fallback" auto-selects the highest-risk finding**: Users cannot choose which finding's fallback to apply when multiple are available
- **Undo is all-or-nothing**: Undoing reverses the most recent clause-level decision, not a specific finding's action
- **Poor audit trail**: Cannot track which finding prompted which action

### Real-World Scenario

**Contract Clause**: "Indemnification - Customer shall indemnify Provider for unlimited liability with 5-day notice period"

**AI Analysis Returns 3 Findings**:
1. **Finding A (RED)**: "Unlimited liability" → Fallback: "Liability capped at $1,000,000"
2. **Finding B (YELLOW)**: "5-day notice period" → Fallback: "30-day notice period"
3. **Finding C (GREEN)**: "Minor: Use 'shall' instead of 'will'" → No fallback

**Desired Reviewer Actions**:
- Apply Finding A's fallback (critical risk) → Finding A resolved
- Accept Finding B's deviation (business approved short notice) → Finding B resolved
- Add note to Finding C (address in next contract revision) → Finding C still pending

**Clause status**: 2/3 findings resolved (shown in left panel). Once Finding C is also resolved, clause turns fully resolved.

---

## User Stories

### User Story 1: Per-Finding Accept Deviation (Priority: P2)

**As a** contract reviewer
**I want to** accept individual findings' deviations
**So that** I can approve low-risk issues while still addressing high-risk ones in the same clause

**Acceptance Criteria**:
1. **Given** a clause with 3 findings (RED, YELLOW, GREEN), **When** I click "Accept" on the YELLOW finding card, **Then** only that finding shows an "Accepted" badge and the RED/GREEN findings remain unchanged
2. **Given** I have accepted a specific finding, **When** I view the decision history, **Then** I see the acceptance tied to that specific finding with the finding's title and risk level
3. **Given** a clause with multiple accepted findings, **When** I export the contract, **Then** the audit trail clearly shows which findings were accepted and which were not

### User Story 2: Per-Finding Fallback Replacement (Priority: P2)

**As a** contract reviewer
**I want to** select which finding's fallback to apply
**So that** I can address the specific deviation I want to remediate

**Acceptance Criteria**:
1. **Given** a clause with 2 findings that both have fallback language, **When** I view the finding cards, **Then** each finding has its own "Apply Fallback" button
2. **Given** I apply Finding B's fallback, **When** the clause text is replaced, **Then** the decision history shows it was Finding B's fallback, not Finding A's
3. **Given** I apply Finding A's fallback and later apply Finding B's fallback, **When** projection runs, **Then** Finding B's text is used (last-write-wins) and history shows both decisions with timestamps

### User Story 3: Per-Finding Escalation (Priority: P2)

**As a** contract reviewer
**I want to** escalate individual high-risk findings to senior reviewers
**So that** I can get guidance on specific issues without blocking other findings

**Acceptance Criteria**:
1. **Given** a clause with RED and GREEN findings, **When** I escalate only the RED finding, **Then** the GREEN finding remains actionable while the RED finding shows "Escalated to [Approver]"
2. **Given** an escalated finding, **When** the assigned approver views the clause, **Then** they see a clear indicator of which specific finding needs their decision
3. **Given** multiple findings are escalated to different approvers, **When** viewing the clause, **Then** each finding shows its assigned approver independently

### User Story 4: Per-Finding Undo (Priority: P2)

**As a** contract reviewer
**I want to** undo my decision on a specific finding without affecting my decisions on other findings
**So that** I can correct mistakes surgically without losing work on other findings

**Acceptance Criteria**:
1. **Given** I accepted Finding A and applied Finding B's fallback, **When** I click "Undo" on Finding A's card, **Then** only Finding A's acceptance is undone and Finding B's fallback remains applied
2. **Given** a finding with 3 sequential decisions (accept → undo → escalate), **When** I view the finding's decision history, **Then** I see all 3 actions in chronological order with visual indicators for undone actions
3. **Given** I undo a text-modifying decision (fallback replacement), **When** projection recomputes, **Then** the clause text reverts to its state before that finding's decision (respecting other findings' text modifications)

### User Story 5: Per-Finding Revert to Original (Priority: P2)

**As a** contract reviewer
**I want to** revert all decisions on a specific finding back to its original state
**So that** I can start fresh on that finding without affecting other findings in the clause

**Acceptance Criteria**:
1. **Given** Finding A has 5 decisions (multiple accept/undo cycles), **When** I click "Revert to Original" on Finding A, **Then** all of Finding A's decisions are marked inactive and the finding returns to "Pending" state
2. **Given** I revert Finding A while Finding B has an active fallback applied, **When** viewing the clause, **Then** Finding B's text modification remains but Finding A's contributions are removed
3. **Given** I revert a finding, **When** viewing decision history, **Then** the revert action is logged with a timestamp and my user ID, and prior decisions show "Reverted" badges

### User Story 6: Per-Finding Internal Notes (Priority: P2)

**As a** contract reviewer
**I want to** add internal notes to specific findings
**So that** I can document context, rationale, or follow-up items for each issue independently

**Acceptance Criteria**:
1. **Given** a clause with 3 findings, **When** I add a note "Discuss with business team" to Finding B, **Then** the note appears only on Finding B's card and not on the other findings
2. **Given** multiple notes on a single finding, **When** viewing the finding card, **Then** I see all notes in chronological order with author names and timestamps
3. **Given** a finding has a note, **When** I export the contract report, **Then** the note is included in the audit trail tied to that specific finding

### User Story 7: Clause Resolution Progress (Priority: P2)

**As a** contract reviewer
**I want to** see at a glance which clauses are fully resolved, partially resolved, or unresolved
**So that** I can prioritize my review work and know when I'm done

**Acceptance Criteria**:
1. **Given** a clause with 3 findings where 2 are resolved, **When** I view the clause list (left panel), **Then** I see "2/3" resolved progress indicator on that clause
2. **Given** all findings in a clause are resolved (accepted, fallback applied, or manually edited), **When** I view the clause list, **Then** the clause shows a "Resolved" badge with green styling
3. **Given** a clause has an escalated finding, **When** I view the clause list, **Then** the clause shows an escalation indicator alongside the resolution progress
4. **Given** a clause with 0 findings (no deviations detected), **When** I view the clause list, **Then** it shows as "No issues" (auto-resolved)

### User Story 8: Accept All Findings Shortcut (Priority: P2)

**As a** contract reviewer
**I want to** quickly accept all findings in a clause at once
**So that** I can fast-track low-risk clauses without clicking each finding individually

**Acceptance Criteria**:
1. **Given** a clause with 3 unresolved findings, **When** I click "Accept All", **Then** the system creates individual finding-level ACCEPT decisions for each finding
2. **Given** I used "Accept All" and later want to change one finding, **When** I undo that specific finding, **Then** only that finding reverts while the others remain accepted
3. **Given** a clause with one escalated finding and two unresolved, **When** I click "Accept All", **Then** only the non-escalated findings are accepted (escalated finding is skipped)

---

## Clarifications

### Session 2026-02-17

- Q: When a finding is escalated, should other findings in the clause remain actionable? → A: Only the escalated finding is locked; other findings remain fully actionable.
- Q: Feature flag or direct deployment? → A: No feature flag; rely on phased deployment (schema → API → UI). No FF infrastructure needed.
- Q: Should "Accept All Findings" be included as a bulk shortcut? → A: Yes, creates individual finding-level ACCEPT decisions per finding (granular audit trail preserved). Skips escalated findings.
- Q: Clause-level vs finding-level decisions? → A: Finding-level only. No clause-level decisions. Clause status is derived from finding statuses.

---

## Requirements

### Functional Requirements

#### Core Per-Finding Actions

- **FR-001**: All decision actions (accept, escalate, note, fallback, edit, undo, revert) MUST operate at the finding level. There are no clause-level decisions.
- **FR-002**: System MUST store a required `findingId` in the `ClauseDecision` model for all new decisions
- **FR-003**: System MUST display action buttons directly on each finding card in the Findings Panel
- **FR-004**: System MUST show visual status indicators on finding cards (Accepted badge, Escalated tag, note count) reflecting the finding's current decision state
- **FR-005**: System MUST provide an "Accept All Findings" bulk action that creates individual finding-level ACCEPT decisions for each unresolved, non-escalated finding in the clause
- **FR-006**: When a finding is escalated, ONLY that finding MUST be locked for non-approver users; other findings in the same clause MUST remain fully actionable

#### Text Modification Actions

- **FR-007**: System MUST allow users to apply a specific finding's fallback via a button on that finding's card
- **FR-008**: System MUST handle multiple text-replacement decisions on the same clause using a **last-write-wins** strategy: the most recent text-modifying decision determines the effective clause text
- **FR-009**: System MUST NOT attempt to merge multiple fallback texts from different findings into a single clause (NLP complexity avoided)
- **FR-010**: System MUST store the source `findingId` with each text-replacement decision to track which finding prompted the change

#### Undo & Revert

- **FR-011**: System MUST provide a per-finding "Undo" action that reverses only the most recent active decision on that specific finding
- **FR-012**: System MUST provide a per-finding "Revert to Original" action that marks all decisions on that finding as inactive, returning it to PENDING state
- **FR-013**: System MUST provide a clause-level "Reset All" action that reverts all findings in the clause to PENDING state (creates a REVERT decision for each finding)
- **FR-014**: System MUST preserve full decision history for all finding-level actions in chronological order

#### Derived Clause Status

- **FR-015**: Clause status MUST be computed by aggregating finding statuses. A clause is:
  - **RESOLVED** when all findings have a resolved status (ACCEPTED, RESOLVED_APPLIED_FALLBACK, RESOLVED_MANUAL_EDIT)
  - **PARTIALLY_RESOLVED** when some but not all findings are resolved
  - **ESCALATED** when any finding is in ESCALATED state (takes visual priority)
  - **PENDING** when no findings have been resolved
  - **NO_ISSUES** when the clause has zero findings (no deviations detected)
- **FR-016**: System MUST compute effective clause text by replaying text-modifying decisions in chronological order (last-write-wins)
- **FR-017**: System MUST support querying projection results filtered by finding (e.g., "Is Finding A accepted?")
- **FR-018**: System MUST invalidate projection cache when any finding-level decision is applied

#### Clause List (Left Panel)

- **FR-019**: Each clause in the left panel MUST display a resolution progress indicator showing `{resolved}/{total}` findings count
- **FR-020**: Fully resolved clauses (all findings resolved) MUST show a green "Resolved" badge or checkmark
- **FR-021**: Clauses with escalated findings MUST show an escalation indicator (e.g., warning icon) alongside the progress
- **FR-022**: Clauses with zero findings MUST display as "No issues" with a distinct neutral/green style
- **FR-023**: The clause list MUST support filtering by resolution status (All, Pending, Partially Resolved, Resolved, Escalated)

#### UI/UX

- **FR-024**: System MUST render action buttons on each finding card with icons and labels (Accept, Escalate, Note, Apply Fallback if available)
- **FR-025**: System MUST display a per-finding decision history expandable section showing only that finding's decisions
- **FR-026**: System MUST update finding card badges immediately (no page reload) when a finding-level decision is applied
- **FR-027**: The existing clause-level decision buttons (decision-buttons.tsx) MUST be replaced with per-finding actions on each finding card, plus "Accept All" and "Reset All" as clause-wide shortcuts
- **FR-028**: Decision History Log MUST show which finding each decision applies to, with a filter dropdown to view one finding's history

#### Legacy Decision Migration

- **FR-029**: Existing clause-level decisions (from Feature 006, where `findingId` is null) MUST be preserved in the database as historical records
- **FR-030**: Legacy clause-level decisions MUST be displayed in the decision history with a "Legacy (clause-level)" label
- **FR-031**: Legacy decisions MUST NOT affect the new finding-level projection computation (they are display-only historical records)

### Non-Functional Requirements

- **NFR-001**: Per-finding action buttons MUST respond within 500ms
- **NFR-002**: Projection computation MUST handle finding-level decisions without performance degradation for clauses with up to 10 findings
- **NFR-003**: UI MUST remain usable on mobile devices with finding-level action buttons appropriately sized for touch
- **NFR-004**: System MUST maintain audit trail integrity: finding-level decisions MUST NOT be editable or deletable after creation

---

## Technical Approach

### Data Model Changes

#### 1. Extend `ClauseDecision` Schema

```prisma
model ClauseDecision {
  id         String         @id @default(cuid())
  clauseId   String
  findingId  String?        // Required for new decisions; null only for legacy clause-level records
  userId     String
  actionType String         // ACCEPT_DEVIATION | APPLY_FALLBACK | EDIT_MANUAL | ESCALATE | ADD_NOTE | UNDO | REVERT
  timestamp  DateTime       @default(now())
  payload    String         // JSON

  clause     AnalysisClause  @relation(fields: [clauseId], references: [id], onDelete: Cascade)
  finding    AnalysisFinding? @relation(fields: [findingId], references: [id], onDelete: SetNull)
  user       User            @relation("ClauseDecisions", fields: [userId], references: [id])

  @@index([clauseId, timestamp])
  @@index([clauseId, findingId, timestamp])
  @@index([clauseId])
}
```

Note: `findingId` is nullable at the schema level to preserve legacy records, but the API MUST reject new decisions without a `findingId`.

#### 2. Migration Strategy

- Add `findingId` as nullable field (existing records keep null — they become legacy display-only records)
- Add foreign key constraint to `AnalysisFinding` with `onDelete: SetNull`
- Add composite index `[clauseId, findingId, timestamp]` for efficient finding-level queries
- No data migration needed — legacy records are simply ignored by the new projection engine

### Projection Algorithm

```typescript
function computeProjection(clauseId: string): ProjectionResult {
  const allDecisions = await db.clauseDecision.findMany({
    where: { clauseId },
    orderBy: { timestamp: 'asc' }
  });

  // Only process finding-level decisions (skip legacy null-findingId records)
  const decisions = allDecisions.filter(d => d.findingId !== null);

  // Compute per-finding statuses
  const findingStatuses = computeFindingStatuses(decisions);

  // Compute effective text (last-write-wins for text modifications)
  const activeTextDecisions = getActiveTextDecisions(decisions);
  const effectiveText = activeTextDecisions.length > 0
    ? activeTextDecisions[activeTextDecisions.length - 1].payload.replacementText
    : originalText;

  // Derive clause status from finding statuses
  const clauseStatus = deriveClauseStatus(findingStatuses, totalFindingCount);

  return {
    clauseId,
    effectiveText,
    effectiveStatus: clauseStatus,
    findingStatuses,
    trackedChanges,
    resolvedCount,
    totalFindingCount,
    // ...
  };
}

function deriveClauseStatus(
  findingStatuses: Record<string, FindingStatusEntry>,
  totalFindingCount: number
): DerivedClauseStatus {
  if (totalFindingCount === 0) return 'NO_ISSUES';

  const statuses = Object.values(findingStatuses);
  const resolvedStatuses = ['ACCEPTED', 'RESOLVED_APPLIED_FALLBACK', 'RESOLVED_MANUAL_EDIT'];

  const resolvedCount = statuses.filter(s => resolvedStatuses.includes(s.status)).length;
  const hasEscalated = statuses.some(s => s.status === 'ESCALATED');

  if (hasEscalated) return 'ESCALATED';
  if (resolvedCount === totalFindingCount) return 'RESOLVED';
  if (resolvedCount > 0) return 'PARTIALLY_RESOLVED';
  return 'PENDING';
}
```

### API Changes

#### POST /api/clauses/[id]/decisions

Request body now **requires** `findingId`:

```typescript
interface ApplyDecisionRequest {
  actionType: DecisionActionType;
  payload: ClauseDecisionPayload;
  clauseUpdatedAtWhenLoaded: string;
  findingId: string;  // REQUIRED — must reference a valid finding in this clause
}
```

**Validation**: Returns 400 if `findingId` is missing or doesn't belong to the clause.

#### GET /api/clauses/[id]/projection

Response includes `findingStatuses` and derived clause resolution info:

```typescript
interface ProjectionResult {
  clauseId: string;
  effectiveText: string;
  effectiveStatus: DerivedClauseStatus; // PENDING | PARTIALLY_RESOLVED | RESOLVED | ESCALATED | NO_ISSUES
  trackedChanges: TrackedChange[];
  lastDecisionTimestamp: Date | null;
  decisionCount: number;
  resolvedCount: number;        // NEW: number of resolved findings
  totalFindingCount: number;    // NEW: total findings in clause

  findingStatuses: {
    [findingId: string]: {
      status: FindingStatus;
      escalatedTo: string | null;
      escalatedToName: string | null;
      noteCount: number;
      lastActionType: DecisionActionType | null;
      lastActionTimestamp: Date | null;
    };
  };
}
```

### UI Changes

#### 1. Left Panel — Clause List Enhancement

Each clause item gains a resolution progress indicator:

```
┌─────────────────────────────────┐
│ § 3.1                    2/3 ✓  │  ← Partially resolved
│ Limitation of Liability   ◼ Red │
│ 2/3 by Jane D.                  │
├─────────────────────────────────┤
│ § 4.2                    3/3 ✓  │  ← Fully resolved (green)
│ Indemnification          ◼ Med  │
├─────────────────────────────────┤
│ § 5.1                    0/2 ⚠  │  ← Has escalation
│ Warranty                 ◼ Red  │
├─────────────────────────────────┤
│ § 6.1              No issues    │  ← Zero findings
│ Governing Law                   │
└─────────────────────────────────┘
```

New filter options: All | Pending | In Progress | Resolved | Escalated

#### 2. Finding Cards — Replace Clause-Level Buttons

Remove the existing `decision-buttons.tsx` clause-level action panel. Each finding card gets its own action buttons:

- Accept | Apply Fallback (if available) | Escalate | Note
- Undo | Revert (shown only when finding has active decisions)
- Status badge: Accepted (green) | Escalated (yellow) | Fallback Applied (blue) | Pending (no badge)

#### 3. Clause-Wide Shortcuts

Above the findings list, two shortcut buttons replace the old clause-level buttons:
- **"Accept All"** — Accepts all unresolved, non-escalated findings at once
- **"Reset All"** — Reverts all findings to PENDING (creates REVERT for each)

#### 4. Decision History Log

- Each decision shows which finding it applies to (badge with finding title)
- Filter dropdown to view one finding's history
- Legacy clause-level decisions shown with "Legacy" label (display-only, no undo)

---

## Migration & Rollout Strategy

### Phase 1: Schema Migration (Zero Downtime)
1. Add `findingId` column as nullable to `ClauseDecision` table
2. Add foreign key constraint with `ON DELETE SET NULL`
3. Add composite index `[clauseId, findingId, timestamp]`
4. **No data migration** — existing records keep `findingId = null` (legacy)

### Phase 2: API + Projection (Breaking Change for Decisions)
1. Update POST `/api/clauses/[id]/decisions` to **require** `findingId`
2. Update projection to only process finding-level decisions; skip legacy records
3. Add `resolvedCount`, `totalFindingCount`, and `findingStatuses` to projection response
4. Add `deriveClauseStatus()` logic

### Phase 3: UI Rollout
1. Replace clause-level `decision-buttons.tsx` with per-finding actions on finding cards
2. Add "Accept All" / "Reset All" clause-wide shortcuts
3. Add resolution progress to clause list items
4. Add resolution status filter to clause list
5. Update decision history log with finding badges and filter

---

## Testing Strategy

### Unit Tests
- Projection: compute per-finding statuses from decision events
- `deriveClauseStatus()`: all combinations (all resolved, some, none, escalated, zero findings)
- Per-finding undo logic (only undoes that finding's last active decision)
- Per-finding revert logic (marks all that finding's decisions inactive)
- Last-write-wins for text replacements across findings
- Legacy decisions (null findingId) ignored by projection

### Integration Tests
- Apply decisions to multiple findings in same clause, verify independent statuses
- Accept All: creates N decisions, clause becomes RESOLVED
- Reset All: creates N REVERTs, clause becomes PENDING
- Escalate one finding, verify others remain actionable
- Clause list shows correct resolution progress after decisions

### E2E Tests
- Reviewer accepts Finding A, applies Finding B's fallback, escalates Finding C → clause shows 2/3 with escalation indicator
- Undo Finding B's fallback, verify Finding A unchanged, clause shows 1/3
- Accept All on clause with one escalated finding → only non-escalated accepted
- Full clause resolution → left panel shows green "Resolved"

---

## Success Metrics

### Usability
- **Target**: Average time to handle multi-finding clause reduces by 30%
- **Target**: Reviewers can identify unresolved clauses at a glance via left panel progress

### Adoption
- **Target**: 90% of decisions made at finding level within 1 week (since it's the only option)

### Quality
- **Target**: Zero data integrity issues (no orphaned decisions, correct projection)
- **Target**: Decision history audit trail passes compliance review

---

## Open Questions

1. **Should we allow applying multiple findings' fallbacks simultaneously?**
   → Resolved: No, keep last-write-wins. Allow sequential application with undo if wrong fallback chosen.

2. **What happens if a finding is deleted but has active decisions?**
   → Resolved: `ON DELETE SET NULL` in FK — decisions preserved as historical records with null findingId.

---

## References

- Feature 006: Clause Decision Actions & Undo System (predecessor, replaced by finding-level)
- Constitution Principle I: Data Integrity (append-only history)
- User feedback: "Need to handle each finding separately" (2026-02-17)

---

**Document Version**: 2.0
**Last Updated**: 2026-02-17
**Author**: AI Assistant (based on user requirements)
