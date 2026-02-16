# Tasks: Client Management

**Input**: Design documents from `/specs/004-client-management/`
**Prerequisites**: plan.md, spec.md, data-model.md, contracts/, research.md, quickstart.md

**Tests**: No test framework configured — test tasks excluded per constitution.

**Organization**: Tasks grouped by user story for independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2)
- Exact file paths included in descriptions

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Schema changes, migration, and shared utility code

- [x] T001 Update prisma/schema.prisma: add Client model, ClientContract model, extend Contract with optional clientId, add clientContracts relation to Document, add clientsCreated and clientContractsUploaded relations to User (see data-model.md for exact schema)
- [x] T002 Run Prisma migration: `npx prisma migrate dev --name add-client-management`
- [x] T003 [P] Create src/lib/industries.ts exporting INDUSTRIES constant array (Technology, Finance, Healthcare, Manufacturing, Energy, Legal, Retail, Other) and Industry type

**Checkpoint**: Database schema ready, Prisma client regenerated, industries utility available

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Sidebar navigation and core API routes that ALL user stories depend on

**⚠️ CRITICAL**: No user story UI work can begin until this phase is complete

- [x] T004 [P] Add "Clients" nav item to src/components/layout/sidebar.tsx: import Building2 from lucide-react, insert `{ href: "/clients", label: "Clients", icon: Building2 }` at index 2 in navItems array (after Contract Review, before NDA Triage)
- [x] T005 [P] Create src/app/api/clients/route.ts with GET handler (list active clients with `_count.contracts` and `createdByName`, filter `deleted: false`, order by `createdAt desc`) and POST handler (create client with name/country required, industry/contact/notes optional, validate country against COUNTRIES list and industry against INDUSTRIES list, set createdBy from session)
- [x] T006 [P] Create src/app/api/clients/[id]/route.ts with GET handler (single client with contracts and createdByName, 404 if not found or soft-deleted), PATCH handler (partial update with field validation, 404 if soft-deleted), DELETE handler (soft-delete: set deleted=true and deletedAt=now())

**Checkpoint**: Sidebar shows "Clients" link, core CRUD API endpoints operational

---

## Phase 3: User Story 1 — Create a New Client (Priority: P1) 🎯 MVP

**Goal**: Users can navigate to the Clients page, create new clients with name/country/optional fields, and see them in a table list.

**Independent Test**: Navigate to /clients → click "New Client" → fill form → submit → verify client appears in list.

### Implementation for User Story 1

- [x] T007 [US1] Create src/app/(app)/clients/page.tsx with: PageHeader ("Clients"), loading state, empty state ("No clients yet"), table with columns (Name, Country with flag, Industry, Contracts count, Created date, Actions), row click navigates to /clients/[id], "New Client" button in PageHeader actions
- [x] T008 [US1] Add "New Client" Dialog to src/app/(app)/clients/page.tsx with form fields: name (required Input), country (required Select from COUNTRIES list with flag emoji), industry (optional Select from INDUSTRIES list), contactPerson (optional Input), contactEmail (optional Input), contactPhone (optional Input), notes (optional Textarea). Validate required fields client-side, call POST /api/clients on submit, append new client to list optimistically, show toast on success/error

**Checkpoint**: User Story 1 fully functional — users can create clients and see them in the list

---

## Phase 4: User Story 2 — Attach Contract Documents to a Client (Priority: P1)

**Goal**: Users can open a client's detail page, upload contract documents (PDF/DOCX), see them listed, and remove them.

**Independent Test**: Create a client → navigate to /clients/[id] → upload a PDF → verify it appears in the contracts list → delete it → verify it disappears.

### Implementation for User Story 2

- [x] T009 [P] [US2] Create src/app/api/clients/[id]/contracts/route.ts with GET handler (list client's contracts with document details and uploadedByName) and POST handler (attach document to client: validate documentId exists, check for duplicate via unique constraint, set uploadedBy from session)
- [x] T010 [P] [US2] Create src/app/api/clients/[id]/contracts/[contractId]/route.ts with DELETE handler (remove ClientContract record, cascade deletes Document)
- [x] T011 [US2] Create src/app/(app)/clients/[id]/page.tsx with: PageHeader showing client name, client info section (country with flag, industry badge, contact details, notes, created by/date), attached contracts table (filename, file type, file size, upload date, actions column with Delete button), loading state, 404 handling for missing/deleted clients
- [x] T012 [US2] Add contract upload flow to src/app/(app)/clients/[id]/page.tsx: "Upload Contract" button opens dialog with FileDropzone component (reuse existing from src/components/shared/file-dropzone.tsx), optional title input, on submit: (1) POST file to /api/upload, (2) POST documentId to /api/clients/[id]/contracts, refresh contracts list, show toast
- [x] T013 [US2] Add delete contract action to attached contracts table in src/app/(app)/clients/[id]/page.tsx: DropdownMenu with "Delete" option, confirmation Dialog, call DELETE /api/clients/[id]/contracts/[contractId], remove from list optimistically, show toast

**Checkpoint**: User Story 2 fully functional — users can attach, view, and remove contract documents from clients

---

## Phase 5: User Story 3 — Browse and Filter Clients (Priority: P2)

**Goal**: Users can search clients by name and filter by country to find clients quickly.

**Independent Test**: Create multiple clients with different names/countries → type in search → verify filtering → select country filter → verify filtering → clear all → verify full list returns.

### Implementation for User Story 3

- [x] T014 [US3] Add search input for name filtering to src/app/(app)/clients/page.tsx: Input with search icon above table, client-side filter using useMemo, case-insensitive substring match on client name
- [x] T015 [US3] Add country dropdown filter to src/app/(app)/clients/page.tsx: Select component populated from COUNTRIES list (only show countries that have clients), "All Countries" default option, combine with name search filter
- [x] T016 [US3] Add "No clients match your filters" empty state to src/app/(app)/clients/page.tsx: show when filters are active but no results match, include "Clear filters" button to reset search and country filter

**Checkpoint**: User Story 3 fully functional — search and filter work correctly, empty state displayed when no matches

---

## Phase 6: User Story 4 — View and Edit Client Details (Priority: P2)

**Goal**: Users can edit all client fields from the detail page and see changes reflected immediately.

**Independent Test**: Navigate to a client → click Edit → change name and country → save → verify updated data persists on page reload.

### Implementation for User Story 4

- [x] T017 [US4] Add edit dialog to src/app/(app)/clients/[id]/page.tsx: "Edit" button in page header, Dialog with pre-filled form (same fields as create: name, country, industry, contact, notes), validate required fields, call PATCH /api/clients/[id], update displayed client data optimistically, show toast on success/error
- [x] T018 [US4] Add inline display of all client fields on src/app/(app)/clients/[id]/page.tsx: show contactPerson, contactEmail (mailto link), contactPhone (tel link), notes in a structured Card layout; show "—" for empty optional fields

**Checkpoint**: User Story 4 fully functional — all client fields editable and displayed correctly

---

## Phase 7: User Story 5 — Start Contract Review from Client's Contract (Priority: P3)

**Goal**: Users can initiate a contract review directly from a client's attached contract, creating an independent document copy.

**Independent Test**: Attach a contract to a client → click "Start Review" → fill title/ourSide → submit → verify redirected to contract review page → verify original client contract unchanged.

### Implementation for User Story 5

- [x] T019 [US5] Create src/app/api/clients/[id]/contracts/[contractId]/review/route.ts with POST handler: load source ClientContract + Document, copy file on disk to new uploads/ subdirectory (fs.copyFile), create new Document row with copied data, create new Contract row with clientId set to source client, return contractId for navigation
- [x] T020 [US5] Add "Start Review" action to attached contracts table in src/app/(app)/clients/[id]/page.tsx: button or DropdownMenu item per contract, opens Dialog with title (required Input) and ourSide (required Select: customer/vendor/licensor/licensee/partner), on submit call POST /api/clients/[id]/contracts/[contractId]/review, navigate to /contracts/[contractId] on success

**Checkpoint**: User Story 5 fully functional — reviews created from client contracts with independent document copies, original unchanged

---

## Phase 8: User Story 6 — Delete a Client (Priority: P3)

**Goal**: Users can soft-delete a client (with confirmation) and restore it. Reviews remain unaffected.

**Independent Test**: Create a client → attach contract → start review → delete client → verify client gone from list → verify review still works → restore client → verify it reappears.

### Implementation for User Story 6

- [x] T021 [P] [US6] Create src/app/api/clients/[id]/restore/route.ts with POST handler: find client, validate it is currently deleted, set deleted=false and deletedAt=null, return success
- [x] T022 [US6] Add soft-delete button with confirmation Dialog to src/app/(app)/clients/[id]/page.tsx: "Delete" button (destructive variant) in page header, confirmation Dialog warning about archiving, call DELETE /api/clients/[id] on confirm, navigate to /clients on success, show toast
- [x] T023 [US6] Add delete action to client list rows in src/app/(app)/clients/page.tsx: DropdownMenu "Delete" item per row, confirmation Dialog, call DELETE /api/clients/[id], remove from list optimistically, show toast

**Checkpoint**: User Story 6 fully functional — clients can be soft-deleted and restored, reviews unaffected

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: Final validation, cleanup, and consistency checks

- [x] T024 Run `npm run lint` across all new and modified files, fix any linting errors
- [x] T025 Verify all quickstart.md checklist items pass end-to-end
- [x] T026 Review and verify edge cases: duplicate client names allowed, unsupported file type rejected on upload, soft-deleted client returns 404 on detail page, reviews unaffected by client deletion

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: Depends on Phase 1 (T001, T002 must complete first; T003 parallel)
- **User Story 1 (Phase 3)**: Depends on Phase 2 completion
- **User Story 2 (Phase 4)**: Depends on Phase 2 completion; can run parallel to US1
- **User Story 3 (Phase 5)**: Depends on US1 (Phase 3) — extends the list page
- **User Story 4 (Phase 6)**: Depends on US2 (Phase 4) — extends the detail page
- **User Story 5 (Phase 7)**: Depends on US2 (Phase 4) — adds review action to detail page
- **User Story 6 (Phase 8)**: Depends on US1 (Phase 3) and US2 (Phase 4) — adds delete to both pages
- **Polish (Phase 9)**: Depends on all desired user stories being complete

### User Story Dependencies

```
Phase 1 (Setup) → Phase 2 (Foundational)
                        ↓
              ┌─────────┴─────────┐
              ↓                   ↓
     Phase 3 (US1)        Phase 4 (US2)
       List page           Detail page
         ↓                   ↓    ↓
   Phase 5 (US3)    Phase 6 (US4) Phase 7 (US5)
    Search/Filter     Edit client   Start Review
              ↓         ↓
           Phase 8 (US6)
         Delete/Restore
              ↓
        Phase 9 (Polish)
```

### Within Each User Story

- API routes before frontend pages
- Page structure before interactive features (dialogs, forms)
- Core display before action handlers

### Parallel Opportunities

- **Phase 1**: T003 (industries.ts) can run parallel to T001 + T002 (schema + migration)
- **Phase 2**: T004 (sidebar), T005 (list API), T006 (detail API) — all parallel (different files)
- **Phase 3 + Phase 4**: US1 (list page) and US2 (detail page + attachment APIs) can be built in parallel since they are different files
- **Phase 4**: T009 and T010 (API routes) can run parallel (different files)
- **Phase 8**: T021 (restore API) can run parallel with T022/T023 (UI delete buttons)

---

## Parallel Example: Foundational Phase

```
# All three tasks target different files — run in parallel:
T004: src/components/layout/sidebar.tsx
T005: src/app/api/clients/route.ts
T006: src/app/api/clients/[id]/route.ts
```

## Parallel Example: User Story 2

```
# API routes target different files — run in parallel:
T009: src/app/api/clients/[id]/contracts/route.ts
T010: src/app/api/clients/[id]/contracts/[contractId]/route.ts

# Then build UI (depends on API routes):
T011: src/app/(app)/clients/[id]/page.tsx (page structure)
T012: Same file (upload flow — after T011)
T013: Same file (delete action — after T011)
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (schema + migration + industries)
2. Complete Phase 2: Foundational (sidebar + core API routes)
3. Complete Phase 3: User Story 1 (client list page + create dialog)
4. **STOP and VALIDATE**: Can create clients and see them in a table
5. Demo-ready MVP

### Incremental Delivery

1. Setup + Foundational → Foundation ready
2. Add US1 (Create Client) → MVP! Clients appear in sidebar, can create and list clients
3. Add US2 (Attach Contracts) → Detail page with document uploads
4. Add US3 (Search/Filter) → Client list becomes productive for daily use
5. Add US4 (Edit Details) → Full client lifecycle management
6. Add US5 (Start Review) → Connects clients to contract review workflow
7. Add US6 (Delete Client) → Complete feature with soft-delete and restore
8. Polish → Final validation

---

## Summary

| Phase | Story | Tasks | Parallel Tasks |
|-------|-------|-------|----------------|
| Phase 1: Setup | — | 3 | 1 |
| Phase 2: Foundational | — | 3 | 3 |
| Phase 3: US1 — Create Client | P1 🎯 MVP | 2 | 0 |
| Phase 4: US2 — Attach Contracts | P1 | 5 | 2 |
| Phase 5: US3 — Browse & Filter | P2 | 3 | 0 |
| Phase 6: US4 — View & Edit | P2 | 2 | 0 |
| Phase 7: US5 — Start Review | P3 | 2 | 0 |
| Phase 8: US6 — Delete Client | P3 | 3 | 1 |
| Phase 9: Polish | — | 3 | 0 |
| **Total** | **6 stories** | **26 tasks** | **7 parallelizable** |

---

## Notes

- [P] tasks = different files, no dependencies — safe to execute in parallel
- [USn] label maps task to specific user story for traceability
- No test tasks generated — no test framework configured (per constitution)
- All API routes follow existing patterns: `getSessionOrUnauthorized()` for auth, `db` from `@/lib/db`, `NextResponse.json()` for responses
- All pages follow existing patterns: `"use client"`, `PageHeader`, `Table`, `Dialog`, `toast` from sonner
- Country display: use `getCountryByCode()` from `@/lib/countries` for flag + name
- File upload: reuse existing `FileDropzone` component and `POST /api/upload` endpoint
