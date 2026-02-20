# Tasks: Collabora Viewer Reliability & UX Fixes

**Input**: Design documents from `specs/011-collabora-viewer-fixes/`
**Prerequisites**: plan.md ✅ | spec.md ✅ | research.md ✅ | data-model.md ✅ | contracts/internal-hooks.md ✅ | quickstart.md ✅

**Tests**: No test framework is configured — no test tasks generated.

**Organization**: Tasks are grouped by user story in recommended implementation order (see plan.md §Ordering & Dependencies). All 6 user stories map to fixes in the existing Collabora viewer hook subsystem. No new API routes or DB schema changes.

**Recommended implementation order** (from plan.md): US1 → US4 → US3 → US5 → US2 → US6

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: Which user story this task belongs to
- Exact file paths are provided for every task

---

## Phase 1: Setup (Empirical Validations)

**Purpose**: Two empirical validations must be performed against the running Collabora instance before implementing fixes that depend on their outcomes. See `quickstart.md` §Empirical Validations.

- [X] T001 Run validation V1 — test that adding `ReadOnly: true` to WOPI CheckFileInfo response in `src/app/api/wopi/files/[fileId]/route.ts` preserves postMessage UNO command channel: temporarily add the flag, open a contract, confirm `.uno:ExecuteSearch` still works via devtools. Document result (pass/fail) in a comment at top of `route.ts`.
- [X] T002 Run validation V2 — ❌ FAILED. `.uno:InsertBookmark` opens the native "Insert Bookmark" dialog in Collabora Online instead of silently inserting a bookmark via postMessage. This is a dialog-based dispatch command with no non-dialog alternative available through the Collabora postMessage channel. All bookmark functions in `anchor.ts` converted to no-ops. Navigation uses text-search fallback exclusively (T005 normalizations). Bookmark embedding removed from highlighting hook (T013). Bookmark navigation removed from navigation hook (T014).

- [ ] T002b Run validation V3 — after applying R6 fixes (T003b, T010b, T008b), verify that the full redline sequence (apply fallback) and undo sequence complete without any dialog popups. See `quickstart.md` §V3. Document result.

**Checkpoint**: Validation results: (a) ✅ V1 passed — `ReadOnly: true` is safe, added to WOPI. (b) ❌ V2 failed — `.uno:InsertBookmark` opens dialog, bookmark anchoring abandoned. (c) V3 — pending: verify formatting commands work silently after R6 fixes.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Shared types, utilities, and helpers that multiple user story phases depend on. Must be complete before any user story implementation begins.

**⚠️ CRITICAL**: Phases 3–8 all depend on these foundations being in place.

- [X] T003 Add new types to `src/types/collabora.ts`: `PendingChangeType` union, `PendingChangeStatus` union, `PendingDocumentChange` interface, ~~`AnchorEmbedResult` interface~~ (unused — V2 failed). Add `ReadOnly?: boolean` to `CheckFileInfoResponse`. Add `onNavigationFailed?: (clauseId: string) => void` and `onSaveFailed?: (reason: string) => void` to `CollaboraViewerProps`. (See data-model.md §New TypeScript Types.)
- [ ] T003b [P] **(R6 FIX)** Fix `executeUnoCommand` in `src/app/(app)/contracts/[id]/_components/collabora-viewer/use-collabora-postmessage.ts` — detect empty object args (`Object.keys(args).length === 0`) and send `Args: ""` instead of `Args: {}`. This prevents dialog dispatch for all toggle/cursor UNO commands. See research.md §R6, contracts/internal-hooks.md §executeUnoCommand.
- [X] T004 [P] Create `src/lib/collabora/anchor.ts` with three exported functions: `clauseAnchorName(clauseId)` returning `'clause-{clauseId}'`, `buildInsertBookmarkMessage(clauseId)` and `buildGoToBookmarkMessage(clauseId)` both returning `null` (no-ops — V2 failed, `.uno:InsertBookmark` opens dialog). Functions log a warning on call. Callers must not use bookmark-based flows. (See contracts/internal-hooks.md §anchor.ts.)
- [X] T005 [P] Extend `src/lib/collabora/navigation.ts` — update `cleanSearchText()` to add: Unicode NFC normalization (`str.normalize('NFC')`), replacement of en-dash/em-dash with hyphen, replacement of smart quotes (`"`, `"`, `'`, `'`) with straight equivalents. These normalizations apply to both the search string and the comparison text.

**Checkpoint**: Foundation ready — all user story phases can now begin.

---

## Phase 3: User Story 1 — Enforce Read-Only Viewer Mode (Priority: P1) 🎯

**Goal**: Reviewers see a clean document surface with no editing UI and cannot type in the document. Programmatic UNO commands remain fully functional.

**Independent Test**: Open any analyzed contract. Confirm: no toolbar, ruler, status bar, or menu bar visible. Click in the document and type — no text appears. Navigate to a clause — document scrolls correctly.

### Implementation

- [X] T006 [US1] Update `src/app/api/wopi/files/[fileId]/route.ts` — if V1 passed, add `ReadOnly: true` to the `CheckFileInfoResponse` object. Keep `UserCanWrite: true` unchanged. If V1 failed, skip this task and add a comment explaining the fallback approach. (See contracts/internal-hooks.md §CheckFileInfoResponse.)
- [X] T007 [US1] Add transparent interaction guard overlay to `src/app/(app)/contracts/[id]/_components/collabora-viewer/collabora-document-viewer.tsx` — inside the iframe wrapper div, add a sibling `<div>` with `style={{ position: 'absolute', inset: 0, zIndex: 2, cursor: 'default' }}` and `aria-hidden="true"`. This sits above the iframe in z-order, absorbing mouse clicks that would focus the iframe for keyboard input while allowing scroll events (which bubble to the scroll container, not the overlay). Place the overlay only when `viewerState === 'ready'` (not during preparation/loading, where the preparation overlay already covers the viewer).

**Checkpoint**: User Story 1 complete — verify no typing possible in document, scroll still works, navigation still works.

---

## Phase 4: User Story 4 — Undo Correctly Reverts Document Changes (Priority: P2)

**Goal**: Undoing a fallback decision cleanly removes the inserted fallback text and restores the original clause text with no stray characters.

**Independent Test**: Accept fallback on a clause, then undo. Confirm the original text is identical to before (character-for-character), no strikethrough remains, and the risk-level highlight is restored.

### Implementation

- [X] T008 [US4] Rewrite Phase 1 of `src/app/(app)/contracts/[id]/_components/collabora-viewer/use-undo-redline.ts` — replace the `GoLeft`-by-character-count approach for selecting the inserted fallback text with `ExecuteSearch(insertedText)` where `insertedText` comes from `FindingUndoRedlineData.insertedText`. The search selects the exact inserted text; then issue the delete command. (See research.md §R3.)
- [ ] T008b [US4] **(R6 FIX)** Fix all UNO command args in `use-undo-redline.ts` — (1) Remove `{}` from `.uno:GoToStartOfDoc`, `.uno:Delete`, `.uno:Strikeout` calls (pass no args for toggle/cursor commands). (2) Fix `.uno:Color` arg from `{"FontColor.Color": ...}` to `{FontColor: {type: "long", value: N}}`. See research.md §R6.
- [X] T009 [US4] Add save failure handling to `use-undo-redline.ts` — after `Action_Save`, if the save fails (detected via `Action_Exec_Reply` error or timeout), call `props.onSaveFailed?.('Undo save failed')` and emit a `sonner` toast: `toast.error('Document save failed', { description: 'Your undo change will be retried when you reopen the viewer.', duration: 8000 })`. Do not discard the pending undo — retain it in queue (FR-025). (See contracts/internal-hooks.md §Save Failure Toast Contract.)

**Checkpoint**: User Story 4 complete — test undo with clauses containing en-dashes, curly quotes, and long phrases (> 100 chars). Confirm zero character corruption in all cases.

---

## Phase 5: User Story 3 — Fallback Acceptance Shows Redline in Document (Priority: P1)

**Goal**: Accepting a fallback always shows strikethrough on the original text and the replacement text inserted directly after with green background and bold formatting.

**Independent Test**: Apply "Accept Fallback" to 5 different clauses (varying lengths and character types). All 5 must show the correct strikethrough + insertion, every time.

### Implementation

- [X] T010 [US3] Rewrite step 6 of `src/app/(app)/contracts/[id]/_components/collabora-viewer/use-fallback-redline.ts` — replace the `GoLeft`-by-character-count re-selection with `ExecuteSearch(replacementText)` to select the just-inserted fallback text before applying green background, bold, and dark green color formatting. (See research.md §R4, plan.md §Fix 4.)
- [ ] T010b [US3] **(R6 FIX)** Fix all UNO command args in `use-fallback-redline.ts` — (1) Remove `{}` from `.uno:Strikeout` (steps 2, 10), `.uno:Bold` (step 9), `.uno:GoToEndOfSel` (step 4). (2) Fix `.uno:Color` arg from `{"FontColor.Color": ...}` to `{FontColor: {type: "long", value: N}}` (steps 3, 8). See research.md §R6.
- [X] T011 [US3] Increase all inter-step delays in `use-fallback-redline.ts` from 350ms to 500ms uniformly — update every `setTimeout` or `delay()` call in the 11-step sequence to use 500ms. This matches the proven timing of `use-undo-redline.ts`.
- [X] T012 [US3] Add save failure handling to `use-fallback-redline.ts` — mirror the pattern from T009: on `Action_Save` failure, call `props.onSaveFailed?.('Redline save failed')` and emit a `sonner` toast with retry guidance.

**Checkpoint**: User Story 3 complete — test with clause excerpts containing: plain ASCII, en-dashes, smart quotes, parentheses, and legal numbering (e.g., "§ 3.1(a)"). Confirm all apply correctly.

---

## Phase 6: User Story 5 — Reliable Clause Navigation via Enhanced Text Search (Priority: P2)

**Goal**: Clicking any clause in the left panel navigates the document to that clause using enhanced text-search with extended normalization and progressive fallback. ~~Bookmark anchors abandoned~~ (V2 failed — `.uno:InsertBookmark` opens dialog).

**Independent Test**: Click all clauses in the left panel. 95%+ of clauses navigate correctly. Clauses where all text-search fallbacks fail show an inline "Not found" indicator in the left panel.

### Implementation

- [X] T013 [US5] ~~Bookmark embedding removed~~ — V2 failed. No changes to `use-clause-highlighting.ts` for anchor embedding. The hook performs `ExecuteSearch` + `CharBackColor` for highlighting only. No `buildInsertBookmarkMessage` calls. No `AnchorEmbedResult` return value. (Original plan: embed bookmarks after each highlight — abandoned because `.uno:InsertBookmark` opens dialog.)
- [X] T014 [US5] Rewrite navigation logic in `src/app/(app)/contracts/[id]/_components/collabora-viewer/use-clause-navigation.ts` — ~~remove `anchorResults` prop~~ (bookmarks abandoned, V2 failed). Navigation uses text-search only: (1) `ExecuteSearch` with normalized clause text (T005 normalizations applied); (2) progressive fallback — full excerpt → shorter excerpt → first sentence; (3) occurrence indexing for duplicate clause text; (4) if all fallbacks fail, call `props.onNavigationFailed?.(clauseId)`. No `buildGoToBookmarkMessage` calls. (See contracts/internal-hooks.md §useClauseNavigation.)
- [X] T015 [US5] Add `onNavigationFailed` handler in `src/app/(app)/contracts/[id]/_components/collabora-viewer/collabora-document-viewer.tsx` — maintain a `failedNavigationClauseIds: Set<string>` state. Pass it to the clause list component so it can render an inline "Not found in document" indicator (e.g., a small warning icon or muted label) on affected clause items. Pass `handleNavigationFailed` as the `onNavigationFailed` prop to `useClauseNavigation`.

**Checkpoint**: User Story 5 complete — test with clauses that previously failed navigation due to whitespace/Unicode differences. Confirm enhanced text-search with normalization succeeds for 95%+ of clauses. Confirm "Not found" indicator shows for any clause where all fallbacks fail.

---

## Phase 7: User Story 2 — Clause Highlighting Before First Display (Priority: P1)

**Goal**: When a contract is opened, risk highlights are already visible on the first render. No post-load highlight animation. A "Preparing document…" overlay is shown while preparation runs.

**Independent Test**: Open a contract that has completed analysis and has never been viewed before. Observe the document at first display — all highlights are already present. Open the same contract again — overlay appears very briefly (or not at all), highlights already in file.

### Implementation

- [X] T016 [US2] Add `preparationPhase` state to `src/app/(app)/contracts/[id]/_components/collabora-viewer/collabora-document-viewer.tsx` — replace or extend the existing `viewerState` / `isLoading` flags with the five-state machine: `'idle' | 'loading' | 'preparing' | 'ready' | 'error'`. On `isDocumentLoaded = true`: if `highlightsApplied === false`, transition to `'preparing'`; if `highlightsApplied === true` and pending queue is empty, transition to `'ready'`; if `highlightsApplied === true` and pending queue has entries, transition to `'draining'` (handled in US6/Phase 8). (See data-model.md §Preparation Phase State Machine.)
- [X] T017 [US2] Add `DocumentPreparationOverlay` component inside `collabora-document-viewer.tsx` — render it when `preparationPhase === 'preparing'` or `'draining'` or `'loading'`. Display: `position: absolute; inset: 0; z-index: 10; background: white` with a centered spinner and the text `"Preparing document…"`. Use the existing `shadcn` `Skeleton` or a simple CSS spinner consistent with the current loading overlay in the component. Remove it (transition to `'ready'`) in the `onHighlightingComplete` callback.
- [X] T018 [US2] Ensure `use-clause-highlighting.ts` runs immediately when `isDocumentLoaded` becomes `true` (not delayed until after any visual reveal) — confirm the hook's trigger condition does not depend on `viewerState === 'ready'`. The iframe must be mounted (for postMessage to work) but can be visually hidden behind the preparation overlay. Adjust the hook's `useEffect` dependency array if needed so it fires as soon as `isDocumentLoaded && !highlightsApplied`.
- [X] T019 [US2] Wire the `onHighlightingComplete` callback in `collabora-document-viewer.tsx` to transition `preparationPhase` from `'preparing'` → `'ready'`, which removes the overlay and makes the document visible. ~~`anchorResults` pass-through removed~~ — no bookmark anchoring (V2 failed).

**Checkpoint**: User Story 2 complete — verify on first open (overlay shown, highlights appear pre-loaded) and on subsequent opens (overlay flashes briefly or not at all, document shown immediately with saved highlights).

---

## Phase 8: User Story 6 — Changes Sync to File Regardless of Viewer State (Priority: P1)

**Goal**: Decision actions (accept fallback, undo) taken while the viewer is not mounted are queued and applied when the viewer next opens — before the document is made visible.

**Independent Test**: Collapse or unmount the viewer panel. Accept a fallback for a clause. Reopen the viewer. The redline (strikethrough + insertion) must be present in the document without any manual action.

### Implementation

- [X] T020 [US6] Create `src/app/(app)/contracts/[id]/_components/collabora-viewer/use-pending-document-queue.tsx` — implement `CollaboraPendingQueueContext` using React context. Use `useReducer` with actions: `ENQUEUE`, `SET_STATUS`, `CLEAR_COMPLETE`. Export `CollaboraPendingQueueProvider` (wraps children with the context) and `useCollaboraPendingQueue()` hook returning `{ enqueueChange, drainQueue, pendingCount, isDraining }`. The queue is plain React state — no localStorage, no sessionStorage. (See contracts/internal-hooks.md §useCollaboraPendingQueue and data-model.md §Pending Queue State.)
- [X] T021 [US6] Wrap the contract detail page with `CollaboraPendingQueueProvider` in `src/app/(app)/contracts/[id]/page.tsx` — mount the provider at the page level so the queue persists during SPA navigation within the contract review page. Pass `contractId` as a prop to scope the queue to this contract.
- [X] T022 [US6] Integrate `drainQueue` into `collabora-document-viewer.tsx` — on `isDocumentLoaded = true`, call `drainQueue(applyChange)` where `applyChange` dispatches each `PendingDocumentChange` to the correct hook (`useFallbackRedline` for `APPLY_FALLBACK`, `useUndoRedline` for `UNDO_FALLBACK`) awaiting each before processing the next. Keep the preparation overlay shown during drain. Transition to `'ready'` only after drain completes AND highlighting/anchor embedding completes. Handle drain failures per FR-025: toast error, mark entry `'failed'`, continue with remaining entries.
- [X] T023 [US6] Verify that the existing `ClauseDecision` record for `APPLY_FALLBACK` actions stores the full `FindingRedlineData` payload (fields: `excerpt` + `replacementText`) in its JSON payload column. Open `src/lib/projection.ts` and `src/app/api/clauses/[id]/decisions/route.ts` — confirm `replacementText` is persisted. If it is: `insertedText` for `FindingUndoRedlineData` = the `replacementText` from the corresponding `APPLY_FALLBACK` decision event (accessed via `computeProjection()` decision history or the decision list API). If `replacementText` is NOT persisted in the decision record, add it now to the decision creation payload before proceeding with T023b.
- [X] T023b [US6] Update the clause decision buttons component — locate the decision buttons file under `src/app/(app)/contracts/[id]/_components/` (search for the component rendering `APPLY_FALLBACK` and `UNDO` action buttons). After a successful decision API response: (a) for `APPLY_FALLBACK`, call `enqueueChange({ clauseId, type: 'APPLY_FALLBACK', payload: { excerpt, replacementText } satisfies FindingRedlineData, decidedAt })` where `excerpt` and `replacementText` come from the finding data already in scope; (b) for `UNDO` of a prior fallback, call `enqueueChange({ clauseId, type: 'UNDO_FALLBACK', payload: { excerpt, insertedText: replacementText, riskLevel } satisfies FindingUndoRedlineData, decidedAt })` where `insertedText` is the `replacementText` retrieved from the `APPLY_FALLBACK` decision record per T023. Use `useCollaboraPendingQueue()` within the component.

- [X] T027 [US6] Implement partial-redline detection per FR-026 — add an `'in_progress'` status value to `PendingChangeStatus` in `src/types/collabora.ts` (alongside `'pending' | 'applying' | 'complete' | 'failed'`). In `use-pending-document-queue.ts`, expose a `markInProgress(id)` action that transitions a queue entry from `'applying'` → `'in_progress'` — this is called at the *start* of each UNO command sequence in `use-fallback-redline.ts` and `use-undo-redline.ts` (before any commands are sent). When the operation completes and `Action_Save` succeeds, transition to `'complete'`. If the viewer unmounts mid-operation (component cleanup / `useEffect` teardown), the entry remains `'in_progress'`. On next viewer mount, `drainQueue` MUST detect `'in_progress'` entries and: (1) search for the clause's original excerpt text in the document to determine if a strikethrough-only state exists (partial redline: original struck through but insertion absent); (2) if partial state found — clear partial formatting by executing `ExecuteSearch(excerpt)` → remove strikethrough → remove gray → re-apply risk highlight; (3) reset the entry to `'pending'` and re-process it through the normal queue drain, executing the full redline sequence from scratch. If the document appears clean (no partial state), simply reset to `'pending'` and re-apply. (See spec.md FR-026 and clarifications.)

**Checkpoint**: User Story 6 complete — test: (a) apply fallback while viewer is collapsed → open viewer → redline present; (b) apply multiple decisions while viewer closed → all applied in correct order on open; (c) apply decision → navigate to another page → return → open viewer → change present; (d) simulate mid-operation viewer close (e.g., rapidly collapse viewer after clicking Accept Fallback) → reopen viewer → confirm document is clean (no partial strikethrough-only state) and full redline is applied.

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: Cleanup, lint, and final end-to-end verification.

- [X] T024 [P] Remove all temporary validation code from T001 and T002 (any test buttons, temporary `console.log` statements, stub comments that were placeholders) from `src/app/api/wopi/files/[fileId]/route.ts` and `src/lib/collabora/anchor.ts`.
- [X] T025 [P] Run `npm run lint` from repo root — fix all ESLint errors introduced by the new files and modified hooks. Pay special attention to: unused imports in modified hooks, missing `useCallback` wrappers for any new callbacks, and TypeScript strict-mode violations in `anchor.ts` and `use-pending-document-queue.ts`.
- [X] T026 Execute the full end-to-end verification checklist from `quickstart.md` §Verification Checklist — confirm all 10 checklist items pass. Document any failures and address before marking this task complete.

---

## Dependencies & Execution Order

### Phase Dependencies

```
Phase 1 (Validations)     → No dependencies — run first
Phase 2 (Foundation)      → Depends on Phase 1 validation results — BLOCKS all user stories
Phase 3 (US1 Read-only)   → Depends on Phase 2
Phase 4 (US4 Undo)        → Depends on Phase 2 — parallel with Phase 3
Phase 5 (US3 Redline)     → Depends on Phase 2 — parallel with Phase 3, 4
Phase 6 (US5 Navigation)  → Depends on Phase 2 + T005 (text normalization)
Phase 7 (US2 Highlight)   → Depends on Phase 2 (no anchor dependency — V2 failed)
Phase 8 (US6 Queue)       → Depends on Phase 5 (reliable redline) + Phase 4 (reliable undo)
Phase 9 (Polish)          → Depends on all phases complete
```

### User Story Dependencies (detailed)

- **US1 (P1) — Read-only**: Independent after Phase 2. No story dependencies.
- **US4 (P2) — Undo**: Independent after Phase 2. No story dependencies.
- **US3 (P1) — Redline**: Independent after Phase 2. No story dependencies.
- **US5 (P2) — Navigation**: Independent after Phase 2 + T005 (text normalization). ~~No longer depends on T013~~ (bookmark embedding abandoned — V2 failed).
- **US2 (P1) — Highlight timing**: Independent after Phase 2. ~~No longer depends on Phase 6~~ (no `anchorResults` to pass through — V2 failed). Can be parallelized with Phases 3–6.
- **US6 (P1) — Pending queue**: Depends on US3 (Phase 5) and US4 (Phase 4) — queue applies fallback and undo, which must be reliable first. T027 (partial redline detection) also requires T008 (undo search pattern) and T010 (redline search pattern) to exist first, since it reuses those clearing patterns.

### Within Each User Story

- Implement in task-number order within each phase
- Each task is completable as a single focused code change
- Commit after each task or logical group of [P] tasks

### Parallel Opportunities (Phase 2)

Tasks T003, T004, T005 touch different files and can be worked in parallel:
```
T003 → src/types/collabora.ts
T004 → src/lib/collabora/anchor.ts       (parallel with T003)
T005 → src/lib/collabora/navigation.ts   (parallel with T003, T004)
```

### Parallel Opportunities (Phases 3–5)

After Phase 2, US1/US3/US4 have no cross-dependencies and can be worked in parallel:
```
Phase 3 (US1): T006, T007 → WOPI route.ts + viewer component
Phase 4 (US4): T008, T008b, T009 → use-undo-redline.ts only
Phase 5 (US3): T010, T010b, T011, T012 → use-fallback-redline.ts only
```

### R6 Fix Chain (new — must complete before V3)
```
T003b → use-collabora-postmessage.ts (infrastructure: filter empty {} args)
T010b → use-fallback-redline.ts (fix arg names + remove {} from toggles)
T008b → use-undo-redline.ts (fix arg names + remove {} from toggles)
T002b → V3 validation (verify no dialogs in full redline + undo sequences)
```

---

## Parallel Example: Foundation Phase

```
# All three can run simultaneously (different files):
Task T003: Add types to src/types/collabora.ts
Task T004: Create src/lib/collabora/anchor.ts
Task T005: Extend src/lib/collabora/navigation.ts
```

## Parallel Example: US1 + US4 + US3

```
# After Phase 2, all three can run simultaneously:
Task T006+T007: Read-only mode (WOPI + overlay)
Task T008+T009: Undo fix (use-undo-redline.ts)
Task T010+T011+T012: Redline fix (use-fallback-redline.ts)
```

---

## Implementation Strategy

### MVP First (Critical P1 Fixes Only)

1. Complete Phase 1: Validations
2. Complete Phase 2: Foundation
3. Complete Phase 3 (US1): Read-only mode
4. Complete Phase 5 (US3): Fallback redline reliability
5. Complete Phase 7 (US2): Highlights before display
6. **STOP and VALIDATE**: The three most user-visible P1 fixes are working
7. Continue with remaining phases

### Full Delivery Order

1. Phase 1 → Phase 2 → Phase 3 + Phase 4 + Phase 5 (parallel) → Phase 6 → Phase 7 → Phase 8 → Phase 9

### Single Developer Recommended Order

Follow task IDs sequentially (T001→T026). Each task is a single focused change that builds on the previous. The task ordering respects all dependencies.

---

## Notes

- **No new npm packages** — all fixes use the existing postMessage/UNO command pattern
- **No DB migrations** — all state is either in the DOCX file (via WOPI) or transient React state
- **[P]** tasks touch different files — safe to parallelise with no merge conflicts
- **Empirical validations (T001, T002, T002b)** determine implementation branches — complete these first and document results before writing any code
- All tasks have explicit file paths — each is immediately executable without additional context (T001–T027 + T002b, T003b, T008b, T010b)
- Commit after each logical group to keep diffs reviewable
