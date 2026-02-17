# Tasks: Interactive Document Viewer & Redline Export

**Feature**: 008-document-viewer-redline  
**Input**: Design documents from `/specs/008-document-viewer-redline/`  
**Prerequisites**: ✅ plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: None requested in spec - all testing will be manual per constitution

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story?] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2) - only for user story phases
- Include exact file paths in descriptions

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Install dependencies and configure database schema

- [ ] T001 Install document conversion dependencies: `npm install mammoth pdfjs-dist isomorphic-dompurify`
- [ ] T002 Install export dependencies: `npm install docx puppeteer`
- [ ] T003 Install rendering dependencies: `npm install react-window @types/react-window`
- [ ] T004 Copy pdf.worker.js to public directory: `cp node_modules/pdfjs-dist/build/pdf.worker.js public/`
- [ ] T005 Add ContractDocument model to `prisma/schema.prisma` with fields: id, contractId, originalPdfPath, htmlContent, pageCount, clausePositions, findingPositions, conversionStatus, conversionError, createdAt, updatedAt
- [ ] T006 Add ContractDocument relationship to Contract model in `prisma/schema.prisma`
- [ ] T007 Run Prisma migration: `npx prisma migrate dev --name add-contract-document`
- [ ] T008 Generate Prisma client: `npx prisma generate`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core document conversion and storage infrastructure that ALL user stories depend on

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [ ] T009 [P] Create TypeScript interfaces in `src/types/document-viewer.ts`: ClausePosition, FindingPosition, ConversionOptions, DocumentViewerProps
- [ ] T010 [P] Create document conversion utilities in `src/lib/document-converter.ts`: convertWordToHTML(), convertPDFToHTML(), detectFormat()
- [ ] T011 [P] Create position mapping utilities in `src/lib/position-mapper.ts`: calculatePositions(), injectClauseMarkers(), calculateFindingPositions()
- [ ] T012 [P] Create HTML sanitization wrapper in `src/lib/html-sanitizer.ts`: sanitizeHTML() using DOMPurify
- [ ] T013 Create internal conversion API endpoint `src/app/api/documents/convert/route.ts`: POST handler for document conversion (called from analysis)
- [ ] T014 Modify analysis endpoint `src/app/api/contracts/[id]/analyze/route.ts`: Add document conversion trigger after AI analysis completes
- [ ] T015 Create document viewer API endpoint `src/app/api/contracts/[id]/document/route.ts`: GET handler to fetch HTML and position mappings

**Checkpoint**: Foundation ready - document conversion pipeline works, user story implementation can now begin in parallel

---

## Phase 3: User Story 1 - View Full Document with Finding Highlights (Priority: P1) 🎯 MVP

**Goal**: Display full contract document with color-coded finding highlights, tooltips on hover, and clickable highlights that open findings panel

**Independent Test**: Upload a contract, run analysis, open contract detail page, verify: (1) full document renders, (2) findings are highlighted with correct colors (RED/YELLOW/GREEN), (3) tooltips appear on hover with finding summary, (4) clicking highlights opens findings panel

### Document Viewer Components (US1)

- [ ] T016 [P] [US1] Create base document viewer container `src/app/(app)/contracts/[id]/_components/document-viewer/document-viewer.tsx`: Main container with virtualized scrolling using react-window
- [ ] T017 [P] [US1] Create HTML renderer component `src/app/(app)/contracts/[id]/_components/document-viewer/html-renderer.tsx`: Render HTML content with proper sanitization
- [ ] T018 [P] [US1] Create highlight layer component `src/app/(app)/contracts/[id]/_components/document-viewer/highlight-layer.tsx`: Overlay for finding highlights with color coding (RED=high, YELLOW=medium, GREEN=low)
- [ ] T019 [P] [US1] Create position utilities `src/app/(app)/contracts/[id]/_components/document-viewer/position-utils.ts`: Helper functions for coordinate calculations
- [ ] T020 [US1] Integrate highlight tooltips in `highlight-layer.tsx`: Show finding summary and matched rule on hover
- [ ] T021 [US1] Implement click handlers in `highlight-layer.tsx`: Open findings panel when highlight clicked
- [ ] T022 [US1] Integrate document viewer into contract detail page `src/app/(app)/contracts/[id]/page.tsx`: Fetch document data, render DocumentViewer, maintain fallback to ClauseText

**Checkpoint**: User Story 1 complete - full document rendering with interactive highlights works independently

---

## Phase 4: User Story 2 - Navigate to Clause Positions (Priority: P1)

**Goal**: Enable bi-directional navigation between clause list and document viewer with smooth scrolling and scroll sync

**Independent Test**: Load contract with multiple clauses, verify: (1) clicking clause in left panel scrolls document to that position, (2) active clause is visually highlighted in document, (3) manually scrolling document updates selected clause in left panel after 200-300ms

### Navigation Implementation (US2)

- [ ] T023 [P] [US2] Create navigation controls component `src/app/(app)/contracts/[id]/_components/document-viewer/navigation-controls.tsx`: Next/Previous finding buttons
- [ ] T024 [US2] Implement scroll-to-clause in `document-viewer.tsx`: Smooth scroll to clause position when clicked in left panel
- [ ] T025 [US2] Implement active clause visual indicator in `html-renderer.tsx`: Add border/background highlight for currently viewed clause
- [ ] T026 [US2] Implement scroll sync (document → clause list) in `document-viewer.tsx`: Use Intersection Observer to detect visible clause, debounce 200-300ms
- [ ] T027 [US2] Update clause list component `src/app/(app)/contracts/[id]/_components/clause-list.tsx`: Add auto-scroll to keep selected clause visible
- [ ] T028 [US2] Integrate navigation controls into `document-viewer.tsx`: Wire up Next/Previous finding buttons

**Checkpoint**: User Story 2 complete - bi-directional navigation works independently, US1 functionality remains intact

---

## Phase 5: User Story 3 - View Tracked Changes in Document (Priority: P2)

**Goal**: Display tracked changes (deletions with red strikethrough, insertions with blue underline) overlaid on document with toggle and attribution tooltips

**Independent Test**: Make decisions on findings (accept, fallback, edit), toggle "Show Tracked Changes," verify: (1) original text shows with strikethrough, (2) replacement text shows with underline, (3) changes appear at correct positions, (4) toggle switches between views, (5) tooltips show user and timestamp

### Tracked Changes UI (US3)

- [ ] T029 [P] [US3] Create tracked changes layer component `src/app/(app)/contracts/[id]/_components/document-viewer/tracked-changes-layer.tsx`: Overlay for displaying deletions (red strikethrough) and insertions (blue underline)
- [ ] T030 [P] [US3] Create tracked changes legend component `src/app/(app)/contracts/[id]/_components/document-viewer/tracked-changes-legend.tsx`: Display change types and user attribution
- [ ] T031 [US3] Add tracked changes toggle in `document-viewer.tsx`: Button to show/hide tracked changes with state management
- [ ] T032 [US3] Fetch projection data for all clauses in `page.tsx`: Compute projections to get tracked changes data from decision history
- [ ] T033 [US3] Render tracked changes in `tracked-changes-layer.tsx`: Map projection data to visual overlays at correct positions
- [ ] T034 [US3] Implement change attribution tooltips in `tracked-changes-layer.tsx`: Show decision type, user name, and timestamp on hover
- [ ] T035 [US3] Integrate legend into `document-viewer.tsx`: Display tracked changes legend when toggle is ON

**Checkpoint**: User Story 3 complete - tracked changes display works independently, US1 & US2 functionality remains intact

---

## Phase 6: User Story 4 - Export Redlined Document (Priority: P2)

**Goal**: Generate and download redlined documents in Word (with Track Changes) or PDF format with all modifications and metadata

**Independent Test**: Make decisions on findings, click "Export Redline," download file, verify: (1) file contains all tracked changes, (2) formatting is correct (strikethrough/underline), (3) metadata is included (title, date, reviewer), (4) changes are attributed to users

### Export Infrastructure (US4)

- [ ] T036 [P] [US4] Create document exporter utilities in `src/lib/document-exporter.ts`: generateWordDocument(), generatePDFDocument() functions
- [ ] T037 [P] [US4] Create Word export logic in `src/lib/document-exporter.ts`: Use docx library to generate .docx with Track Changes format
- [ ] T038 [P] [US4] Create PDF export logic in `src/lib/document-exporter.ts`: Use Puppeteer to render HTML with visual markup to PDF
- [ ] T039 [US4] Create export API endpoint `src/app/api/contracts/[id]/export-redline/route.ts`: POST handler to generate and stream redlined documents
- [ ] T040 [US4] Add metadata embedding in `document-exporter.ts`: Include contract title, counterparty, export date, reviewer in both Word and PDF
- [ ] T041 [US4] Add change attribution in `document-exporter.ts`: Tag each change with author name and timestamp
- [ ] T042 [US4] Create redline export modal component `src/app/(app)/contracts/[id]/_components/redline-export-modal.tsx`: Format selection (Word/PDF) and export confirmation
- [ ] T043 [US4] Add "Export Redline" button to contract header in `page.tsx`: Trigger modal and handle download workflow

**Checkpoint**: User Story 4 complete - redline export works independently, US1-US3 functionality remains intact

---

## Phase 7: User Story 5 - Finding Indicators & Navigation (Priority: P3)

**Goal**: Add scrollbar markers, keyboard shortcuts, and finding counter for power users working with many findings

**Independent Test**: Load contract with multiple findings, verify: (1) scrollbar markers appear at finding positions, (2) next/previous buttons navigate between findings, (3) keyboard shortcuts work (Ctrl+↓/↑), (4) counter displays "Finding X of Y"

### Enhanced Navigation (US5)

- [ ] T044 [P] [US5] Add scrollbar markers in `document-viewer.tsx`: Render colored markers on custom scrollbar at finding positions
- [ ] T045 [P] [US5] Implement keyboard shortcuts in `document-viewer.tsx`: Add event listeners for Ctrl+↓/↑ (Cmd+↓/↑ on Mac) to navigate findings
- [ ] T046 [US5] Add finding counter in `navigation-controls.tsx`: Display "Finding X of Y" showing current position
- [ ] T047 [US5] Implement next/previous finding logic in `document-viewer.tsx`: Calculate finding order and navigate sequentially
- [ ] T048 [US5] Add filter integration in `navigation-controls.tsx`: Respect clause filters (risk level, resolution status) when navigating
- [ ] T049 [US5] Handle edge cases in `navigation-controls.tsx`: Disable/wrap at first/last finding

**Checkpoint**: User Story 5 complete - all enhanced navigation features work, US1-US4 functionality remains intact

---

## Phase 8: Performance & Polish

**Purpose**: Optimize performance, add loading states, error handling, and accessibility improvements

- [ ] T050 [P] Implement page caching in `document-viewer.tsx`: Cache rendered pages to improve scrolling performance
- [ ] T051 [P] Add loading states in `document-viewer.tsx`: Show skeleton loaders while document and positions are loading
- [ ] T052 [P] Add error handling in `document-viewer.tsx`: Display user-friendly errors for conversion failures, missing documents
- [ ] T053 [P] Optimize virtualized scrolling in `document-viewer.tsx`: Fine-tune overscanCount and item size calculations
- [ ] T054 [P] Add accessibility improvements: Keyboard navigation, ARIA labels, screen reader support
- [ ] T055 Implement conversion status polling in `page.tsx`: Auto-refresh when conversionStatus = 'processing'
- [ ] T056 Add export progress indicator in `redline-export-modal.tsx`: Show loading state during export generation
- [ ] T057 Test with large documents (200+ pages): Verify performance targets (< 3s first page load)

---

## Phase 9: Data Retention & Cleanup

**Purpose**: Implement retention policy for HTML documents and position data

- [ ] T058 Create retention policy utility in `src/lib/retention-policy.ts`: cleanupOldDocuments() function to delete HTML/positions after 90 days for draft/cancelled contracts
- [ ] T059 Add retention job configuration: Setup cron or scheduled task to run cleanupOldDocuments() daily
- [ ] T060 Add retention metadata tracking in `prisma/schema.prisma`: Optional retentionExempt and lastAccessedAt fields (if needed)
- [ ] T061 Test retention logic: Verify finalized contracts retained indefinitely, draft/cancelled deleted after 90 days

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup (Phase 1) completion - BLOCKS all user stories
- **User Stories (Phase 3-7)**: All depend on Foundational (Phase 2) completion
  - User stories CAN proceed in parallel (if staffed)
  - Or sequentially in priority order: US1 (P1) → US2 (P1) → US3 (P2) → US4 (P2) → US5 (P3)
- **Performance (Phase 8)**: Depends on desired user stories being complete
- **Retention (Phase 9)**: Can be done anytime after US1 complete

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Foundational (Phase 2) - No dependencies on other stories
- **User Story 2 (P1)**: Can start after Foundational (Phase 2) - Integrates with US1 but US1 must work independently first
- **User Story 3 (P2)**: Can start after Foundational (Phase 2) - Integrates with US1 but US1 must work independently first
- **User Story 4 (P2)**: Can start after Foundational (Phase 2) - Uses US3 tracked changes data but can work without US3
- **User Story 5 (P3)**: Can start after US1 complete - Enhances US1 navigation

### Within Each User Story

- Tasks marked [P] within a story can run in parallel
- Component creation before integration
- Basic functionality before enhancements
- Story complete before moving to next priority

### Parallel Opportunities

#### Phase 1 (Setup)
```
T001 + T002 + T003 can run in parallel (different dependencies)
T004 waits for T003 to complete
T005 + T006 can run in parallel (both edit schema)
```

#### Phase 2 (Foundational)
```
T009 + T010 + T011 + T012 can run in parallel (different files)
T013 waits for T010, T011, T012 to complete
T014 waits for T013 to complete
T015 waits for T013 to complete
```

#### Phase 3 (US1)
```
T016 + T017 + T018 + T019 can run in parallel (different component files)
T020 + T021 wait for T018 to complete
T022 waits for all US1 components to be ready
```

#### Phase 4 (US2)
```
T023 + T024 + T025 can run in parallel (different files/concerns)
T026, T027, T028 can be done sequentially or with partial overlap
```

#### Phase 5 (US3)
```
T029 + T030 can run in parallel (different component files)
T031, T032, T033, T034, T035 proceed sequentially
```

#### Phase 6 (US4)
```
T036 + T037 + T038 can run in parallel (different export formats in same file)
T039 waits for T036-T038 to complete
T040 + T041 can run in parallel (different metadata concerns)
T042 + T043 proceed after API is ready
```

#### Phase 7 (US5)
```
T044 + T045 + T046 can run in parallel (different UI concerns)
T047, T048, T049 proceed sequentially
```

#### Phase 8 (Performance)
```
T050 + T051 + T052 + T053 + T054 can run in parallel (different optimization areas)
T055, T056, T057 proceed independently
```

---

## Parallel Example: User Story 1 (MVP)

```bash
# After Foundational phase completes, launch all US1 components together:
Task T016: "Create base document viewer container"
Task T017: "Create HTML renderer component"
Task T018: "Create highlight layer component"
Task T019: "Create position utilities"

# Then proceed with integration tasks:
Task T020: "Integrate highlight tooltips"
Task T021: "Implement click handlers"
Task T022: "Integrate document viewer into page"
```

---

## Implementation Strategy

### MVP First (User Stories 1 & 2 Only)

**Rationale**: US1 and US2 are both P1 and deliver the core document viewing experience

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL - blocks all stories)
3. Complete Phase 3: User Story 1 (document rendering with highlights)
4. **VALIDATE US1**: Test independently - full document renders with interactive highlights
5. Complete Phase 4: User Story 2 (navigation and scroll sync)
6. **VALIDATE US2**: Test independently - navigation works, US1 still works
7. **STOP and DEMO**: Deploy MVP with full document viewing and navigation
8. Gather feedback before proceeding to P2 features

### Incremental Delivery (Recommended)

1. **MVP Release** (US1 + US2): Document viewer with highlights and navigation
   - Delivers immediate value: contextual document viewing
   - Validates core technology choices (mammoth.js, pdf.js, react-window)
   - Tests conversion pipeline with real contracts

2. **V2 Release** (Add US3): Tracked changes display
   - Builds on stable US1/US2 foundation
   - Delivers change preview capability
   - Prepares for export feature

3. **V3 Release** (Add US4): Redline export
   - Completes negotiation workflow
   - Enables external sharing
   - High business value feature

4. **V4 Release** (Add US5): Enhanced navigation for power users
   - Optional quality-of-life improvements
   - Can be delayed if not critical

### Parallel Team Strategy

With 2-3 developers:

1. **All together**: Complete Setup + Foundational (Phases 1-2)
2. **After Foundational complete**:
   - Developer A: User Story 1 (Phase 3)
   - Developer B: User Story 2 (Phase 4) - starts after US1 component structure is clear
   - Developer C: Start on US3 components (Phase 5) in parallel
3. **Integration**: Team reviews and tests US1+US2 together before moving to US3/US4

---

## Success Metrics (from spec.md)

Track these metrics to validate feature success:

- **SC-001**: Time to locate finding < 5 seconds (vs ~30s currently)
- **SC-002**: Document load < 3 seconds for 200-page contracts
- **SC-004**: Position accuracy within 1 paragraph
- **SC-005**: Navigation response < 500ms
- **SC-007**: 100% export success for finalized contracts < 30s
- **SC-008**: Word exports open correctly with Track Changes
- **SC-011**: 30% reduction in contract review time

---

## Notes

- **[P] tasks**: Different files, no dependencies - safe to parallelize
- **[Story] label**: Maps task to specific user story for traceability
- **Each user story**: Should be independently completable and testable
- **Checkpoints**: Stop and validate story independently before proceeding
- **Constitution compliance**: No test framework - all testing is manual
- **Integration approach**: Build components independently, then integrate into existing contract detail page
- **Fallback**: Keep existing ClauseText component as fallback for contracts without ContractDocument
- **Dependencies**: Leverages existing Features 005 (locationPage/locationPosition), 006/007 (projection system)
- **Commit frequently**: After each task or logical group
