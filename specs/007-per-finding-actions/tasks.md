# Tasks: Per-Finding Decision Actions

**Input**: Design documents from `specs/007-per-finding-actions/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/api-contracts.md, quickstart.md

**Tests**: No test framework configured. Manual verification via quickstart.md steps.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Setup (Schema & Types)

**Purpose**: Database schema migration and TypeScript type additions that all subsequent work depends on.

- [x] T001 Add `findingId` nullable column, FK relation to `AnalysisFinding`, reverse relation on `AnalysisFinding`, and composite index `[clauseId, findingId, timestamp]` to `ClauseDecision` in `prisma/schema.prisma`. Run `npx prisma db push` and `npx prisma generate`.
- [x] T002 Add `FindingStatusValue` type (`PENDING | ACCEPTED | ESCALATED | RESOLVED_APPLIED_FALLBACK | RESOLVED_MANUAL_EDIT`), `FindingStatusEntry` interface, and `DerivedClauseStatus` type (`PENDING | PARTIALLY_RESOLVED | RESOLVED | ESCALATED | NO_ISSUES`) in `src/types/decisions.ts`. Extend `ProjectionResult` with `findingStatuses: Record<string, FindingStatusEntry>`, `resolvedCount: number`, `totalFindingCount: number`. Change `effectiveStatus` type to `DerivedClauseStatus`.

---

## Phase 2: Foundational (Projection, Permissions, API)

**Purpose**: Backend rewrite that MUST be complete before ANY UI user story can be implemented. Rewrites projection to finding-level-only, updates API to require findingId, adds finding-scoped permissions.

**CRITICAL**: No user story work can begin until this phase is complete.

- [x] T003 Rewrite `computeProjection()` in `src/lib/projection.ts` to: (1) filter out legacy decisions where `findingId === null`, (2) group remaining decisions by `findingId`, (3) replay per-finding decisions independently via new `computeFindingStatuses()` function handling UNDO/REVERT per finding, (4) compute effective text via last-write-wins across all active text-modifying decisions, (5) call new `deriveClauseStatus()` to aggregate finding statuses, (6) return enhanced `ProjectionResult` with `findingStatuses`, `resolvedCount`, `totalFindingCount`, and derived `effectiveStatus`. Ensure the function also fetches the clause's `AnalysisFinding` list to build status entries for findings with no decisions (status: PENDING).
- [x] T004 Add `canMakeDecisionOnFinding(userId, clauseId, findingId, findingStatuses)` function in `src/lib/permissions.ts` that checks: user has REVIEW_CONTRACTS permission; if THIS finding's status is ESCALATED, only the assigned approver or admin can make decisions; other findings remain unaffected.
- [x] T005 Update POST handler in `src/app/api/clauses/[id]/decisions/route.ts` to: (1) require `findingId` in request body (return 400 `"findingId is required for all decisions"` if missing), (2) validate finding exists and belongs to this clause (404/400), (3) replace clause-level `canMakeDecisionOnClause()` with finding-level `canMakeDecisionOnFinding()` for escalation lock check, (4) for UNDO validate `undoneDecisionId` references a decision with same `findingId` (400), (5) store `findingId` in created `ClauseDecision` record via `connect`.
- [x] T006 Update GET handler in `src/app/api/clauses/[id]/decisions/route.ts` to: (1) include `findingId` in each decision response item, (2) include related `finding` info (`id`, `riskLevel`, `matchedRuleTitle`) when `findingId` is present using Prisma `include`, (3) add `isLegacy: boolean` field (true when `findingId === null`).
- [x] T007 Update GET handler in `src/app/api/clauses/[id]/projection/route.ts` to return `findingStatuses`, `resolvedCount`, and `totalFindingCount` from the projection result (already computed by T003).

**Checkpoint**: Backend complete. POST requires findingId, projection returns per-finding statuses and derived clause status. Legacy decisions are ignored by projection but visible in history.

---

## Phase 3: User Story 1 — Per-Finding Accept Deviation (Priority: P2) — MVP

**Goal**: Reviewers can click "Accept" on an individual finding card. Only that finding shows "Accepted" badge. Other findings unchanged.

**Independent Test**: Select a clause with multiple findings. Click Accept on one finding. Verify only that finding shows Accepted badge. Check decision history shows the acceptance tied to that finding.

### Implementation for User Story 1

- [x] T008 [US1] Create `src/app/(app)/contracts/[id]/_components/finding-actions.tsx` component. Props: `finding`, `clauseId`, `contractId`, `findingStatus: FindingStatusEntry | undefined`, `onDecisionApplied`, `currentUserId`, `currentUserRole`, `clauseUpdatedAt`. Implement Accept button with: loading state, `handleAcceptFinding()` that POSTs `ACCEPT_DEVIATION` with `findingId`, disabled when `findingStatus?.status === 'ACCEPTED'`, permission check via role. Show "Accepted" green badge when status is ACCEPTED.
- [x] T009 [US1] Update `src/app/(app)/contracts/[id]/_components/findings-panel.tsx` to: (1) accept `projection` prop with `findingStatuses`, (2) import and render `<FindingActions>` on each finding card below the existing finding content, passing `findingStatus={projection?.findingStatuses?.[finding.id]}`, (3) remove the existing `<DecisionButtons>` clause-level action section.
- [x] T010 [US1] Update `src/app/(app)/contracts/[id]/page.tsx` to pass `projection` (including `findingStatuses`) to `<FindingsPanel>`. Ensure `onDecisionApplied` callback refreshes projection and increments `historyRefreshKey`.

**Checkpoint**: Accept works per-finding. Clause-level buttons removed. Finding shows Accepted badge.

---

## Phase 4: User Story 7 — Clause Resolution Progress (Priority: P2)

**Goal**: Left panel shows resolution progress per clause (`{resolved}/{total}`). Fully resolved clauses show green indicator. Escalated clauses show warning.

**Independent Test**: Accept all findings in a clause one by one. After each accept, verify left panel progress updates. When last finding accepted, clause shows green "Resolved".

### Implementation for User Story 7

- [x] T011 [US7] Update `src/app/(app)/contracts/[id]/page.tsx` to: (1) store a map of `clauseProjections: Record<string, { resolvedCount, totalFindingCount, effectiveStatus }>` in state, (2) fetch projection for each clause (or use the selected clause's projection to update the map incrementally when `onDecisionApplied` fires), (3) pass `clauseProjections` to `<ClauseList>`.
- [x] T012 [US7] Update `src/app/(app)/contracts/[id]/_components/clause-list.tsx` to: (1) accept `clauseProjections` prop, (2) display `{resolvedCount}/{totalFindingCount}` progress indicator next to each clause's risk badge, (3) show green checkmark or "Resolved" text when `effectiveStatus === 'RESOLVED'`, (4) show warning icon when `effectiveStatus === 'ESCALATED'`, (5) show "No issues" label with neutral/green style when `effectiveStatus === 'NO_ISSUES'` (zero findings).
- [x] T013 [US7] Add resolution status filter to `src/app/(app)/contracts/[id]/_components/clause-list.tsx`. Add filter options: All | Pending | Partially Resolved | Resolved | Escalated. Filter clauses based on `effectiveStatus` from `clauseProjections`. "Partially Resolved" maps to `PARTIALLY_RESOLVED`.

**Checkpoint**: Left panel shows resolution progress. Fully resolved clauses turn green. Filtering by resolution status works.

---

## Phase 5: User Story 2 — Per-Finding Fallback Replacement (Priority: P2)

**Goal**: Each finding with fallback text has its own "Apply Fallback" button. Clicking it applies that finding's fallback. Last-write-wins for text.

**Independent Test**: Select a clause with 2 findings that have fallback text. Apply Finding A's fallback — clause text changes. Apply Finding B's fallback — clause text changes to B's (last-write-wins). Decision history shows both with finding badges.

### Implementation for User Story 2

- [x] T014 [US2] Add "Apply Fallback" button to `src/app/(app)/contracts/[id]/_components/finding-actions.tsx`. Show only when `finding.fallbackText` is non-empty. `handleApplyFallback()` POSTs `APPLY_FALLBACK` with `findingId`, `replacementText: finding.fallbackText`, `source: 'fallback'`, `playbookRuleId: finding.matchedRuleId`. Show "Fallback Applied" blue badge when `findingStatus?.status === 'RESOLVED_APPLIED_FALLBACK'`.

**Checkpoint**: Per-finding fallback works. Last-write-wins text behavior correct. History tracks which finding's fallback was applied.

---

## Phase 6: User Story 3 — Per-Finding Escalation (Priority: P2)

**Goal**: Reviewers can escalate individual findings. Only the escalated finding is locked. Others remain actionable.

**Independent Test**: Escalate one finding in a multi-finding clause. Verify that finding shows "Escalated to [Name]" and its buttons are disabled for non-approvers. Verify other findings remain fully actionable.

### Implementation for User Story 3

- [x] T015 [US3] Add "Escalate" button to `src/app/(app)/contracts/[id]/_components/finding-actions.tsx`. Disabled when `findingStatus?.status === 'ESCALATED'`. Opens the existing `<EscalateModal>` (from `escalate-modal.tsx`) passing `findingId`. Show "Escalated to [name]" yellow badge when escalated. Show lock indicator and disable all action buttons on this finding when escalated and user is not the assignee/admin.
- [x] T016 [US3] Update `src/app/(app)/contracts/[id]/_components/escalate-modal.tsx` to accept optional `findingId` prop and pass it through in the POST body to `/api/clauses/[id]/decisions`.

**Checkpoint**: Per-finding escalation works. Escalated finding locked, others actionable. Approver sees which finding needs their decision.

---

## Phase 7: User Story 6 — Per-Finding Internal Notes (Priority: P2)

**Goal**: Reviewers can add notes to specific findings. Notes appear only on that finding's card.

**Independent Test**: Add a note to Finding B. Verify it appears on B's card only. Add another note. Verify chronological order with timestamps.

### Implementation for User Story 6

- [x] T017 [US6] Add "Note" button to `src/app/(app)/contracts/[id]/_components/finding-actions.tsx`. Show note count badge when `findingStatus?.noteCount > 0`. Opens the existing `<NoteInput>` (from `note-input.tsx`) passing `findingId`.
- [x] T018 [US6] Update `src/app/(app)/contracts/[id]/_components/note-input.tsx` to accept optional `findingId` prop and pass it through in the POST body to `/api/clauses/[id]/decisions`.

**Checkpoint**: Per-finding notes work. Note count displays on finding card. Notes tied to specific finding in history.

---

## Phase 8: User Story 4 — Per-Finding Undo (Priority: P2)

**Goal**: Reviewers can undo the most recent decision on a specific finding without affecting other findings.

**Independent Test**: Accept Finding A, apply Finding B's fallback. Undo Finding A — only A returns to Pending, B's fallback remains. Clause progress updates.

### Implementation for User Story 4

- [x] T019 [US4] Add "Undo" button to `src/app/(app)/contracts/[id]/_components/finding-actions.tsx`. Show only when `findingStatus?.lastActionType` is set (finding has active decisions). `handleUndoFinding()` fetches decision history for this clause, filters to this `findingId`, builds undone set, finds last active decision for this finding, POSTs `UNDO` with `undoneDecisionId` and `findingId`. Show toast on success.

**Checkpoint**: Per-finding undo works independently. Other findings unaffected by undo.

---

## Phase 9: User Story 5 — Per-Finding Revert (Priority: P2)

**Goal**: Reviewers can revert all decisions on a specific finding, returning it to PENDING.

**Independent Test**: Make 3 decisions on Finding A. Click Revert on A — returns to Pending. Verify Finding B's decisions unchanged.

### Implementation for User Story 5

- [x] T020 [US5] Add "Revert" button to `src/app/(app)/contracts/[id]/_components/finding-actions.tsx`. Show only when `findingStatus?.lastActionType` is set. `handleRevertFinding()` POSTs `REVERT` with `findingId` and empty payload. After success, finding returns to PENDING badge.

**Checkpoint**: Per-finding revert works. All that finding's decisions marked inactive. Other findings unaffected.

---

## Phase 9b: Per-Finding Manual Edit (Priority: P2)

**Goal**: Reviewers can manually edit clause text in the context of a specific finding. The edit is tracked to that finding.

**Independent Test**: Click "Edit" on a specific finding. Edit clause text. Save. Verify decision history shows EDIT_MANUAL tied to that finding. Verify finding status becomes RESOLVED_MANUAL_EDIT.

### Implementation

- [x] T020b [US1] Add "Edit Manually" button to `src/app/(app)/contracts/[id]/_components/finding-actions.tsx`. Show on all findings. Clicking sets a `editingFindingId` state (lifted to findings-panel or page) that activates edit mode in `clause-text.tsx` scoped to that finding.
- [x] T020c [US1] Update `src/app/(app)/contracts/[id]/_components/clause-text.tsx` to accept an optional `editingFindingId` prop. When saving an edit, pass `findingId: editingFindingId` in the POST body to `/api/clauses/[id]/decisions`. Clear `editingFindingId` after save/cancel.

**Checkpoint**: Manual edit works per-finding. Decision history shows EDIT_MANUAL with finding badge. Finding shows "Manually Edited" badge.

---

## Phase 10: User Story 8 — Accept All & Reset All Shortcuts (Priority: P2)

**Goal**: Bulk shortcuts to accept all unresolved findings or reset all findings in a clause.

**Independent Test**: Click "Accept All" on a clause with 3 findings (one escalated). Verify only 2 non-escalated accepted. Click "Reset All" — all return to Pending.

### Implementation for User Story 8

- [x] T021 [US8] Add "Accept All" and "Reset All" shortcut buttons to `src/app/(app)/contracts/[id]/_components/findings-panel.tsx` above the findings list. "Accept All" loops through all findings, skipping escalated ones, and POSTs `ACCEPT_DEVIATION` for each with `findingId`. "Reset All" loops through all findings with active decisions and POSTs `REVERT` for each with `findingId`. Both show loading state and call `onDecisionApplied` after all requests complete. Disable "Accept All" when all findings are already resolved. Disable "Reset All" when no findings have decisions. **Error handling**: if any individual request fails, stop processing remaining requests, show an error toast indicating "{succeeded}/{total} completed — {error message}", and call `onDecisionApplied` so the UI reflects the partial state. User can retry to process remaining findings.

**Checkpoint**: Accept All resolves all non-escalated findings. Reset All returns everything to Pending. Clause progress in left panel updates correctly.

---

## Phase 11: Decision History Enhancement

**Purpose**: Update decision history log to show finding badges, support filtering, and handle legacy records.

- [x] T022 [P] Update `src/app/(app)/contracts/[id]/_components/decision-history-log.tsx` to: (1) show a finding badge (`matchedRuleTitle` + `riskLevel`) on each decision item that has a `findingId`, (2) show "Legacy (clause-level)" label on decisions with `findingId === null`, (3) add a filter dropdown at the top to view decisions for a specific finding or "All decisions", (4) disable undo button for legacy decisions (no `findingId`).

**Checkpoint**: Decision history clearly distinguishes per-finding decisions from legacy. Filter works.

---

## Phase 12: Polish & Cross-Cutting Concerns

**Purpose**: Cleanup, consistency, and final verification.

- [x] T023 Remove or deprecate `src/app/(app)/contracts/[id]/_components/decision-buttons.tsx`. Remove all imports and references to it from `findings-panel.tsx` and `page.tsx`. If the file is still imported elsewhere, keep it but add a `@deprecated` comment.
- [x] T024 [P] Update `src/app/(app)/contracts/[id]/_components/clause-text.tsx` to use the new `DerivedClauseStatus` for status badges. Map RESOLVED → green "Resolved" badge, PARTIALLY_RESOLVED → blue "Partially Resolved" badge, ESCALATED → yellow "Escalated" badge, PENDING → no badge or gray "Pending", NO_ISSUES → green "No Issues".
- [x] T025 [P] Verify all existing functionality and non-functional requirements: (1) clause text display, tracked changes, escalation lock messages, note display in history — ensure no regressions from removing clause-level decision flow, (2) **NFR-001**: confirm per-finding action buttons respond within 500ms (use browser DevTools Network tab on a clause with 3+ findings), (3) **NFR-002**: test projection computation on a clause with 10 findings — verify no visible lag, (4) **NFR-003**: verify finding action buttons are usable on a 375px mobile viewport (touch targets >= 44px).
- [x] T026 Run `npm run build` and `npm run lint` to verify no TypeScript errors or lint violations across all modified files.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: Depends on Phase 1 completion — BLOCKS all user stories
- **US1 Accept (Phase 3)**: Depends on Phase 2 — MVP baseline
- **US7 Clause Progress (Phase 4)**: Depends on Phase 3 (needs at least one action type to demonstrate progress)
- **US2 Fallback (Phase 5)**: Depends on Phase 3 (extends finding-actions.tsx)
- **US3 Escalation (Phase 6)**: Depends on Phase 3 (extends finding-actions.tsx)
- **US6 Notes (Phase 7)**: Depends on Phase 3 (extends finding-actions.tsx)
- **US4 Undo (Phase 8)**: Depends on Phase 3 (needs decisions to undo)
- **US5 Revert (Phase 9)**: Depends on Phase 3 (needs decisions to revert)
- **Per-Finding Manual Edit (Phase 9b)**: Depends on Phase 3 (extends finding-actions.tsx + clause-text.tsx)
- **US8 Accept All / Reset All (Phase 10)**: Depends on Phase 3 + Phase 9 (Reset All uses REVERT)
- **Decision History (Phase 11)**: Can start after Phase 2 (backend ready), recommended after Phase 3
- **Polish (Phase 12)**: Depends on all previous phases

### Parallel Opportunities After Phase 3

Once US1 (Accept) is complete, the following can proceed in parallel since they add independent buttons to `finding-actions.tsx`:

- US2 (Fallback) — adds Apply Fallback button
- US3 (Escalation) — adds Escalate button + modal integration
- US6 (Notes) — adds Note button + modal integration
- US7 (Clause Progress) — different file entirely (clause-list.tsx)
- Phase 11 (Decision History) — different file (decision-history-log.tsx)

US4 (Undo) and US5 (Revert) should be done sequentially after the above, as they affect the same button group area.

### Within Each User Story

- Backend already complete in Phase 2 (all action types supported)
- Each UI story adds a button + handler to finding-actions.tsx
- Each story is independently testable after completion

---

## Parallel Example: After Phase 3

```
# These can run in parallel (different files or independent button additions):
Task T012: [US7] clause-list.tsx resolution progress
Task T014: [US2] finding-actions.tsx Apply Fallback button
Task T015: [US3] finding-actions.tsx Escalate button
Task T017: [US6] finding-actions.tsx Note button
Task T022: decision-history-log.tsx finding badges + filter
```

---

## Implementation Strategy

### MVP First (Phase 1 + 2 + 3 + 4)

1. Complete Phase 1: Schema migration + types
2. Complete Phase 2: Projection rewrite + API + permissions
3. Complete Phase 3: US1 Accept (per-finding accept works)
4. Complete Phase 4: US7 Clause Progress (left panel shows progress)
5. **STOP and VALIDATE**: Accept findings, watch left panel update, verify clause resolves when all accepted
6. Deploy/demo if ready — core value proposition demonstrated

### Incremental Delivery

1. Setup + Foundational → Backend ready
2. US1 Accept → First finding-level action works (MVP!)
3. US7 Clause Progress → Left panel reflects resolution
4. US2 Fallback → Text replacement per finding
5. US3 Escalation + US6 Notes → More action types (parallel)
6. US4 Undo + US5 Revert → Correction actions
7. US8 Accept All / Reset All → Bulk shortcuts
8. Decision History + Polish → Final cleanup

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story after Phase 3 adds a button to finding-actions.tsx — coordinate if parallel
- Backend (Phase 2) handles ALL action types at once — no per-story backend work needed
- Legacy clause-level decisions (findingId=null) are display-only in history
- Commit after each phase or logical group
- Stop at any checkpoint to validate independently
