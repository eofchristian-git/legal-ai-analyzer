# Tasks: Clause Decision Actions & Undo System

**Input**: Design documents from `/specs/006-clause-decision-actions/`  
**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅, contracts/ ✅

**Tests**: Manual testing only (no test framework configured per constitution)

**Organization**: Tasks grouped by user story priority for independent implementation and testing

## Format: `- [ ] [ID] [P?] [Story?] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story (US1-US7) - Setup/Foundational/Polish have no story label
- Include exact file paths in descriptions

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and dependency installation

- [X] T001 Review plan.md, spec.md, and research.md for implementation requirements
- [X] T002 Install diff-match-patch library: `npm install diff-match-patch @types/diff-match-patch`
- [X] T003 Verify existing dependencies (Next.js 14, Prisma, NextAuth, shadcn/ui, Lucide-react, Sonner)

**Checkpoint**: Dependencies ready, design documents reviewed

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

### Database Schema & Migrations

- [X] T004 Add DecisionActionType enum to prisma/schema.prisma (7 values: ACCEPT_DEVIATION, APPLY_FALLBACK, EDIT_MANUAL, ESCALATE, ADD_NOTE, UNDO, REVERT)
- [X] T005 [P] Add Permission enum to prisma/schema.prisma (4 values: REVIEW_CONTRACTS, APPROVE_ESCALATIONS, MANAGE_USERS, MANAGE_PLAYBOOK)
- [X] T006 [P] Create RolePermission model in prisma/schema.prisma with role-permission unique constraint and role index
- [X] T007 Create ClauseDecision model in prisma/schema.prisma with clauseId-timestamp composite index and clauseId index
- [X] T008 Extend AnalysisClause model in prisma/schema.prisma: Add updatedAt (@updatedAt), originalText (String?), decisions relation, and id-updatedAt index
- [X] T009 Extend User model in prisma/schema.prisma: Add decisions relation to ClauseDecision
- [X] T010 Run database migration: `npx prisma db push` and `npx prisma generate`
- [X] T011 Create data migration script scripts/migrate-original-text.ts to copy clauseText to originalText for existing clauses
- [X] T012 Run data migration script: `npx ts-node scripts/migrate-original-text.ts`
- [X] T013 Seed RolePermission table with default permissions (legal: REVIEW_CONTRACTS + APPROVE_ESCALATIONS)

### TypeScript Types & Shared Utilities

- [X] T014 [P] Create src/types/decisions.ts with DecisionActionType, ClauseStatus, ClauseDecision, payload interfaces, ProjectionResult, and TrackedChange types
- [X] T015 [P] Create src/lib/permissions.ts with hasPermission(), canAccessContractReview(), and canMakeDecisionOnClause() async functions (queries RolePermission table)
- [X] T016 [P] Create src/lib/tracked-changes.ts with computeTrackedChanges() using diff-match-patch library (1s timeout, semantic cleanup)
- [X] T017 Create src/lib/projection.ts with computeProjection() function implementing chronological replay algorithm (handles UNDO, REVERT markers)
- [X] T018 Create src/lib/cache.ts with getCachedProjection(), setCachedProjection(), invalidateCachedProjection() using in-memory Map (5-minute TTL backup)

### API Foundation

- [X] T019 [P] Create src/app/api/clauses/[id]/decisions/route.ts: POST handler stub (authentication check only, no implementation)
- [X] T020 [P] Create src/app/api/clauses/[id]/decisions/route.ts: GET handler stub (history retrieval, authentication check only)
- [X] T021 [P] Create src/app/api/clauses/[id]/projection/route.ts: GET handler stub (projection retrieval, authentication check only)

**Checkpoint**: Foundation ready - projection engine, permissions, cache, and database schema complete. User story implementation can now begin in parallel.

---

## Phase 3: User Story 1 - Accept Deviation (Priority: P1) 🎯 MVP

**Goal**: Allow reviewers to accept clause deviations with immediate UI feedback and optional comment

**Independent Test**: Load contract with deviation, click "Accept deviation", verify status changes to ACCEPTED and persists

### API Implementation for US1

- [X] T022 [US1] Implement POST /api/clauses/[id]/decisions in src/app/api/clauses/[id]/decisions/route.ts: Handle ACCEPT_DEVIATION action, create ClauseDecision record, invalidate cache, return updated projection
- [X] T023 [US1] Add conflict detection to POST /api/clauses/[id]/decisions: Compare clauseUpdatedAtWhenLoaded with current updatedAt, return conflictWarning if stale
- [X] T024 [US1] Add permission check to POST /api/clauses/[id]/decisions: Call canMakeDecisionOnClause(), return 403 if unauthorized
- [X] T025 [US1] Implement GET /api/clauses/[id]/projection in src/app/api/clauses/[id]/projection/route.ts: Check cache, compute projection if miss, set cache, return ProjectionResult

### UI Components for US1

- [X] T026 [P] [US1] Create src/app/(app)/contracts/[id]/_components/decision-buttons.tsx: Render 5 core action buttons (accept, replace, edit, escalate, note) + 2 safety buttons (undo, revert) with icons and labels
- [X] T027 [P] [US1] Update src/app/(app)/contracts/[id]/_components/clause-text.tsx: Display effectiveStatus badge, show "Accepted deviation (playbook override)" tag when status is ACCEPTED
- [X] T028 [US1] Update src/app/(app)/contracts/[id]/_components/clause-list.tsx: Update clause badge to show ACCEPTED status after decision
- [X] T029 [US1] Add handleAcceptDeviation() function in decision-buttons.tsx: Call POST /api/clauses/[id]/decisions with actionType=ACCEPT_DEVIATION, handle optional comment input, show toast on success/error
- [X] T030 [US1] Add conflict warning toast in decision-buttons.tsx: Show warning message with "Undo my change" action button if conflictWarning returned
- [X] T031 [US1] Update src/app/(app)/contracts/[id]/page.tsx: Integrate decision-buttons component into clause detail drawer

**Checkpoint**: User Story 1 complete - reviewers can accept deviations with optional comments, immediate UI feedback, and conflict warnings

---

## Phase 4: User Story 2 - Replace with Fallback (Priority: P1) 🎯 MVP

**Goal**: Replace counterparty text with playbook fallback language, show tracked changes (strikethrough/underline)

**Independent Test**: Load clause with fallback language available, click "Replace with fallback", verify tracked changes display and status updates to RESOLVED_APPLIED_FALLBACK

### API Implementation for US2

- [X] T032 [US2] Add APPLY_FALLBACK handling to POST /api/clauses/[id]/decisions in src/app/api/clauses/[id]/decisions/route.ts: Validate replacementText, source, playbookRuleId, create ClauseDecision, invalidate cache
- [X] T033 [US2] Add fallback language retrieval logic in src/app/(app)/contracts/[id]/_components/decision-buttons.tsx: Query playbook API for fallback/preferred language when "Replace with fallback" clicked

### UI Components for US2

- [X] T034 [P] [US2] Create src/app/(app)/contracts/[id]/_components/tracked-changes.tsx: Render TrackedChange array using <del> and <ins> tags with CSS styling (red strikethrough for delete, green underline for insert)
- [X] T035 [P] [US2] Add tracked-changes CSS in src/app/(app)/contracts/[id]/_components/tracked-changes.tsx or globals.css: Style .tracked-delete (red background, strikethrough) and .tracked-insert (green background, underline) with high contrast mode support
- [X] T036 [US2] Update src/app/(app)/contracts/[id]/_components/clause-text.tsx: Display tracked changes when effectiveText differs from originalText
- [X] T037 [US2] Add handleApplyFallback() function in decision-buttons.tsx: Fetch fallback language, call POST /api/clauses/[id]/decisions with actionType=APPLY_FALLBACK, update UI with tracked changes
- [X] T038 [US2] Add button state logic in decision-buttons.tsx: Disable/hide "Replace with fallback" button if playbook rule has no fallback language

**Checkpoint**: User Story 2 complete - reviewers can replace with fallback language and see visual tracked changes

---

## Phase 5: User Story 6 - Undo Last Decision (Priority: P1) 🎯 MVP

**Goal**: Allow reviewers to undo their last decision (multiple levels supported)

**Independent Test**: Apply any decision (e.g., accept), click "Undo", verify clause reverts to previous state while preserving history

### API Implementation for US6

- [X] T039 [US6] Add UNDO handling to POST /api/clauses/[id]/decisions in src/app/api/clauses/[id]/decisions/route.ts: Create ClauseDecision with actionType=UNDO, payload.undoneDecisionId, invalidate cache
- [X] T040 [US6] Update computeProjection() in src/lib/projection.ts: Add undoneDecisionIds Set, skip decisions marked as undone when replaying history
- [X] T041 [US6] Add GET /api/clauses/[id]/decisions implementation in src/app/api/clauses/[id]/decisions/route.ts: Query ClauseDecision records ordered by timestamp, include user name, return decision history

### UI Components for US6

- [X] T042 [P] [US6] Add handleUndo() function in src/app/(app)/contracts/[id]/_components/decision-buttons.tsx: Fetch last decision from history, call POST /api/clauses/[id]/decisions with actionType=UNDO, update UI
- [X] T043 [P] [US6] Add button state logic in decision-buttons.tsx: Enable "Undo" button only when decisionCount > 0 from ProjectionResult
- [X] T044 [US6] Create src/app/(app)/contracts/[id]/_components/decision-history-log.tsx: Display decision history with chronological list, mark undone decisions with strikethrough or "UNDONE" label
- [X] T045 [US6] Update src/app/(app)/contracts/[id]/page.tsx: Add decision history log component (collapsible section or modal)

**Checkpoint**: User Story 6 complete - reviewers can undo decisions with multiple levels supported and view decision history

---

## Phase 6: User Story 3 - Edit Manually (Priority: P2)

**Goal**: Provide inline editor for custom clause text with tracked changes relative to current effective text

**Independent Test**: Load any clause, click "Edit manually", type custom text, save, verify tracked changes and status updates to RESOLVED_MANUAL_EDIT

### API Implementation for US3

- [X] T046 [US3] Add EDIT_MANUAL handling to POST /api/clauses/[id]/decisions in src/app/api/clauses/[id]/decisions/route.ts: Validate replacementText, create ClauseDecision, invalidate cache
- [X] T047 [US3] Update computeTrackedChanges() in src/lib/tracked-changes.ts: Ensure diff computed from currentEffectiveText (not originalText) when manual edit applied after fallback replacement

### UI Components for US3

- [X] T048 [P] [US3] Add inline editor UI in src/app/(app)/contracts/[id]/_components/clause-text.tsx: Add contentEditable textarea or rich text input with Save/Cancel buttons
- [X] T049 [P] [US3] Add handleEditManual() function in decision-buttons.tsx: Enable inline editor mode when "Edit manually" clicked
- [X] T050 [US3] Add handleSaveEdit() function in clause-text.tsx: Call POST /api/clauses/[id]/decisions with actionType=EDIT_MANUAL and replacementText from editor, update UI
- [X] T051 [US3] Add handleCancelEdit() function in clause-text.tsx: Close inline editor without saving changes

**Checkpoint**: User Story 3 complete - reviewers can manually edit clause text with tracked changes

---

## Phase 7: User Story 4 - Escalate (Priority: P2)

**Goal**: Escalate clauses to senior reviewers with reason, comment, and assignee

**Independent Test**: Load clause, click "Escalate", select reason/assignee, confirm, verify status changes to ESCALATED with assignee name displayed and editing locked for non-approvers

### API Implementation for US4

- [X] T052 [US4] Add ESCALATE handling to POST /api/clauses/[id]/decisions in src/app/api/clauses/[id]/decisions/route.ts: Validate reason, comment, assigneeId, create ClauseDecision, invalidate cache
- [X] T053 [US4] Update canMakeDecisionOnClause() in src/lib/permissions.ts: Check if clause effectiveStatus is ESCALATED, verify user is either (a) the assigned approver (clause.escalatedToUserId === user.id) with APPROVE_ESCALATIONS permission, or (b) admin (bypass all checks)
- [X] T054 [US4] Add GET /api/users endpoint in src/app/api/users/route.ts: Return list of users with APPROVE_ESCALATIONS permission (query RolePermission table), filter by role

### UI Components for US4

- [X] T055 [P] [US4] Create src/app/(app)/contracts/[id]/_components/escalate-modal.tsx: Render inline modal with reason dropdown (4 options), comment textarea, assignee dropdown, Confirm/Cancel buttons
- [X] T056 [P] [US4] Add handleEscalate() function in decision-buttons.tsx: Open escalate modal when "Escalate" button clicked
- [X] T057 [US4] Add handleConfirmEscalate() function in escalate-modal.tsx: Call POST /api/clauses/[id]/decisions with actionType=ESCALATE, close modal, update UI
- [X] T058 [US4] Update decision-buttons.tsx: Disable all action buttons (accept, replace, edit, escalate) when clause is ESCALATED and user is not assigned approver or admin
- [X] T059 [US4] Update src/app/(app)/contracts/[id]/_components/clause-text.tsx: Show "Escalated to [assignee name]" label when status is ESCALATED
- [X] T060 [US4] Add locked state UI in clause-text.tsx: Show message "Awaiting decision from [assignee name]" when clause is locked for current user

**Checkpoint**: User Story 4 complete - reviewers can escalate clauses with full governance workflow and lock enforcement

---

## Phase 8: User Story 7 - Revert to Original (Priority: P2)

**Goal**: Reset clause to original counterparty text, ignoring all prior decisions (history preserved)

**Independent Test**: Apply multiple decisions (accept, edit), click "Revert to original", verify clause shows original text and status reverts to DEVIATION_DETECTED

### API Implementation for US7

- [ ] T061 [US7] Add REVERT handling to POST /api/clauses/[id]/decisions in src/app/api/clauses/[id]/decisions/route.ts: Create ClauseDecision with actionType=REVERT, empty payload, invalidate cache
- [ ] T062 [US7] Update computeProjection() in src/lib/projection.ts: When REVERT encountered, reset currentText to originalText, status to DEVIATION_DETECTED, clear activeDecisions and undoneDecisionIds

### UI Components for US7

- [ ] T063 [P] [US7] Add handleRevert() function in src/app/(app)/contracts/[id]/_components/decision-buttons.tsx: Show confirmation modal "Are you sure? This will ignore all prior decisions.", call POST /api/clauses/[id]/decisions with actionType=REVERT
- [ ] T064 [P] [US7] Add button state logic in decision-buttons.tsx: Enable "Revert to original" button only when decisionCount > 0 from ProjectionResult
- [ ] T065 [US7] Update decision-history-log.tsx: Display REVERT marker in history log, show all prior decisions as still visible but not affecting projection

**Checkpoint**: User Story 7 complete - reviewers can reset clauses to original state with full history preserved

---

## Phase 9: User Story 5 - Add Internal Note (Priority: P3)

**Goal**: Allow internal team notes without changing clause text or status

**Independent Test**: Load any clause, click "Add internal note", type note, save, verify note indicator appears with tooltip showing note text

### API Implementation for US5

- [ ] T066 [US5] Add ADD_NOTE handling to POST /api/clauses/[id]/decisions in src/app/api/clauses/[id]/decisions/route.ts: Validate noteText, create ClauseDecision (note: ADD_NOTE doesn't change effectiveText or effectiveStatus)
- [ ] T067 [US5] Update computeProjection() in src/lib/projection.ts: Skip ADD_NOTE actions when computing effective text/status (notes don't affect projection)

### UI Components for US5

- [ ] T068 [P] [US5] Create src/app/(app)/contracts/[id]/_components/note-input.tsx: Render inline text input or small modal for note entry with Save/Cancel buttons
- [ ] T069 [P] [US5] Add handleAddNote() function in decision-buttons.tsx: Show note input when "Add internal note" button clicked
- [ ] T070 [US5] Add handleSaveNote() function in note-input.tsx: Call POST /api/clauses/[id]/decisions with actionType=ADD_NOTE and noteText payload
- [ ] T071 [US5] Add note indicator icon (💬) in src/app/(app)/contracts/[id]/_components/clause-list.tsx: Display icon next to clauses with notes (query decision history for ADD_NOTE actions)
- [ ] T072 [US5] Add note tooltip in clause-list.tsx and clause-text.tsx: Show note text on hover/click with author name and timestamp
- [ ] T073 [US5] Update decision-history-log.tsx: Display ADD_NOTE actions in history with full note text visible to all users (full transparency per FR-046)

**Checkpoint**: User Story 5 complete - team members can add internal notes for collaboration

---

## Phase 10: Polish & Cross-Cutting Concerns

**Purpose**: Improvements affecting multiple user stories, testing, and deployment readiness

### Performance & Caching

- [ ] T074 [P] Add cache metrics logging in src/lib/cache.ts: Track cache hits/misses, hit rate, cache size, invalidation rate
- [ ] T075 [P] Add performance monitoring in src/lib/projection.ts: Log projection computation time, decision count per clause

### Error Handling & Validation

- [ ] T076 Review error handling across all API routes: Ensure 401 (unauthorized), 403 (forbidden), 404 (not found), 500 (server error) returned with descriptive messages
- [ ] T077 Add payload validation for all decision types in src/app/api/clauses/[id]/decisions/route.ts: Validate required fields per actionType, return 400 for invalid payloads
- [ ] T078 Add database error handling in API routes: Catch Prisma errors, log with context, return user-friendly error messages

### UI/UX Polish

- [ ] T079 [P] Add loading states to all decision buttons in src/app/(app)/contracts/[id]/_components/decision-buttons.tsx: Show spinner/disable buttons during API calls
- [ ] T080 [P] Add success toast notifications for all decision actions: "Decision saved", "Clause undone", "Escalation sent", etc.
- [ ] T081 [P] Add aria-label attributes to all buttons and tracked changes in tracked-changes.tsx and decision-buttons.tsx for screen reader accessibility
- [ ] T082 Review CSS for high contrast mode support in tracked-changes.tsx: Test strikethrough and underline rendering with wavy/double decoration styles

### Documentation & Testing

- [ ] T083 [P] Update CLAUDE.md with decision workflow patterns: Document projection engine, append-only pattern, cache strategy
- [ ] T084 [P] Update .specify/memory/constitution.md: Add "Append-Only Event Sourcing" pattern to Data Design Patterns section
- [ ] T085 Manual testing: Test all 7 decision actions (accept, replace, edit, escalate, note, undo, revert) on sample contracts per quickstart.md scenarios
- [ ] T086 Manual testing: Test conflict detection by opening same clause in two browsers, applying decisions simultaneously, verify stale warning
- [ ] T087 Manual testing: Test escalation locks by escalating clause to specific user, verify only that user + admins can edit
- [ ] T087a Manual testing: Test API-level escalation lock enforcement: Use Postman/curl to POST /api/clauses/[id]/decisions as non-assigned user on escalated clause, verify 403 Forbidden response (NFR-009)
- [ ] T088 Manual testing: Test permission checks by logging in as compliance user, verify no access to contract review features
- [ ] T089 Manual testing: Test cache invalidation by applying decision, refreshing page, verify projection updated correctly

### Deployment Preparation

- [ ] T090 Review Prisma migration script in prisma/migrations/: Ensure idempotent (safe to re-run), test on staging database
- [ ] T091 Create rollback plan documentation in specs/006-clause-decision-actions/ROLLBACK.md: Document how to revert schema changes if deployment fails
- [ ] T092 Run quickstart.md validation: Follow quickstart guide step-by-step to verify all instructions are accurate

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - **BLOCKS all user stories**
- **User Stories (Phase 3-9)**: All depend on Foundational phase completion
  - **P1 Stories (MVP)**: US1 (Accept) → US2 (Replace) → US6 (Undo) - Sequential recommended
  - **P2 Stories**: US3 (Edit), US4 (Escalate), US7 (Revert) - Can start after P1 complete
  - **P3 Stories**: US5 (Add Note) - Can start after Foundational
- **Polish (Phase 10)**: Depends on all desired user stories being complete

### User Story Dependencies

- **US1 (Accept)**: No dependencies on other stories - Can start after Foundational (T004-T021)
- **US2 (Replace)**: Depends on US1 (reuses POST /api/clauses/[id]/decisions from T022)
- **US6 (Undo)**: Depends on US1, US2 (needs decision history to undo)
- **US3 (Edit)**: Depends on US2 (reuses tracked changes component from T034)
- **US4 (Escalate)**: Depends on US1 (reuses permissions check from T024)
- **US7 (Revert)**: Depends on US1 (reuses projection engine from T017)
- **US5 (Add Note)**: Independent - only depends on Foundational phase

### Within Each User Story

1. API implementation before UI components
2. Core decision handling before button logic
3. Permission checks before action execution
4. Component creation before integration

### Parallel Opportunities

**Phase 1 (Setup)**: All 3 tasks can run in parallel

**Phase 2 (Foundational)**:
- T005, T006 (enums/models) can run in parallel
- T014, T015, T016 (type files) can run in parallel after T004-T009 complete
- T019, T020, T021 (API stubs) can run in parallel after T014-T018 complete

**Within User Stories**:
- UI components marked [P] can run in parallel (different files)
- Multiple developers can work on different user stories after Foundational complete

---

## Parallel Example: User Story 1 (Accept Deviation)

```bash
# After T025 completes, these UI tasks can run in parallel:
T026: decision-buttons.tsx (developer A)
T027: clause-text.tsx (developer B)
T028: clause-list.tsx (developer C)
```

---

## Implementation Strategy

### MVP First (P1 Stories Only)

1. Complete Phase 1: Setup (T001-T003)
2. Complete Phase 2: Foundational (T004-T021) - **CRITICAL**
3. Complete Phase 3: US1 - Accept (T022-T031)
4. Complete Phase 4: US2 - Replace (T032-T038)
5. Complete Phase 5: US6 - Undo (T039-T045)
6. **STOP and VALIDATE**: Test all P1 stories together
7. Deploy MVP with core decision workflow

### Incremental Delivery

1. Setup + Foundational → Foundation ready (T001-T021)
2. Add US1 → Test independently → Deploy (Accept deviation capability)
3. Add US2 → Test independently → Deploy (Replace with fallback capability)
4. Add US6 → Test independently → Deploy (Undo safety net)
5. Add US3, US4, US7 → Test independently → Deploy (Advanced features)
6. Add US5 → Test independently → Deploy (Internal notes)
7. Polish phase → Final deployment

### Parallel Team Strategy

With 2-3 developers after Foundational complete:

- **Sprint 1**: Developer A (US1), Developer B (US2), Developer C (US6) - P1 Stories in parallel
- **Sprint 2**: Developer A (US3), Developer B (US4), Developer C (US7) - P2 Stories in parallel
- **Sprint 3**: Developer A (US5), Developer B/C (Polish) - P3 + Polish

---

## Task Summary

- **Total Tasks**: 93
- **Setup**: 3 tasks
- **Foundational**: 18 tasks (BLOCKS everything)
- **US1 (P1)**: 10 tasks (MVP: Accept deviation)
- **US2 (P1)**: 7 tasks (MVP: Replace with fallback)
- **US6 (P1)**: 7 tasks (MVP: Undo)
- **US3 (P2)**: 6 tasks (Manual edit)
- **US4 (P2)**: 9 tasks (Escalate)
- **US7 (P2)**: 5 tasks (Revert)
- **US5 (P3)**: 8 tasks (Internal notes)
- **Polish**: 20 tasks (Testing, docs, deployment)

**Parallel Opportunities**: 25 tasks marked [P] can run concurrently within their phase

**Estimated MVP Time**: 3-5 days (1 developer) for Setup + Foundational + US1 + US2 + US6

---

## Notes

- All tasks follow strict format: `- [ ] [ID] [P?] [Story?] Description with file path`
- [P] = different files, no dependencies within phase
- [Story] = US1-US7 label for user story traceability
- Each user story independently completable and testable
- Stop at any checkpoint to validate story independently
- Foundational phase is critical - no shortcuts
- Projection engine and cache are core to all stories
- Manual testing only (no test framework configured)

---

## Future Enhancements (Post-MVP)

### Feature 011: Per-Finding Decision Actions

**Status**: Spec Draft (see `specs/011-per-finding-actions/`)  
**Priority**: P2 (Post-MVP Enhancement)  
**Depends On**: Feature 006 Phase 10 completion

**Key Capability**: Enable reviewers to make granular decisions on individual findings within a clause (e.g., accept Finding A, apply Finding B's fallback, escalate Finding C).

**Benefits**:
- More surgical control when clause has multiple findings
- Better audit trail (know which finding prompted which action)
- Intuitive UX (action buttons right on finding cards)
- Per-finding undo/revert (no all-or-nothing operations)

**Technical Summary**:
- Add optional `findingId` field to `ClauseDecision`
- Enhance projection algorithm to handle finding-level decisions
- Add action buttons to each finding card in UI
- Backward compatible with clause-level decisions

**Next Steps**:
1. Review `specs/011-per-finding-actions/spec.md`
2. Create implementation plan and task breakdown
3. Schedule for development after Feature 006 Polish phase

**User Feedback**: "I think we should be able to click on specific finding and be able to perform all of the actions per each finding" (2026-02-17)
