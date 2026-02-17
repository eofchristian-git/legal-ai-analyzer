# Feature Specification: Per-Finding Decision Actions

**Feature Branch**: `011-per-finding-actions`  
**Created**: 2026-02-17  
**Status**: Draft  
**Depends On**: Feature 006 (Clause Decision Actions & Undo System)  
**Priority**: P2 (Post-MVP Enhancement)

---

## Executive Summary

This feature extends the clause decision system (Feature 006) to support **finding-level actions**, enabling reviewers to make granular decisions on individual findings within a clause rather than operating at the clause level only. This provides more surgical control, better audit trails, and more intuitive UX when a clause contains multiple findings with different risk levels and recommended actions.

**Key Capability**: Reviewers can accept Finding A's deviation while applying Finding B's fallback, escalate Finding C, and add a note to Finding D—all within the same clause, with independent undo/revert for each finding.

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
- Apply Finding A's fallback (critical risk)
- Accept Finding B's deviation (business approved short notice)
- Add note to Finding C (address in next contract revision)

**Current System**: Forces a single clause-level decision, requiring workarounds.

**Proposed System**: Each finding has its own action buttons and decision history.

---

## User Stories

### User Story 1: Per-Finding Accept Deviation (Priority: P2)

**As a** contract reviewer  
**I want to** accept individual findings' deviations without affecting other findings  
**So that** I can approve low-risk issues while still addressing high-risk ones in the same clause

**Acceptance Criteria**:
1. **Given** a clause with 3 findings (RED, YELLOW, GREEN), **When** I click "Accept" on the YELLOW finding card, **Then** only that finding shows an "Accepted" badge and the RED/GREEN findings remain unchanged
2. **Given** I have accepted a specific finding, **When** I view the decision history, **Then** I see the acceptance tied to that specific finding with the finding's title and risk level
3. **Given** a clause with multiple accepted findings, **When** I export the contract, **Then** the audit trail clearly shows which findings were accepted and which were not

### User Story 2: Per-Finding Fallback Replacement (Priority: P2)

**As a** contract reviewer  
**I want to** select which finding's fallback to apply when multiple findings offer fallback language  
**So that** I can address the specific deviation I want to remediate without auto-selection

**Acceptance Criteria**:
1. **Given** a clause with 2 findings that both have fallback language, **When** I view the Decision Actions section, **Then** I see an explicit dropdown or option to choose which fallback to apply
2. **Given** I apply Finding B's fallback, **When** the clause text is replaced, **Then** the decision history shows it was Finding B's fallback, not Finding A's
3. **Given** I apply Finding A's fallback and later apply Finding B's fallback, **When** projection runs, **Then** Finding B's text is used (last-write-wins) and history shows both decisions with timestamps

### User Story 3: Per-Finding Escalation (Priority: P2)

**As a** contract reviewer  
**I want to** escalate individual high-risk findings to senior reviewers  
**So that** I can get guidance on specific issues without escalating the entire clause

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
1. **Given** Finding A has 5 decisions (multiple accept/undo cycles), **When** I click "Revert to Original" on Finding A, **Then** all of Finding A's decisions are marked inactive and the finding returns to "No decision" state
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

---

## Requirements

### Functional Requirements

#### Core Per-Finding Actions

- **FR-001**: System MUST allow users to apply decision actions (accept, escalate, note) at the finding level, independent of other findings in the same clause
- **FR-002**: System MUST store a `findingId` (optional, nullable) in the `ClauseDecision` model to associate decisions with specific findings
- **FR-003**: System MUST support both finding-level decisions (when `findingId` is present) and clause-level decisions (when `findingId` is null) for backward compatibility
- **FR-004**: System MUST display action buttons directly on each finding card in the Findings Panel
- **FR-005**: System MUST show visual status indicators on finding cards (Accepted badge, Escalated tag, note count) reflecting active finding-level decisions

#### Text Modification Actions

- **FR-006**: System MUST allow users to apply a specific finding's fallback by selecting that finding (via button on finding card or dropdown in Decision Actions section)
- **FR-007**: System MUST handle multiple text-replacement decisions on the same clause using a **last-write-wins** strategy: the most recent text-modifying decision determines the effective clause text
- **FR-008**: System MUST NOT attempt to merge multiple fallback texts from different findings into a single clause (NLP complexity avoided)
- **FR-009**: System MUST store the source `findingId` with each text-replacement decision to track which finding prompted the change

#### Undo & Revert

- **FR-010**: System MUST provide a per-finding "Undo" action that reverses only the most recent decision on that specific finding
- **FR-011**: System MUST provide a per-finding "Revert to Original" action that marks all decisions on that finding as inactive (similar to clause-level REVERT but scoped to one finding)
- **FR-012**: System MUST maintain clause-level "Undo All" and "Revert All" actions for global resets
- **FR-013**: System MUST preserve full decision history for both finding-level and clause-level actions in chronological order

#### Projection & Status

- **FR-014**: System MUST compute effective finding status (ACCEPTED, ESCALATED, etc.) by replaying finding-level decisions during projection
- **FR-015**: System MUST compute effective clause text by replaying text-modifying decisions in chronological order (last-write-wins)
- **FR-016**: System MUST support querying projection results filtered by finding (e.g., "Is Finding A accepted?")
- **FR-017**: System MUST invalidate projection cache when any decision (finding-level or clause-level) is applied to the clause

#### UI/UX

- **FR-018**: System MUST render mini action buttons on each finding card with icons and labels (Accept, Escalate, Note, Apply Fallback if available)
- **FR-019**: System MUST show a dropdown or selection UI for "Replace with Fallback" when multiple findings in a clause have fallback language
- **FR-020**: System MUST display a per-finding decision history expandable section showing only that finding's decisions
- **FR-021**: System MUST update finding card badges immediately (no page reload) when a finding-level decision is applied
- **FR-022**: System MUST visually distinguish between finding-level and clause-level decisions in the Decision History Log

#### Backward Compatibility

- **FR-023**: System MUST continue to support existing clause-level decisions (created before Feature 011) where `findingId` is null
- **FR-024**: System MUST treat null `findingId` as a clause-level decision affecting all findings or the clause as a whole
- **FR-025**: System MUST allow users to make new clause-level decisions even after Feature 011 is deployed (both modes coexist)

### Non-Functional Requirements

- **NFR-001**: Per-finding action buttons MUST respond within 500ms (same as clause-level actions)
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
  findingId  String?        // NEW: Optional - ties decision to specific finding
  userId     String
  actionType String         // ACCEPT_DEVIATION | APPLY_FALLBACK | EDIT_MANUAL | ESCALATE | ADD_NOTE | UNDO | REVERT
  timestamp  DateTime       @default(now())
  payload    String         // JSON
  
  clause     AnalysisClause  @relation(fields: [clauseId], references: [id], onDelete: Cascade)
  finding    AnalysisFinding? @relation(fields: [findingId], references: [id], onDelete: SetNull) // NEW
  user       User            @relation("ClauseDecisions", fields: [userId], references: [id])
  
  @@index([clauseId, timestamp])
  @@index([clauseId, findingId, timestamp]) // NEW: For finding-level projection
  @@index([clauseId])
}
```

#### 2. Migration Strategy

- Add `findingId` as nullable field (existing records default to null)
- Add foreign key constraint to `AnalysisFinding` with `onDelete: SetNull` (if finding is deleted, decision remains as clause-level)
- Add composite index `[clauseId, findingId, timestamp]` for efficient finding-level queries

### Projection Algorithm Enhancement

#### Current (Clause-Level Only)
```typescript
function computeProjection(clauseId: string): ProjectionResult {
  const decisions = await db.clauseDecision.findMany({
    where: { clauseId },
    orderBy: { timestamp: 'asc' }
  });
  
  // Replay all decisions chronologically
  // Return effective text, status, tracked changes
}
```

#### Enhanced (Finding-Level Aware)
```typescript
function computeProjection(clauseId: string): ProjectionResult {
  const decisions = await db.clauseDecision.findMany({
    where: { clauseId },
    orderBy: { timestamp: 'asc' }
  });
  
  // Separate finding-level and clause-level decisions
  const clauseDecisions = decisions.filter(d => !d.findingId);
  const findingDecisions = decisions.filter(d => d.findingId);
  
  // Compute per-finding status
  const findingStatuses = computeFindingStatuses(findingDecisions);
  
  // Compute effective text (last-write-wins for text modifications)
  const textDecisions = decisions.filter(d => 
    d.actionType === 'APPLY_FALLBACK' || d.actionType === 'EDIT_MANUAL'
  );
  const effectiveText = textDecisions[textDecisions.length - 1]?.payload.replacementText || originalText;
  
  // Compute clause-level status (aggregates finding statuses)
  const effectiveStatus = computeClauseStatus(clauseDecisions, findingStatuses);
  
  return {
    clauseId,
    effectiveText,
    effectiveStatus,
    findingStatuses,  // NEW: Map<findingId, FindingStatus>
    trackedChanges,
    lastDecisionTimestamp,
    decisionCount: decisions.length,
  };
}

function computeFindingStatuses(findingDecisions: ClauseDecision[]): Map<string, FindingStatus> {
  const grouped = groupBy(findingDecisions, d => d.findingId);
  
  return new Map(
    Object.entries(grouped).map(([findingId, decisions]) => {
      // Replay decisions for this finding
      let status: FindingStatus = 'PENDING';
      let escalatedTo: string | null = null;
      
      for (const decision of decisions) {
        if (decision.actionType === 'REVERT') {
          status = 'PENDING';
          continue;
        }
        if (decision.actionType === 'UNDO') {
          // Undo previous status
          status = 'PENDING';
          continue;
        }
        if (decision.actionType === 'ACCEPT_DEVIATION') {
          status = 'ACCEPTED';
          escalatedTo = null;
        } else if (decision.actionType === 'ESCALATE') {
          status = 'ESCALATED';
          escalatedTo = decision.payload.assigneeId;
        } else if (decision.actionType === 'APPLY_FALLBACK') {
          status = 'RESOLVED_APPLIED_FALLBACK';
        }
      }
      
      return [findingId, { status, escalatedTo }];
    })
  );
}
```

### API Changes

#### POST /api/clauses/[id]/decisions

**Request Body (Enhanced)**:
```typescript
interface ApplyDecisionRequest {
  actionType: DecisionActionType;
  payload: ClauseDecisionPayload;
  clauseUpdatedAtWhenLoaded: string;
  findingId?: string;  // NEW: Optional - if provided, action applies to this finding only
}
```

**Example: Accept Finding A**:
```json
{
  "actionType": "ACCEPT_DEVIATION",
  "findingId": "finding-abc-123",
  "payload": {
    "comment": "Business team approved this specific deviation"
  },
  "clauseUpdatedAtWhenLoaded": "2026-02-17T10:00:00Z"
}
```

**Example: Apply Finding B's Fallback**:
```json
{
  "actionType": "APPLY_FALLBACK",
  "findingId": "finding-xyz-456",
  "payload": {
    "replacementText": "Liability capped at $1,000,000",
    "source": "fallback",
    "playbookRuleId": "rule-789"
  },
  "clauseUpdatedAtWhenLoaded": "2026-02-17T10:05:00Z"
}
```

**Example: Undo Finding A's Last Decision**:
```json
{
  "actionType": "UNDO",
  "findingId": "finding-abc-123",
  "payload": {
    "undoneDecisionId": "decision-999"
  },
  "clauseUpdatedAtWhenLoaded": "2026-02-17T10:10:00Z"
}
```

#### GET /api/clauses/[id]/projection

**Response (Enhanced)**:
```typescript
interface ProjectionResult {
  clauseId: string;
  effectiveText: string;
  effectiveStatus: ClauseStatus;
  trackedChanges: TrackedChange[];
  lastDecisionTimestamp: Date | null;
  decisionCount: number;
  escalatedTo: string | null;
  hasConflict: boolean;
  
  // NEW: Per-finding status map
  findingStatuses: {
    [findingId: string]: {
      status: FindingStatus;
      escalatedTo: string | null;
      noteCount: number;
      lastActionType: DecisionActionType | null;
      lastActionTimestamp: Date | null;
    };
  };
}
```

### UI Components

#### 1. Enhanced FindingCard Component

Add mini action buttons to each finding card:

```typescript
// In FindingCard component (findings-panel.tsx)

function FindingCard({ finding, contractId, clauseId, onDecisionApplied }) {
  const findingStatus = projection?.findingStatuses?.[finding.id];
  
  return (
    <div className="rounded-lg border p-3">
      {/* Existing finding content: risk badge, summary, excerpt, fallback */}
      
      {/* NEW: Per-finding actions */}
      {!finalized && (
        <div className="flex flex-wrap gap-1.5 pt-2 mt-2 border-t">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => handleAcceptFinding(finding.id)}
            disabled={findingStatus?.status === 'ACCEPTED'}
            className="h-7 px-2 text-xs"
          >
            <CheckCircle className="h-3 w-3 mr-1" />
            Accept
          </Button>
          
          {finding.fallbackText && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => handleApplyFindingFallback(finding.id)}
              className="h-7 px-2 text-xs"
            >
              <RefreshCw className="h-3 w-3 mr-1" />
              Apply fallback
            </Button>
          )}
          
          <Button
            size="sm"
            variant="ghost"
            onClick={() => handleEscalateFinding(finding.id)}
            disabled={findingStatus?.status === 'ESCALATED'}
            className="h-7 px-2 text-xs"
          >
            <AlertTriangle className="h-3 w-3 mr-1" />
            Escalate
          </Button>
          
          <Button
            size="sm"
            variant="ghost"
            onClick={() => handleAddNoteFinding(finding.id)}
            className="h-7 px-2 text-xs"
          >
            <MessageSquare className="h-3 w-3 mr-1" />
            Note {findingStatus?.noteCount > 0 && `(${findingStatus.noteCount})`}
          </Button>
          
          {/* Undo & Revert (only show if finding has decisions) */}
          {findingStatus?.lastActionType && (
            <>
              <div className="w-full" /> {/* Line break */}
              <Button
                size="sm"
                variant="ghost"
                onClick={() => handleUndoFinding(finding.id)}
                className="h-7 px-2 text-xs"
              >
                <Undo2 className="h-3 w-3 mr-1" />
                Undo
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => handleRevertFinding(finding.id)}
                className="h-7 px-2 text-xs"
              >
                <RotateCcw className="h-3 w-3 mr-1" />
                Revert
              </Button>
            </>
          )}
        </div>
      )}
      
      {/* NEW: Finding status badge */}
      {findingStatus && (
        <div className="flex items-center gap-2 mt-2">
          {findingStatus.status === 'ACCEPTED' && (
            <Badge variant="outline" className="bg-green-50 text-green-700">
              ✓ Accepted
            </Badge>
          )}
          {findingStatus.status === 'ESCALATED' && (
            <Badge variant="outline" className="bg-yellow-50 text-yellow-700">
              ⚠ Escalated to {findingStatus.escalatedTo}
            </Badge>
          )}
          {findingStatus.status === 'RESOLVED_APPLIED_FALLBACK' && (
            <Badge variant="outline" className="bg-blue-50 text-blue-700">
              🔁 Fallback Applied
            </Badge>
          )}
        </div>
      )}
    </div>
  );
}
```

#### 2. Enhanced Decision History Log

Show finding-specific decisions with visual grouping:

```typescript
// In DecisionHistoryLog component

function DecisionHistoryLog({ clauseId, findings }) {
  const [filterFindingId, setFilterFindingId] = useState<string | null>(null);
  
  const filteredDecisions = decisions.filter(d => 
    !filterFindingId || d.findingId === filterFindingId || !d.findingId
  );
  
  return (
    <div>
      {/* Filter dropdown */}
      <Select value={filterFindingId || 'all'} onValueChange={setFilterFindingId}>
        <SelectTrigger>
          <SelectValue placeholder="All decisions" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All decisions</SelectItem>
          <SelectSeparator />
          {findings.map(f => (
            <SelectItem key={f.id} value={f.id}>
              {f.matchedRuleTitle} ({f.riskLevel})
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      
      {/* Decision timeline */}
      {filteredDecisions.map(decision => (
        <DecisionHistoryItem 
          key={decision.id}
          decision={decision}
          finding={decision.findingId ? findings.find(f => f.id === decision.findingId) : null}
        />
      ))}
    </div>
  );
}

function DecisionHistoryItem({ decision, finding }) {
  return (
    <div className="flex items-start gap-3">
      {/* Existing decision display */}
      
      {/* NEW: Show which finding this applies to */}
      {finding && (
        <Badge variant="outline" className="ml-2">
          {finding.matchedRuleTitle}
        </Badge>
      )}
      {!finding && (
        <Badge variant="outline" className="ml-2 opacity-50">
          Entire clause
        </Badge>
      )}
    </div>
  );
}
```

---

## Migration & Rollout Strategy

### Phase 1: Schema Migration (Zero Downtime)
1. Add `findingId` column as nullable to `ClauseDecision` table
2. Add foreign key constraint with `ON DELETE SET NULL`
3. Add composite index `[clauseId, findingId, timestamp]`
4. **No data migration needed** - existing records remain clause-level (findingId = null)

### Phase 2: API Enhancement (Backward Compatible)
1. Update POST `/api/clauses/[id]/decisions` to accept optional `findingId` in request body
2. Update projection algorithm to handle both null and non-null `findingId`
3. Update GET `/api/clauses/[id]/projection` response to include `findingStatuses` map
4. **Existing API calls work unchanged** - no breaking changes

### Phase 3: UI Rollout (Feature Flag)
1. Deploy UI changes behind feature flag `ENABLE_PER_FINDING_ACTIONS`
2. Enable for internal testing
3. Gather feedback from contract reviewers
4. Enable globally after validation

### Phase 4: Documentation & Training
1. Update user documentation with per-finding action examples
2. Create video tutorial showing finding-level vs clause-level workflows
3. Add tooltips in UI explaining when to use each mode

---

## Testing Strategy

### Unit Tests
- Projection algorithm with mixed finding-level and clause-level decisions
- Per-finding undo logic
- Per-finding revert logic
- Last-write-wins for text replacements

### Integration Tests
- Apply decisions to multiple findings in same clause
- Undo finding-level decision while clause-level decision exists
- Export contract with finding-level decision audit trail
- Backward compatibility: existing clause-level decisions still work

### E2E Tests
- Reviewer accepts Finding A, applies Finding B's fallback, escalates Finding C
- Undo Finding B's fallback, verify Finding A and C unchanged
- Revert Finding A, verify all Finding A decisions marked inactive

---

## Success Metrics

### Usability
- **Target**: 80% of reviewers prefer finding-level actions over clause-level in user survey
- **Target**: Average time to handle multi-finding clause reduces by 30%

### Adoption
- **Target**: 60% of decisions made at finding level within 2 weeks of rollout
- **Target**: Per-finding undo used at least 10 times per week (indicates value)

### Quality
- **Target**: Zero data integrity issues (no orphaned decisions, correct projection)
- **Target**: Decision history audit trail passes compliance review

---

## Open Questions

1. **Should we allow applying multiple findings' fallbacks simultaneously?**  
   → Proposed: No, keep last-write-wins. Allow sequential application with undo if wrong fallback chosen.

2. **What happens if a finding is deleted from the playbook but has active decisions?**  
   → Proposed: `ON DELETE SET NULL` in FK - decision becomes clause-level, history preserved.

3. **Should clause-level "Accept All" exist as a shortcut?**  
   → Proposed: Yes, add "Accept All Findings" button that creates individual finding-level decisions for each finding.

4. **How to visualize when the same clause has both clause-level and finding-level decisions?**  
   → Proposed: Decision history shows both, with visual tags distinguishing them. Projection logic prioritizes finding-level over clause-level for status.

---

## Appendix: Comparison Matrix

| Feature | Clause-Level (Feature 006) | Finding-Level (Feature 011) |
|---------|----------------------------|----------------------------|
| Decision Scope | Entire clause | Individual finding |
| Undo Granularity | Last clause action | Last finding action |
| Multiple Fallbacks | Auto-select highest risk | User selects which finding |
| Audit Trail | "Clause X accepted" | "Finding Y accepted" |
| Escalation | Entire clause locked | Only specific finding locked |
| Use Case | Simple clauses (1 finding) | Complex clauses (3+ findings) |
| Backward Compatible | N/A | ✅ Yes (coexists) |

---

## References

- Feature 006: Clause Decision Actions & Undo System (dependency)
- Constitution Principle I: Data Integrity (append-only history)
- User feedback: "Need to handle each finding separately" (2026-02-17)

---

**Document Version**: 1.0  
**Last Updated**: 2026-02-17  
**Author**: AI Assistant (based on user requirements)
