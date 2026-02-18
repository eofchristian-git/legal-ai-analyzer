# Tasks: ONLYOFFICE Document Viewer Integration

**Input**: Design documents from `/specs/009-onlyoffice-viewer/`
**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅, contracts/ ✅, quickstart.md ✅

**Tests**: No test framework configured (manual testing per constitution). Test tasks are NOT included.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- **Single project**: Next.js App Router — `src/` at repository root, `prisma/` for database
- **Path Alias**: `@/*` → `./src/*`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization — Docker config, dependencies, database schema, environment

- [x] T001 Create Docker Compose configuration for ONLYOFFICE Document Server in docker/onlyoffice/docker-compose.yml
- [x] T002 [P] Create Docker environment example file with JWT secret placeholder in docker/onlyoffice/.env.example
- [x] T003 [P] Install npm dependencies: @onlyoffice/document-editor-react, jsonwebtoken, @types/jsonwebtoken
- [x] T004 [P] Add ONLYOFFICE environment variables (ONLYOFFICE_SERVER_URL, ONLYOFFICE_JWT_SECRET, ONLYOFFICE_JWT_ENABLED) to .env.local
- [x] T005 Add OnlyOfficeSession model to prisma/schema.prisma with all fields, indexes, and relations per data-model.md, then run prisma migrate dev

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core utilities, type definitions, and API endpoints that ALL user stories depend on

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [x] T006 [P] Create ONLYOFFICE TypeScript type definitions (session, config, callback, token interfaces) in src/types/onlyoffice.ts
- [x] T007 [P] Create ONLYOFFICE server configuration utility (server URL, JWT settings, editor defaults) in src/lib/onlyoffice/config.ts
- [x] T008 [P] Create JWT utilities for access token (4h), download token (1h), and config token generation/validation in src/lib/onlyoffice/jwt.ts
- [x] T009 Create server-side session lifecycle manager (create, refresh, expire, revoke, find active) in src/lib/onlyoffice/session-manager.ts
- [x] T010 Implement session token generation API endpoint per api-session-token.md contract in src/app/api/onlyoffice/token/route.ts
- [x] T011 [P] Implement document download API endpoint per api-download.md contract in src/app/api/contracts/[id]/download/route.ts
- [x] T012 [P] Implement ONLYOFFICE callback API endpoint per api-callback.md contract in src/app/api/onlyoffice/callback/[contractId]/route.ts

**Checkpoint**: Foundation ready — ONLYOFFICE server can authenticate, serve documents, and handle callbacks. User story implementation can now begin.

---

## Phase 3: User Story 1 — View Contract with Perfect Formatting Fidelity (Priority: P1) 🎯 MVP

**Goal**: Replace HTML viewer with embedded ONLYOFFICE viewer that preserves all original document formatting (fonts, colors, tables, images, headers, footers, page layouts)

**Independent Test**: Upload a Word contract with complex formatting → run analysis → open contract detail page → verify: (1) ONLYOFFICE viewer loads, (2) all formatting preserved, (3) scrollable and zoomable, (4) pages render correctly

### Implementation for User Story 1

- [x] T013 [US1] Create OnlyOfficeDocumentViewer main React component with ONLYOFFICE editor embedding in src/app/(app)/contracts/[id]/_components/onlyoffice-viewer/onlyoffice-document-viewer.tsx
- [x] T014 [P] [US1] Create client-side session manager component with automatic token refresh (3.5h interval) in src/app/(app)/contracts/[id]/_components/onlyoffice-viewer/session-manager.tsx
- [x] T015 [US1] Modify contract detail page to integrate ONLYOFFICE viewer replacing HTML viewer toggle in src/app/(app)/contracts/[id]/page.tsx
- [x] T016 [US1] Implement loading indicators, zoom controls (in/out, fit-to-width, fit-to-page), and page navigation in onlyoffice-document-viewer.tsx
- [x] T017 [US1] Implement error handling for ONLYOFFICE unavailability with fallback to direct document download link in onlyoffice-document-viewer.tsx

**Checkpoint**: User Story 1 fully functional — contracts display in ONLYOFFICE with perfect formatting fidelity, session management works, error fallback available.

---

## Phase 4: User Story 2 — Display Findings as Document Comments (Priority: P1)

**Goal**: Inject AI-generated findings as ONLYOFFICE comments positioned at relevant text locations with risk-level color coding (RED/YELLOW/GREEN), enabling click-to-navigate from sidebar

**Independent Test**: Analyze a contract that generates findings → open document viewer → verify: (1) findings appear as comments, (2) correct text positions, (3) clicking comment shows details, (4) clicking sidebar finding jumps to comment, (5) risk colors applied

### Implementation for User Story 2

- [x] T018 [P] [US2] Create comment injector utility with text search positioning and risk-level styling in src/lib/onlyoffice/comment-injector.ts
- [x] T019 [US2] Create finding-comments component that injects findings as ONLYOFFICE comments after document load in src/app/(app)/contracts/[id]/_components/onlyoffice-viewer/finding-comments.tsx
- [x] T020 [US2] Implement sidebar finding click-to-document comment navigation and comment highlight in finding-comments.tsx
- [x] T021 [US2] Handle edge cases: multiple findings on same text span, fallback clause-level positioning when exact match unavailable in comment-injector.ts

**Checkpoint**: User Story 2 fully functional — findings display as positioned, color-coded comments in the document with bidirectional navigation.

---

## Phase 5: User Story 3 — Enable Track Changes for Decision Review (Priority: P2)

**Goal**: Display decision-based modifications (fallback text, manual edits) as native ONLYOFFICE tracked changes with user attribution, togglable on/off, with accept/reject capability

**Independent Test**: Make decisions on findings (apply fallback, manual edit) → enable Track Changes toggle → verify: (1) toggle appears, (2) modifications show as tracked changes, (3) changes attributed to decision maker, (4) accept/reject works, (5) toggle off shows clean document

### Implementation for User Story 3

- [x] T022 [P] [US3] Create track changes injector utility mapping decision types to ONLYOFFICE tracked changes in src/lib/onlyoffice/track-changes-injector.ts
- [x] T023 [US3] Create tracked-changes component with "Show Track Changes" toggle UI in src/app/(app)/contracts/[id]/_components/onlyoffice-viewer/tracked-changes.tsx
- [x] T024 [US3] Implement decision-to-change mapping: ACCEPT_DEVIATION→none, APPLY_FALLBACK→delete+insert, EDIT_MANUAL→delete+insert in track-changes-injector.ts
- [x] T025 [US3] Implement change attribution with user names, timestamps, and per-user color coding in track-changes-injector.ts
- [x] T026 [US3] Integrate Track Changes toggle control into contract detail page viewer toolbar in src/app/(app)/contracts/[id]/page.tsx

**Checkpoint**: User Story 3 fully functional — decisions appear as native tracked changes with full attribution, togglable visibility, and accept/reject support.

---

## Phase 6: User Story 4 — Export Contracts Directly from ONLYOFFICE (Priority: P2)

**Goal**: Enable direct document export from ONLYOFFICE with tracked changes preserved in native Microsoft Word format (.docx), including clean version export option and contract metadata

**Independent Test**: Make decisions → enable Track Changes → click "Export Document" → download .docx → verify: (1) file downloads, (2) opens in Word, (3) tracked changes present, (4) user attribution correct, (5) metadata included

### Implementation for User Story 4

- [x] T027 [US4] Implement "Export Document" button triggering ONLYOFFICE native download with tracked changes preserved in onlyoffice-document-viewer.tsx
- [x] T028 [US4] Implement "Export Clean Version" option that exports document with all changes applied and no markup in onlyoffice-document-viewer.tsx
- [x] T029 [US4] Add contract metadata (title, counterparty, export date, organization) to exported document properties in onlyoffice-document-viewer.tsx
- [x] T030 [US4] Add progress indicator for large document exports (100+ pages) with timeout handling in onlyoffice-document-viewer.tsx

**Checkpoint**: User Story 4 fully functional — documents export with tracked changes in native Word format, clean export available, metadata included.

---

## Phase 7: User Story 5 — Collaborative Review Sessions (Priority: P3)

**Goal**: Enable multiple reviewers to view a contract simultaneously with single-editor lock, real-time updates, user presence indicators, and edit access request flow

**Independent Test**: Open same contract in two browser sessions with different users → make a decision in one → verify: (1) update visible in other session within 5s, (2) presence indicators show viewers, (3) cursor positions visible, (4) editor lock enforced

### Implementation for User Story 5

- [x] T031 [US5] Implement editor lock management (first-to-edit acquires lock, others view-only) in src/lib/onlyoffice/session-manager.ts
- [x] T032 [US5] Implement idle timeout auto-release of editor lock after 15 minutes of inactivity in src/lib/onlyoffice/session-manager.ts
- [x] T033 [US5] Add "Document being edited by [username]" indicator with edit access request button in onlyoffice-document-viewer.tsx
- [x] T034 [US5] Add real-time user presence indicators (names/avatars of current viewers) in onlyoffice-document-viewer.tsx
- [x] T035 [US5] Implement edit access request notification to current editor and lock transfer flow in onlyoffice-document-viewer.tsx

**Checkpoint**: User Story 5 fully functional — collaborative viewing with single-editor lock, presence indicators, and seamless lock transfer.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Health monitoring, audit logging, cleanup jobs, and deprecation of Feature 008 code

- [x] T036 [P] Add ONLYOFFICE health check endpoint for uptime monitoring in src/app/api/onlyoffice/health/route.ts
- [x] T037 [P] Add comprehensive audit logging for ONLYOFFICE operations (view, edit, export, comment, tracked change) in src/lib/onlyoffice/audit-logger.ts + src/lib/onlyoffice/session-manager.ts
- [x] T038 [P] Create session cleanup scheduled job to delete expired/revoked sessions older than 7 days in src/app/api/cron/cleanup-sessions/route.ts
- [x] T039 Deprecate Feature 008 document-viewer components with @deprecated notices in src/app/(app)/contracts/[id]/_components/document-viewer/ (retained for legacy compatibility)
- [x] T040 Add @deprecated notices to deprecated utilities: src/lib/document-converter.ts, src/lib/position-mapper.ts, src/lib/html-sanitizer.ts (retained for legacy compatibility)
- [x] T041 Add @deprecated notices to deprecated types and API: src/types/document-viewer.ts and src/app/api/contracts/[id]/document/route.ts (retained for legacy compatibility)
- [x] T042 Update contract detail page: ONLYOFFICE as primary "Document View", Feature 008 as "Legacy View" in src/app/(app)/contracts/[id]/page.tsx
- [x] T043 Run quickstart.md validation to verify end-to-end ONLYOFFICE integration workflow

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion — BLOCKS all user stories
- **User Stories (Phase 3–7)**: All depend on Foundational phase completion
  - US1 (P1) and US2 (P1) can proceed sequentially (US2 depends on viewer from US1)
  - US3 (P2) depends on US1 viewer being functional
  - US4 (P2) depends on US1 viewer and US3 Track Changes
  - US5 (P3) depends on US1 viewer being functional
- **Polish (Phase 8)**: Depends on all desired user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Foundational (Phase 2) — no dependencies on other stories
- **User Story 2 (P1)**: Depends on US1 viewer component being functional (comment injection needs loaded document)
- **User Story 3 (P2)**: Depends on US1 viewer component (Track Changes displayed in viewer)
- **User Story 4 (P2)**: Depends on US1 viewer + US3 Track Changes (export includes tracked changes)
- **User Story 5 (P3)**: Depends on US1 viewer component (collaborative sessions use viewer)

### Within Each User Story

- Utilities/injectors before components
- Components before page integration
- Core implementation before edge case handling
- Story complete before moving to next priority

### Parallel Opportunities

- Setup tasks T002, T003, T004 can run in parallel with each other
- Foundational tasks T006, T007, T008 can run in parallel (type definitions + config + JWT)
- Foundational tasks T011, T012 can run in parallel (different API endpoints)
- Within US1: T013 and T014 can run in parallel (different component files)
- US2 task T018 (comment-injector utility) can run in parallel with US1 completion
- US3 task T022 (track-changes-injector utility) can run in parallel with US2 implementation
- US5 can start in parallel with US3/US4 (different concern: collaboration vs. review features)
- All Phase 8 tasks T036, T037, T038 can run in parallel

---

## Parallel Example: Foundational Phase

```text
# Wave 1 — Launch all independent foundational utilities:
T006: Create ONLYOFFICE TypeScript type definitions in src/types/onlyoffice.ts
T007: Create ONLYOFFICE configuration utility in src/lib/onlyoffice/config.ts
T008: Create JWT utilities in src/lib/onlyoffice/jwt.ts

# Wave 2 — After types and JWT utilities complete:
T009: Create session lifecycle manager in src/lib/onlyoffice/session-manager.ts
T011: Implement document download API in src/app/api/contracts/[id]/download/route.ts
T012: Implement callback API in src/app/api/onlyoffice/callback/[contractId]/route.ts

# Wave 3 — After session manager complete:
T010: Implement token generation API in src/app/api/onlyoffice/token/route.ts
```

## Parallel Example: User Story 1

```text
# Wave 1 — Launch viewer and session manager in parallel:
T013: Create OnlyOfficeDocumentViewer component in onlyoffice-viewer/onlyoffice-document-viewer.tsx
T014: Create client-side session manager in onlyoffice-viewer/session-manager.tsx

# Wave 2 — After viewer component exists:
T015: Integrate viewer into contract detail page in page.tsx
T016: Add loading indicators, zoom, and navigation in onlyoffice-document-viewer.tsx

# Wave 3 — After integration:
T017: Add error handling and fallback in onlyoffice-document-viewer.tsx
```

---

## Implementation Strategy

### MVP First (User Stories 1 + 2 Only)

1. Complete Phase 1: Setup (Docker, deps, schema, env)
2. Complete Phase 2: Foundational (types, config, JWT, APIs)
3. Complete Phase 3: User Story 1 — Basic ONLYOFFICE viewing
4. **STOP and VALIDATE**: Verify document loads with perfect formatting
5. Complete Phase 4: User Story 2 — Finding comments injection
6. **STOP and VALIDATE**: Verify findings display as positioned comments
7. Deploy/demo if ready — **this is the MVP**

### Incremental Delivery

1. Setup + Foundational → Foundation ready
2. Add US1 → Test independently → Deploy (basic viewing works!)
3. Add US2 → Test independently → Deploy (findings as comments — **MVP!**)
4. Add US3 → Test independently → Deploy (Track Changes for decisions)
5. Add US4 → Test independently → Deploy (native Word export)
6. Add US5 → Test independently → Deploy (collaborative review)
7. Phase 8: Polish → Clean up deprecated code, add monitoring

### Deprecation Strategy

Feature 008 HTML viewer code should only be removed (Phase 8, T039–T042) after:
1. ONLYOFFICE integration is fully validated (US1 + US2 minimum)
2. Legacy contracts retain their existing viewer experience (no migration required)
3. Rollback plan is confirmed unnecessary

---

## Notes

- [P] tasks = different files, no dependencies on incomplete tasks
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- No test framework configured — manual testing per project constitution
- ONLYOFFICE Document Server must be running (Docker) for any viewer testing
- Avoid: vague tasks, same file conflicts, cross-story dependencies that break independence
