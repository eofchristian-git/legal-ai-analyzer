# Implementation Plan: Collabora Online Viewer Integration (Replacing ONLYOFFICE)

**Branch**: `ivku/009-onlyoffice-viewer` | **Date**: 2026-02-18 | **Spec**: User-provided (inline)  
**Input**: ONLYOFFICE → Collabora viewer replacement specification

---

## Summary

Replace the ONLYOFFICE Document Editor integration with Collabora Online (CODE)
as the embedded read-only DOCX viewer. The migration preserves all existing
behaviors: sidebar clause navigation → document scroll, server-side DOCX
mutation → viewer reload, status-based highlighting, and read-only enforcement.

**Key Technical Approach**:
- Deploy Collabora CODE as a Docker container (replacing ONLYOFFICE Docker).
- Implement WOPI protocol endpoints (CheckFileInfo, GetFile) in Next.js API.
- Embed Collabora via `<iframe>` with postMessage API for navigation.
- Stateless JWT tokens for WOPI access (eliminating the `OnlyOfficeSession` DB table).
- `.uno:ExecuteSearch` command via postMessage for clause-to-document navigation.

**What does NOT change**:
- AI clause extraction, triage workflow, fallback language logic.
- Server-side DOCX mutation pipeline (docx library).
- Audit history, status → highlight mapping.
- Clause list sidebar, findings panel, all non-viewer UI.

---

## Technical Context

**Language/Version**: TypeScript 5.x, Node.js 20+, Next.js 16 (App Router)  
**Primary Dependencies**: Collabora CODE (Docker), WOPI protocol, `jsonwebtoken` (kept)  
**Storage**: Prisma ORM with SQLite (no schema additions — removes `OnlyOfficeSession`)  
**Testing**: Manual verification (no test framework configured per constitution)  
**Target Platform**: Windows 10+ (dev), Docker Desktop  
**Project Type**: Web application (Next.js full-stack)  
**Performance Goals**: Document load < 5 seconds, clause navigation < 500ms  
**Constraints**: Read-only viewer, no bookmarks in DOCX, no real-time collaboration  
**Scale/Scope**: Single-user viewing, documents up to 100+ pages

---

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

### Pre-Research Check

| # | Principle | Status | Notes |
|---|-----------|--------|-------|
| I | **Data Integrity** | ✅ PASS | Removing `OnlyOfficeSession` table (no longer needed). All legal data (contracts, analyses, decisions) untouched. WOPI tokens are stateless — no data loss risk. |
| II | **Simplicity** | ✅ PASS | Migration *simplifies* the architecture: removes ONLYOFFICE Connector API (required Enterprise Edition), removes session DB table, removes callback handler, removes lock/presence management. Replaces with standard WOPI + iframe + postMessage. |
| III | **AI-Assisted, Human-Controlled** | ✅ PASS | No AI changes. Viewer is a display-only component. |
| TC | **Technology Constraints** | ✅ PASS | Next.js App Router with TypeScript. Uses existing `jsonwebtoken` package. Removes `@onlyoffice/document-editor-react` dependency. No new npm packages needed. |
| DDP | **Data Design Patterns** | ✅ PASS | Event sourcing for clause decisions untouched. Viewer just reloads the resulting DOCX. |

### Post-Design Re-Check

| # | Principle | Status | Notes |
|---|-----------|--------|-------|
| I | **Data Integrity** | ✅ PASS | Stateless WOPI tokens include `fileId`, `userId`, `permission` — auditable via existing `ActivityLog`. |
| II | **Simplicity** | ✅ PASS | Net reduction in complexity: -1 DB model, -6 API routes, -1 npm dependency, -7 library files. Replaced by +2 WOPI endpoints, +1 session endpoint, +1 health endpoint, +1 iframe component. |
| III | **AI-Assisted, Human-Controlled** | ✅ PASS | No changes. |
| TC | **Technology Constraints** | ✅ PASS | `<iframe>` + `postMessage` are web platform standards. No `any` types needed. |
| DDP | **Data Design Patterns** | ✅ PASS | No new data patterns. Removes unused patterns (session lifecycle). |

---

## Project Structure

### Documentation (this feature)

```text
specs/ivku/009-onlyoffice-viewer/
├── plan.md              # This file
├── research.md          # Phase 0 output — Collabora research
├── data-model.md        # Phase 1 output — Schema changes
├── quickstart.md        # Phase 1 output — Deployment guide
├── contracts/
│   ├── wopi-endpoints.yaml    # WOPI API contracts
│   └── viewer-session.yaml    # Frontend session API contracts
└── tasks.md             # Phase 2 output (created by /speckit.tasks)
```

### Source Code (changes from repository root)

```text
# ─── NEW FILES ─────────────────────────────────────────────
docker/collabora/
├── docker-compose.yml           # Collabora CODE container setup
└── .env.example                 # Environment variable template

src/lib/collabora/
├── config.ts                    # Collabora configuration & URL builders
├── wopi-token.ts                # JWT token generation & validation
├── discovery.ts                 # WOPI discovery endpoint client (cached)
└── navigation.ts                # Clause-to-search text resolution

src/app/api/wopi/files/[fileId]/
├── route.ts                     # GET → CheckFileInfo
└── contents/
    └── route.ts                 # GET → GetFile

src/app/api/collabora/
├── session/route.ts             # POST → Create viewer session (frontend-facing)
└── health/route.ts              # GET → Collabora health check

src/app/(app)/contracts/[id]/_components/collabora-viewer/
├── collabora-document-viewer.tsx   # Main iframe-based viewer component
├── use-collabora-postmessage.ts    # PostMessage hook for navigation/UI control
└── use-clause-navigation.ts        # Clause search-and-scroll logic

src/types/collabora.ts           # TypeScript type definitions

# ─── MODIFIED FILES ────────────────────────────────────────
src/middleware.ts                 # Update bypass rules for WOPI routes
src/app/(app)/contracts/[id]/page.tsx  # Update imports to Collabora viewer
prisma/schema.prisma             # Remove OnlyOfficeSession model

# ─── REMOVED FILES ─────────────────────────────────────────
docker/onlyoffice/               # Entire directory
src/lib/onlyoffice/              # Entire directory (7 files)
src/app/api/onlyoffice/          # Entire directory (5 route files)
src/app/api/contracts/[id]/download/  # Replaced by WOPI GetFile
src/app/api/cron/cleanup-sessions/    # No sessions to clean up
src/app/(app)/contracts/[id]/_components/onlyoffice-viewer/  # Entire directory (5 files)
src/types/onlyoffice.ts          # Replaced by collabora.ts
```

**Structure Decision**: Single Next.js application. New files follow existing
patterns. Collabora library files mirror the structure of the ONLYOFFICE files
they replace, but simplified (fewer files due to removed features like
callback handling, session management, lock/presence APIs).

---

## Complexity Tracking

> **No violations to justify.** The migration reduces complexity.

| Metric | Before (ONLYOFFICE) | After (Collabora) | Change |
|--------|---------------------|-------------------|--------|
| DB models | +1 (`OnlyOfficeSession`) | 0 | -1 |
| API routes | 6 (token, callback, health, lock, presence, download) | 4 (checkFileInfo, getFile, session, health) | -2 |
| npm packages | 1 (`@onlyoffice/document-editor-react`) | 0 | -1 |
| Library files | 7 (`src/lib/onlyoffice/*`) | 4 (`src/lib/collabora/*`) | -3 |
| Frontend components | 5 (`onlyoffice-viewer/*`) | 3 (`collabora-viewer/*`) | -2 |
| Session cleanup cron | 1 | 0 | -1 |

---

## Implementation Phases

### Phase 1: Infrastructure Setup
**Goal**: Docker + environment + WOPI endpoints + health check

| Task | Description | Dependencies |
|------|-------------|-------------|
| T001 | Create `docker/collabora/docker-compose.yml` with CODE image | None |
| T002 | Create `docker/collabora/.env.example` | T001 |
| T003 | Add Collabora env vars to `.env.local` | T001 |
| T004 | Create `src/lib/collabora/config.ts` — server URL, JWT secret, base URLs | T003 |
| T005 | Create `src/lib/collabora/wopi-token.ts` — JWT generation/validation | T004 |
| T006 | Create `src/lib/collabora/discovery.ts` — cached WOPI discovery client | T004 |
| T007 | Create `src/types/collabora.ts` — TypeScript type definitions | None |
| T008 | Create `GET /api/wopi/files/[fileId]/route.ts` — CheckFileInfo | T005, T007 |
| T009 | Create `GET /api/wopi/files/[fileId]/contents/route.ts` — GetFile | T005, T007 |
| T010 | Create `POST /api/collabora/session/route.ts` — session creation | T005, T006, T007 |
| T011 | Create `GET /api/collabora/health/route.ts` — health check | T004 |
| T012 | Update `src/middleware.ts` — bypass auth for WOPI routes | T008, T009 |

### Phase 2: Viewer Component
**Goal**: Replace ONLYOFFICE viewer with Collabora iframe + postMessage

| Task | Description | Dependencies |
|------|-------------|-------------|
| T013 | Create `collabora-document-viewer.tsx` — main iframe component | T010, T007 |
| T014 | Create `use-collabora-postmessage.ts` — postMessage hook | T013 |
| T015 | Create `use-clause-navigation.ts` — search-and-scroll logic | T014 |
| T016 | Create `src/lib/collabora/navigation.ts` — clause text → search string resolution | T007 |
| T017 | Update `contracts/[id]/page.tsx` — swap ONLYOFFICE viewer for Collabora viewer | T013 |

### Phase 3: Reload & Navigation
**Goal**: Document reload after mutations + re-navigation

| Task | Description | Dependencies |
|------|-------------|-------------|
| T018 | Implement iframe reload with version-token cache busting | T013, T017 |
| T019 | Implement re-navigation after reload (store active clause → re-search) | T015, T018 |
| T020 | Add loading overlay during reload (flicker mitigation) | T018 |

### Phase 4: Edge Cases & Fallbacks
**Goal**: Handle failures gracefully

| Task | Description | Dependencies |
|------|-------------|-------------|
| T021 | Implement error fallback UI (Collabora unavailable → download link) | T013 |
| T022 | Handle search mismatch (clause text not found in document) | T015 |
| T023 | Handle repeated text disambiguation (position-based sequential search) | T015 |
| T024 | Test with large documents (100+ pages) | T013 |

### Phase 5: Schema Cleanup
**Goal**: Remove ONLYOFFICE database model

| Task | Description | Dependencies |
|------|-------------|-------------|
| T025 | Remove `OnlyOfficeSession` model from `prisma/schema.prisma` | T017 (viewer working) |
| T026 | Remove `onlyOfficeSessions` relation from `Contract` model | T025 |
| T027 | Remove `onlyOfficeSessions` relation from `User` model | T025 |
| T028 | Run `npx prisma db push` to apply schema changes | T026, T027 |

### Phase 6: Code Removal — ONLYOFFICE
**Goal**: Clean up all ONLYOFFICE-specific code

| Task | Description | Dependencies |
|------|-------------|-------------|
| T029 | Remove `src/lib/onlyoffice/` directory (7 files) | T017 (Collabora working) |
| T030 | Remove `src/app/api/onlyoffice/` directory (5 route files) | T017 |
| T031 | Remove `src/app/api/contracts/[id]/download/route.ts` | T009 (WOPI GetFile replacing it) |
| T032 | Remove `src/app/api/cron/cleanup-sessions/route.ts` | T025 (no sessions) |
| T033 | Remove `src/app/(app)/contracts/[id]/_components/onlyoffice-viewer/` directory | T017 |
| T034 | Remove `src/types/onlyoffice.ts` | T007 (collabora.ts replacing it) |
| T035 | Remove `@onlyoffice/document-editor-react` from `package.json` | T033 |
| T036 | Remove `docker/onlyoffice/` directory | T001 (Collabora Docker replacing it) |
| T037 | Clean up old ONLYOFFICE env vars from `.env.local` | T003 |
| T038 | Update `src/middleware.ts` — remove ONLYOFFICE route comments/references | T012 |

### Phase 7: Validation
**Goal**: End-to-end verification

| Task | Description | Dependencies |
|------|-------------|-------------|
| T039 | Build verification (`npm run build` passes) | T029–T038 |
| T040 | Manual E2E test: load document, navigate clauses, apply fallback, reload | T039 |
| T041 | Verify all existing features still work (triage, export, audit) | T039 |

---

## Risk Assessment

| Risk | Probability | Impact | Mitigation |
|------|------------|--------|------------|
| Collabora postMessage API doesn't support `.uno:ExecuteSearch` as expected | Low | High | Test early in Phase 2. Fallback: use `.uno:Search` with manual navigation. |
| Different DOCX rendering between Collabora and ONLYOFFICE | Low | Medium | Visual review during testing. Collabora uses LibreOffice engine — excellent DOCX support. |
| Docker `host.docker.internal` networking issues | Low | Medium | Same pattern as ONLYOFFICE (already working). Well-documented. |
| Collabora CODE image is large (~1.5GB download) | Low | Low | One-time download. Same order of magnitude as ONLYOFFICE. |
| WOPI access token expiration during long viewing sessions | Medium | Low | 4-hour expiry is generous. Can implement iframe URL refresh if needed. |

---

## Dependency Map

```
T001 (Docker) ──────────────────────────┐
T002 (env.example) ◄── T001            │
T003 (env vars) ◄── T001               │
T004 (config) ◄── T003                 │
T005 (wopi-token) ◄── T004             │
T006 (discovery) ◄── T004              │
T007 (types) ── (independent)          │
                                        │
T008 (CheckFileInfo) ◄── T005, T007    │
T009 (GetFile) ◄── T005, T007          │
T010 (session) ◄── T005, T006, T007    │
T011 (health) ◄── T004                 │
T012 (middleware) ◄── T008, T009       │
                                        │
T013 (viewer component) ◄── T010, T007 │
T014 (postMessage hook) ◄── T013       │
T015 (clause nav) ◄── T014             │
T016 (nav util) ◄── T007               │
T017 (page integration) ◄── T013       │
                                        │
T018 (reload) ◄── T013, T017           │
T019 (re-navigation) ◄── T015, T018    │
T020 (loading overlay) ◄── T018        │
                                        │
T021 (error fallback) ◄── T013         │
T022 (search mismatch) ◄── T015        │
T023 (repeated text) ◄── T015          │
T024 (large doc test) ◄── T013         │
                                        │
T025–T028 (schema cleanup) ◄── T017    │
T029–T038 (code removal) ◄── T017      │
T039–T041 (validation) ◄── T025–T038   │
```

### Parallelization Opportunities

- **T001, T007**: Docker setup and types can be done in parallel.
- **T008, T009**: Both WOPI endpoints can be built in parallel (after T005 and T007).
- **T010, T011**: Session and health endpoints in parallel.
- **T021–T024**: All edge case handling tasks can be parallelized.
- **T025–T028**: Schema cleanup is sequential (model removal → push).
- **T029–T038**: Code removal tasks can be parallelized.
