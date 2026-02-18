# Tasks: Collabora Online Viewer Integration (Replacing ONLYOFFICE)

**Input**: Design documents from `/specs/010-collabora-online/`
**Prerequisites**: plan.md ✅, research.md ✅, data-model.md ✅, contracts/ ✅, quickstart.md ✅

**Tests**: Not requested — no test tasks included.

**Organization**: Tasks are grouped into user stories derived from the plan's implementation phases to enable independent, incremental delivery.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## User Stories (derived from plan.md)

| ID | Title | Priority | Description |
|----|-------|----------|-------------|
| US1 | Viewer Embedding | P1 (MVP) | User can view a DOCX contract in the embedded Collabora iframe (read-only, minimal UI) |
| US2 | Clause Navigation | P2 | User clicks a sidebar clause → document scrolls to that clause via postMessage search |
| US3 | Document Reload | P3 | After backend mutation (fallback apply/remove), viewer reloads with updated content and re-navigates |
| US4 | Error Handling & Edge Cases | P4 | Graceful fallbacks: Collabora unavailable, search mismatch, repeated text, large documents |
| US5 | Legacy Cleanup | P5 | Remove all ONLYOFFICE code, Docker config, DB model, npm package |

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Docker deployment, environment configuration, and TypeScript type foundations

- [ ] T001 [P] Create Collabora CODE Docker Compose file in `docker/collabora/docker-compose.yml`
- [ ] T002 [P] Create environment variable template in `docker/collabora/.env.example`
- [ ] T003 [P] Create TypeScript type definitions in `src/types/collabora.ts` (WopiAccessTokenPayload, CheckFileInfoResponse, CollaboraPostMessage, CreateSessionRequest/Response, HealthResponse)
- [ ] T004 [P] Add Collabora environment variables to `.env.local` (COLLABORA_SERVER_URL, COLLABORA_JWT_SECRET, NEXT_PUBLIC_COLLABORA_SERVER_URL, COLLABORA_APP_CALLBACK_URL)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: WOPI protocol endpoints and Collabora library — MUST complete before any user story

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [ ] T005 Create Collabora configuration utility in `src/lib/collabora/config.ts` (server URL, JWT secret, base URL helpers)
- [ ] T006 Create WOPI token utility in `src/lib/collabora/wopi-token.ts` (JWT generation and validation with fileId, userId, permission claims)
- [ ] T007 Create WOPI discovery client in `src/lib/collabora/discovery.ts` (fetch and cache `/hosting/discovery` XML, resolve iframe URL for docx view action)
- [ ] T008 [P] Create WOPI CheckFileInfo endpoint in `src/app/api/wopi/files/[fileId]/route.ts` (GET — returns file metadata, permissions, version per `contracts/wopi-endpoints.yaml`)
- [ ] T009 [P] Create WOPI GetFile endpoint in `src/app/api/wopi/files/[fileId]/contents/route.ts` (GET — streams raw DOCX bytes per `contracts/wopi-endpoints.yaml`)
- [ ] T010 [P] Create viewer session endpoint in `src/app/api/collabora/session/route.ts` (POST — validates auth, generates WOPI token, resolves iframe URL, returns CreateSessionResponse per `contracts/viewer-session.yaml`)
- [ ] T011 [P] Create health check endpoint in `src/app/api/collabora/health/route.ts` (GET — probes Collabora `/hosting/discovery` per `contracts/viewer-session.yaml`)
- [ ] T012 Update auth bypass in `src/middleware.ts` — add WOPI route patterns (`/api/wopi/files/*`) to the server-to-server bypass list (Collabora container calls these without session cookies)

**Checkpoint**: WOPI protocol and session management ready — viewer component can now be built

---

## Phase 3: User Story 1 — Viewer Embedding (Priority: P1) 🎯 MVP

**Goal**: User can open a contract and see the DOCX rendered in an embedded Collabora read-only viewer with minimal chrome

**Independent Test**: Open any analyzed contract → click "Document View" → document loads in iframe, no toolbar/menu/status bar visible, cannot type or edit

### Implementation for User Story 1

- [ ] T013 [US1] Create main viewer component in `src/app/(app)/contracts/[id]/_components/collabora-viewer/collabora-document-viewer.tsx` (iframe embedding, session initialization via `/api/collabora/session`, loading state, error state)
- [ ] T014 [US1] Create postMessage hook in `src/app/(app)/contracts/[id]/_components/collabora-viewer/use-collabora-postmessage.ts` (bidirectional postMessage: listen for App_LoadingStatus/UI_Error, send Host_PostmessageReady/Hide_Menu_Bar/Hide_Status_Bar/Show_Toolbar)
- [ ] T015 [US1] Update contract detail page in `src/app/(app)/contracts/[id]/page.tsx` — replace `OnlyOfficeDocumentViewer` import with `CollaboraDocumentViewer`, update state types (`'onlyoffice'` → `'collabora'`), remove tracked-changes fetch logic

**Checkpoint**: At this point, users can view documents in the Collabora viewer (read-only, no clause navigation yet)

---

## Phase 4: User Story 2 — Clause Navigation (Priority: P2)

**Goal**: User clicks a clause in the sidebar → document scrolls to that clause text via `.uno:ExecuteSearch` postMessage command

**Independent Test**: Open a contract → click different clauses in the sidebar → document scrolls to each clause's text in the viewer

### Implementation for User Story 2

- [ ] T016 [P] [US2] Create clause text resolution utility in `src/lib/collabora/navigation.ts` (clause GUID → search string: extract first 60-80 characters, handle repeated text with sequential N-th occurrence search, combine with clause heading for disambiguation)
- [ ] T017 [US2] Create clause navigation hook in `src/app/(app)/contracts/[id]/_components/collabora-viewer/use-clause-navigation.ts` (listen for clause selection, compute search string via navigation.ts, send `.uno:ExecuteSearch` via postMessage, handle sequential search for repeated text)
- [ ] T018 [US2] Wire clause navigation into `collabora-document-viewer.tsx` — accept `selectedClauseId` prop, invoke `use-clause-navigation` hook, trigger navigation on clause change and after document load

**Checkpoint**: Clause sidebar click → document scroll works end-to-end

---

## Phase 5: User Story 3 — Document Reload (Priority: P3)

**Goal**: After backend DOCX mutation (fallback apply/remove, manual edit), the viewer reloads the updated document and re-navigates to the active clause

**Independent Test**: Open a contract → navigate to a clause → apply a fallback → viewer reloads with updated content and scrolls back to the same clause

### Implementation for User Story 3

- [ ] T019 [US3] Implement iframe reload with version-token cache busting in `collabora-document-viewer.tsx` — regenerate WOPI token with new version (from `Document.updatedAt`), update iframe `src` attribute, listen for `Document_Loaded` event
- [ ] T020 [US3] Implement re-navigation after reload in `use-clause-navigation.ts` — store last-navigated clause ID in React state, on `Document_Loaded` event re-trigger `.uno:ExecuteSearch` for the stored clause
- [ ] T021 [US3] Add loading overlay during reload in `collabora-document-viewer.tsx` — show semi-transparent spinner overlay on iframe during reload, remove on `Document_Loaded` event (flicker mitigation)

**Checkpoint**: Full mutation → reload → re-navigate cycle works

---

## Phase 6: User Story 4 — Error Handling & Edge Cases (Priority: P4)

**Goal**: Graceful degradation when Collabora is unavailable, search fails, or documents are unusually large

**Independent Test**: Stop Collabora Docker → viewer shows download link fallback. Search for non-existent text → toast notification. Open 100+ page document → loads within acceptable time.

### Implementation for User Story 4

- [ ] T022 [P] [US4] Implement error fallback UI in `collabora-document-viewer.tsx` — when Collabora is unavailable or session creation fails, show a "Document viewer unavailable" message with a direct DOCX download link
- [ ] T023 [P] [US4] Handle search mismatch in `use-clause-navigation.ts` — if `.uno:ExecuteSearch` finds no match, try progressively shorter substrings (first sentence → first 40 chars), then show toast notification "Could not locate clause in document"
- [ ] T024 [P] [US4] Handle repeated text disambiguation in `use-clause-navigation.ts` — use clause position/order from AI extraction to send sequential `.uno:ExecuteSearch` calls (N times for Nth occurrence), fall back to longer excerpt (120+ chars)
- [ ] T025 [US4] Add timeout handling in `use-collabora-postmessage.ts` — if `Document_Loaded` not received within 30 seconds, show timeout error with retry option

**Checkpoint**: All edge cases handled gracefully — no silent failures

---

## Phase 7: User Story 5 — Legacy Cleanup (Priority: P5)

**Goal**: Remove all ONLYOFFICE-specific code, database model, Docker config, and npm dependency

**Independent Test**: `npm run build` passes with no ONLYOFFICE references. `npx prisma db push` succeeds. No broken imports.

### Schema Cleanup

- [ ] T026 [US5] Remove `OnlyOfficeSession` model from `prisma/schema.prisma`
- [ ] T027 [US5] Remove `onlyOfficeSessions` relation from `Contract` model in `prisma/schema.prisma`
- [ ] T028 [US5] Remove `onlyOfficeSessions` relation from `User` model in `prisma/schema.prisma`
- [ ] T029 [US5] Run `npx prisma db push` and `npx prisma generate` to apply schema changes

### Backend Code Removal

- [ ] T030 [P] [US5] Delete `src/lib/onlyoffice/` directory (7 files: config.ts, jwt.ts, session-manager.ts, audit-logger.ts, comment-injector.ts, finding-highlights-injector.ts, track-changes-injector.ts)
- [ ] T031 [P] [US5] Delete `src/app/api/onlyoffice/` directory (5 route files: token, callback/[contractId], health, lock/[contractId], presence/[contractId])
- [ ] T032 [P] [US5] Delete `src/app/api/contracts/[id]/download/route.ts` (replaced by WOPI GetFile endpoint)
- [ ] T033 [P] [US5] Delete `src/app/api/contracts/[id]/onlyoffice-tracked-changes/route.ts` (tracked changes no longer injected client-side)
- [ ] T034 [P] [US5] Delete `src/app/api/cron/cleanup-sessions/route.ts` (no sessions to clean up)

### Frontend Code Removal

- [ ] T035 [P] [US5] Delete `src/app/(app)/contracts/[id]/_components/onlyoffice-viewer/` directory (5 files: onlyoffice-document-viewer.tsx, session-manager.tsx, finding-comments.tsx, finding-highlights.tsx, tracked-changes.tsx)
- [ ] T036 [P] [US5] Delete `src/types/onlyoffice.ts` (replaced by `src/types/collabora.ts`)

### Docker & Dependencies Cleanup

- [ ] T037 [P] [US5] Delete `docker/onlyoffice/` directory (docker-compose.yml)
- [ ] T038 [US5] Remove `@onlyoffice/document-editor-react` from `package.json` via `npm uninstall`
- [ ] T039 [US5] Remove ONLYOFFICE environment variables from `.env.local` (ONLYOFFICE_SERVER_URL, ONLYOFFICE_JWT_SECRET, ONLYOFFICE_JWT_ENABLED, NEXT_PUBLIC_ONLYOFFICE_SERVER_URL, ONLYOFFICE_APP_CALLBACK_URL)
- [ ] T040 [US5] Clean up ONLYOFFICE route references in `src/middleware.ts` — remove old bypass patterns, keep only Collabora/WOPI patterns

**Checkpoint**: Zero ONLYOFFICE references remain in the codebase

---

## Phase 8: Validation & Polish

**Purpose**: End-to-end verification and final cleanup

- [ ] T041 Build verification — run `npm run build` and confirm zero errors
- [ ] T042 Manual E2E test per quickstart.md: load document, verify read-only, navigate clauses, apply fallback, verify reload, check error fallback
- [ ] T043 Verify all existing features still work: clause triage, PDF export, audit history, compliance dashboard
- [ ] T044 Run quickstart.md validation (Step 6 checklist + Step 7 health check)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Phase 1 (T004 → T005, T003 → T008/T009/T010)
- **US1 Viewer Embedding (Phase 3)**: Depends on Phase 2 (T010 → T013, T003 → T013)
- **US2 Clause Navigation (Phase 4)**: Depends on US1 (T014 → T017, T013 → T018)
- **US3 Document Reload (Phase 5)**: Depends on US1 and US2 (T013 → T019, T017 → T020)
- **US4 Error Handling (Phase 6)**: Depends on US1 and US2 (T013 → T022, T017 → T023/T024)
- **US5 Legacy Cleanup (Phase 7)**: Depends on US1 working (T015 confirmed — no ONLYOFFICE imports remain)
- **Validation (Phase 8)**: Depends on ALL previous phases

### User Story Dependencies

| Story | Can Start After | Dependencies on Other Stories |
|-------|----------------|------------------------------|
| US1 (Viewer Embedding) | Phase 2 complete | None |
| US2 (Clause Navigation) | US1 complete | Uses postMessage hook from US1 |
| US3 (Document Reload) | US1 + US2 complete | Extends viewer + navigation |
| US4 (Error Handling) | US1 + US2 complete | Adds error paths to existing components |
| US5 (Legacy Cleanup) | US1 confirmed working | Safe to remove old code once new viewer works |

### Within Each User Story

- Library utilities before components
- Hooks before components that use them
- Core implementation before integration/wiring

### Parallel Opportunities

**Phase 1** (all 4 tasks can run in parallel):
- T001 (Docker), T002 (env template), T003 (types), T004 (env vars)

**Phase 2** (after T005-T007 sequential chain):
- T008 + T009 + T010 + T011 (all 4 endpoints in parallel — different files, share T005-T007)
- T012 (middleware) after T008 + T009

**Phase 4**:
- T016 (navigation util) is independent — can start as soon as Phase 2 is done

**Phase 6** (all edge case tasks in parallel):
- T022 + T023 + T024 + T025 (different concerns, different code paths)

**Phase 7** (most removal tasks in parallel):
- T030-T037 (deleting different directories/files — no conflicts)
- T026-T029 must be sequential (schema model → relations → db push)

---

## Parallel Example: Phase 2 (Foundational)

```text
# Sequential chain (each depends on previous):
T005: Create src/lib/collabora/config.ts
T006: Create src/lib/collabora/wopi-token.ts (depends on T005)
T007: Create src/lib/collabora/discovery.ts (depends on T005)

# Then parallel batch (all depend on T005-T007 + T003):
T008: Create WOPI CheckFileInfo endpoint
T009: Create WOPI GetFile endpoint
T010: Create viewer session endpoint
T011: Create health check endpoint

# Then:
T012: Update middleware (depends on T008 + T009)
```

---

## Parallel Example: Phase 7 (Legacy Cleanup)

```text
# Schema cleanup (sequential):
T026 → T027 → T028 → T029

# Code removal (all parallel — different directories):
T030: Delete src/lib/onlyoffice/
T031: Delete src/app/api/onlyoffice/
T032: Delete src/app/api/contracts/[id]/download/route.ts
T033: Delete src/app/api/contracts/[id]/onlyoffice-tracked-changes/route.ts
T034: Delete src/app/api/cron/cleanup-sessions/route.ts
T035: Delete src/app/(app)/contracts/[id]/_components/onlyoffice-viewer/
T036: Delete src/types/onlyoffice.ts
T037: Delete docker/onlyoffice/

# Sequential after removals:
T038: npm uninstall @onlyoffice/document-editor-react
T039: Remove env vars
T040: Clean up middleware references
```

---

## Implementation Strategy

### MVP First (US1 Only — Phases 1-3)

1. Complete Phase 1: Setup (Docker + env + types)
2. Complete Phase 2: Foundational (WOPI endpoints + session + health)
3. Complete Phase 3: US1 — Viewer Embedding
4. **STOP and VALIDATE**: Document loads in Collabora, read-only, minimal UI
5. Deploy/demo if ready — basic viewing works

### Incremental Delivery

1. Setup + Foundational → Infrastructure ready
2. Add US1 (Viewer Embedding) → **MVP! Documents viewable** → Validate
3. Add US2 (Clause Navigation) → Sidebar click → scroll works → Validate
4. Add US3 (Document Reload) → Mutation → reload → re-navigate works → Validate
5. Add US4 (Error Handling) → Edge cases handled → Validate
6. Add US5 (Legacy Cleanup) → All ONLYOFFICE code removed → Validate
7. Phase 8 → Full E2E validation → Done

### Critical Path

```
T001 → T004 → T005 → T006 → T008/T009/T010 → T013 → T014 → T015 (MVP complete)
                  ↓
                T007 → T010 (discovery needed for session URL)
```

**Estimated total tasks**: 44
**Estimated MVP tasks (Phases 1-3)**: 15

---

## Notes

- [P] tasks = different files, no dependencies on incomplete tasks
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- No test tasks included (not requested in feature specification)
- Schema cleanup (Phase 7) can safely overlap with US4 if US1 is confirmed working
