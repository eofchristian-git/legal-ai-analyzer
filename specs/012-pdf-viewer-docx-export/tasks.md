# Tasks: PDF Document Viewer & Original-File Export

**Input**: Design documents from `specs/012-pdf-viewer-docx-export/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/

**Tests**: No test framework configured. Manual verification per quickstart.md.

**Organization**: Tasks grouped by user story. Each story is independently testable after its phase completes.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Install dependencies, add database fields, create shared types

- [X] T001 Install npm packages: `npm install pdf-lib jszip fast-xml-parser` in `package.json`
- [X] T002 Add PDF viewer fields to `ContractDocument` model in `prisma/schema.prisma`: `pdfPath` (String?), `pdfPageCount` (Int?), `textPositions` (String?), `clausePositionMappings` (String?), `findingPositionMappings` (String?), `pdfConversionStatus` (String @default("pending")), `pdfConversionError` (String?). Run `npx prisma migrate dev --name add-pdf-viewer-fields`
- [X] T003 [P] Verify/configure LibreOffice headless — ensure `soffice` is on PATH (local dev) or add LibreOffice to `docker-compose.yml` (Docker dev). Verify with `soffice --version`. If not available: document installation steps in quickstart.md prerequisites. This is a **blocking prerequisite** for Phase 2 PDF pipeline (T005 `convertDocxToPdf()`).
- [X] T004 [P] Create PDF viewer types in `src/types/pdf-viewer.ts`: `TextPosition`, `ClausePdfMapping`, `FindingPdfMapping`, `PageOverlayData`, `PdfDocumentResponse` interfaces per data-model.md

---

## Phase 2: Foundational — PDF Generation Pipeline (Blocking Prerequisites)

**Purpose**: Server-side DOCX → PDF conversion + text position extraction + position mapping. MUST complete before any viewer user story.

**⚠️ CRITICAL**: No viewer or navigation work can begin until this phase is complete — the PDF file and position mappings are prerequisites for all viewer-side user stories.

- [X] T005 [P] Create `convertDocxToPdf()` function in `src/lib/pdf-pipeline.ts` — calls LibreOffice headless CLI (`soffice --headless --convert-to pdf`) to convert DOCX to PDF, returns output path. Handle process errors, timeouts, and missing LibreOffice gracefully.
- [X] T006 [P] Create `extractTextPositions()` function in `src/lib/pdf-pipeline.ts` — uses `pdfjs-dist` `getDocument()` + `page.getTextContent()` to extract text spans as `TextPosition[]` with `(text, pageIndex, x, y, width, height)`. Flip PDF coordinate system to top-down.
- [X] T007 [P] Create `mapExcerptToPositions()` function in `src/lib/pdf-position-mapper.ts` — given an excerpt string and a `TextPosition[]` array, finds the best matching run of positions using normalized text comparison. Fallback to Levenshtein distance for fuzzy matching. Returns `{ rects, pageIndex, confidence, unmapped }`. **Confidence scoring**: 1.0 = exact match after normalization, 0.8–0.99 = fuzzy match (whitespace/punctuation differences), <0.8 = poor match. **Threshold**: confidence < 0.7 → mark `unmapped: true` and log a warning with the excerpt text. **Duplicate handling**: if multiple exact matches exist for the same excerpt, prefer the match whose surrounding text best aligns with the clause context from `AnalysisClause.clauseText`.
- [X] T008 Create `runPdfPipeline()` orchestrator in `src/lib/pdf-pipeline.ts` — chains: convert → extract → map clauses → map findings → save all results to `ContractDocument` fields. Updates `pdfConversionStatus` at each stage ('converting' → 'extracting' → 'mapping' → 'completed' or 'failed').
- [X] T009 Trigger PDF pipeline after analysis in `src/app/api/contracts/[id]/analyze/route.ts` — after AI analysis completes and clauses/findings are saved, call `runPdfPipeline()`. Run asynchronously (don't block the analysis response).
- [X] T010 Create PDF document API endpoint in `src/app/api/contracts/[id]/pdf-document/route.ts` — GET returns JSON with `pdfUrl`, `pageCount`, `conversionStatus`, `clauseMappings[]`, `findingMappings[]` per contracts/pdf-document-api.md. Add sub-route `/file` that streams the PDF binary.

**Checkpoint**: After this phase, `GET /api/contracts/{id}/pdf-document` returns a valid PDF URL and position mappings for an analyzed contract. Verify by running analysis on a test contract and checking the API response.

---

## Phase 3: User Story 1 — View Contract with Risk Highlights (P1) 🎯 MVP

**Goal**: Reviewer opens a contract and sees the document rendered with high fidelity, with risk-level color highlights already visible on all findings. No preparation delay.

**Independent Test**: Upload a contract, run analysis, open the contract detail page. Document is visible within 3 seconds with all risk highlights present. Scroll through — pages load smoothly.

**Delivers**: FR-001, FR-002, FR-013

### Implementation

- [X] T011 [P] [US1] Create PDF page renderer component in `src/app/(app)/contracts/[id]/_components/pdf-viewer/pdf-page-renderer.tsx` — renders one PDF page using `pdfjs-dist` `page.render()` onto a `<canvas>` element. Accept `pdfDocument`, `pageIndex`, `scale` props. Handle loading/error states.
- [X] T012 [P] [US1] Create risk highlight overlay component in `src/app/(app)/contracts/[id]/_components/pdf-viewer/risk-highlight-overlay.tsx` — renders colored semi-transparent `<div>` rectangles positioned absolutely over finding locations. Props: `findingMappings[]` with risk levels. Colors: red (#FF000030), yellow (#FFD70030), green (#00800030).
- [X] T013 [US1] Create overlay manager component in `src/app/(app)/contracts/[id]/_components/pdf-viewer/overlay-manager.tsx` — combines overlay layers per page. Props: `pageIndex`, `findingMappings`, `clauseProjections`. For this phase, only renders `<RiskHighlightOverlay>`. Will be extended in US3 and US5 phases.
- [X] T014 [US1] Create PDF viewer container in `src/app/(app)/contracts/[id]/_components/pdf-viewer/pdf-viewer.tsx` — virtualized scrolling container using `react-window` `VariableSizeList`. Loads `pdfjs-dist` document, renders `<PdfPageRenderer>` + `<OverlayManager>` per visible page. Exposes `scrollToPage(pageIndex, yOffset)` via ref. Handle PDF loading, error, and "conversion pending" states.
- [X] T015 [P] [US1] Create barrel export in `src/app/(app)/contracts/[id]/_components/pdf-viewer/index.ts` — export `PdfViewer` and types.
- [X] T016 [US1] Add `'pdf'` document view mode to `src/app/(app)/contracts/[id]/page.tsx` — fetch PDF data from `/api/contracts/{id}/pdf-document`, render `<PdfViewer>` when `pdfConversionStatus === 'completed'`. Pass `findingMappings` to viewer. **State handling**: (a) `'pending'`/`'converting'`/`'extracting'`/`'mapping'` → show spinner with "Preparing document..." message, (b) `'failed'` → show alert with `pdfConversionError` message and a "Retry Analysis" prompt (e.g., "LibreOffice could not convert this file — it may be corrupted or in an unsupported format"), (c) `'completed'` but PDF file missing → show "Document file unavailable" error.

**Checkpoint**: Open a contract with completed analysis + PDF conversion. Document renders in <3s with risk highlights. Scroll works smoothly with virtualized pages. **Performance verification**: use browser DevTools Performance tab to measure: (a) time from page navigation to first PDF page paint (target: <3s, SC-002), (b) scroll through a 50+ page document — no frames >100ms (SC-008). Add `console.time('[PDF] Document ready')` / `console.timeEnd` in the viewer load path for ongoing measurement.

---

## Phase 4: User Story 2 — Navigate Between Clauses (P1)

**Goal**: Clicking a clause in the left panel scrolls to the exact position in the document. Scrolling the document updates the selected clause in the panel. Works for >95% of clauses.

**Independent Test**: Open an analyzed contract. Click each clause — document scrolls to correct location. Scroll manually — clause list highlights the visible clause.

**Delivers**: FR-003, FR-004, FR-015

### Implementation

- [X] T017 [P] [US2] Create clause navigation hook in `src/app/(app)/contracts/[id]/_components/pdf-viewer/use-pdf-navigation.ts` — `usePdfNavigation(clauseMappings, scrollToPage)` returns `scrollToClause(clauseId)`. Looks up `ClausePdfMapping` by clauseId → calls `scrollToPage(pageIndex, startRect.y)`. If clause is unmapped, returns false. Handles re-click on same clause.
- [X] T018 [P] [US2] Create scroll-sync hook in `src/app/(app)/contracts/[id]/_components/pdf-viewer/use-scroll-sync.ts` — `useScrollSync(clauseMappings, visiblePageRange)` uses Intersection Observer pattern on clause start positions to determine which clause is currently visible. Returns `activeClauseId`. Debounced to avoid rapid updates during fast scrolling.
- [X] T019 [US2] Wire clause navigation in `src/app/(app)/contracts/[id]/page.tsx` — pass `selectedClauseId` to `<PdfViewer>` which triggers `scrollToClause()`. Wire `onActiveClauseChange` callback from scroll-sync back to update `selectedClauseId` in parent state. Wire `onClauseClick` from `<ClauseList>` to set `selectedClauseId`.
- [X] T020 [US2] Add unmapped clause indicator in `src/app/(app)/contracts/[id]/_components/clause-list.tsx` — clauses where `ClausePdfMapping.unmapped === true` show a small warning icon (⚠️ or `AlertTriangle` from lucide-react). Clicking an unmapped clause shows a toast: "Could not locate this clause in the document" instead of attempting to scroll.

**Checkpoint**: Click each clause in the left panel. Document scrolls correctly for >95% of clauses. Scroll manually — clause list updates. Unmapped clauses show warning icon.

---

## Phase 5: User Story 3 — Apply Fallback Language Instantly (P1)

**Goal**: When a fallback is applied, the document instantly shows strikethrough on original text + replacement text as a distinct annotation. Undo removes the overlay. No 3.5-second delays.

**Independent Test**: Apply a fallback on a finding. Document updates within 500ms with visible strikethrough + replacement. Undo the fallback — overlay disappears instantly.

**Delivers**: FR-005, FR-006

### Implementation

- [X] T021 [P] [US3] Create redline overlay component in `src/app/(app)/contracts/[id]/_components/pdf-viewer/redline-overlay.tsx` — for findings with applied fallbacks: renders a red strikethrough line over the original text rects + a green-bordered annotation box below/beside with the replacement text. Props: `findingMapping`, `projection` (from `computeProjection()`). Only visible when projection shows `APPLY_FALLBACK` action.
- [X] T022 [US3] Extend overlay manager to include redline overlays in `src/app/(app)/contracts/[id]/_components/pdf-viewer/overlay-manager.tsx` — for each finding on the current page, check projection status. If `APPLY_FALLBACK`: render `<RedlineOverlay>` instead of (or on top of) `<RiskHighlightOverlay>`.
- [X] T023 [US3] Wire fallback/undo to overlay refresh in `src/app/(app)/contracts/[id]/page.tsx` — when `onFallbackApplied` or `onFallbackUndone` fires, `historyRefreshKey` increments (already exists) → projections re-fetch → overlay manager re-renders with updated state. Remove Collabora-specific state: `pendingRedline`, `pendingUndoRedline`, `collaboraReloadTrigger`, `CollaboraPendingQueueProvider` wrapper.

**Checkpoint**: Apply a fallback — strikethrough + replacement text visible in <500ms. Undo — overlay disappears in <500ms. Navigate away and back — applied fallbacks remain visible. **Performance verification**: use DevTools Performance tab to measure time from fallback button click to overlay re-render (target: <500ms, SC-003).

---

## Phase 6: User Story 4 — Export Original Contract with All Changes (P1)

**Goal**: Export the original DOCX with native Word Track Changes (deletions + insertions) and Word Comments containing risk level, AI summary, and reviewer notes. Replaces existing reconstructed export.

**Independent Test**: Triage a contract (3 fallbacks, 2 notes). Export as "Original with Changes (.docx)". Open in Word — tracked changes with Accept/Reject, comments in margin, original formatting preserved.

**Delivers**: FR-008, FR-009, FR-010

### Implementation

- [X] T024 [P] [US4] Create DOCX XML text finder `findTextInDocXml()` in `src/lib/docx-modifier.ts` — parse `word/document.xml` with `fast-xml-parser` (options: `preserveOrder: true`, `ignoreAttributes: false`, `trimValues: false`). Concatenate `<w:t>` text across `<w:r>` runs per `<w:p>` paragraph. Find excerpt by normalized string match. Return paragraph index, run indices, and character offsets within runs. **Duplicate handling**: if the excerpt appears in multiple paragraphs, disambiguate by matching surrounding context from the associated `AnalysisClause.clauseText` — prefer the occurrence within or nearest to the clause's paragraph range. If still ambiguous, use the first occurrence and log a warning.
- [X] T025 [P] [US4] Create XML run splitter `splitRunAtOffset()` in `src/lib/docx-modifier.ts` — given a `<w:r>` element and a character offset, split it into two `<w:r>` elements. Both halves inherit the original `<w:rPr>` (formatting properties). Handle edge cases: offset at start (no split needed), offset at end (no split needed), run with no `<w:rPr>`.
- [X] T026 [US4] Create Track Changes injector `injectTrackedChange()` in `src/lib/docx-modifier.ts` — given matched runs and replacement text: (1) wrap original runs in `<w:del w:author="Legal AI Analyzer" w:date="{ISO timestamp}">`, (2) replace `<w:t>` with `<w:delText>` inside deletions, (3) insert `<w:ins>` after with replacement text copying original `<w:rPr>`, (4) assign incrementing `w:id` attributes.
- [X] T027 [P] [US4] Create Word comments builder `buildCommentsXml()` in `src/lib/docx-modifier.ts` — generate `word/comments.xml` with `<w:comment>` entries. Each comment contains: "⚠ {RISK_LEVEL}: {finding.summary}\n\n{reviewer notes if any}". Author = "Legal AI Analyzer". Date = decision timestamp. Return comment XML string + mapping of commentId → excerpt for range markers.
- [X] T028 [P] [US4] Create comments relationship setup `ensureCommentsRelationship()` in `src/lib/docx-modifier.ts` — check if `word/comments.xml` already exists in the ZIP. If not: add it to `[Content_Types].xml` with content type `application/vnd.openxmlformats-officedocument.wordprocessingml.comments+xml`. Add relationship entry to `word/_rels/document.xml.rels`. Insert `<w:commentRangeStart>` / `<w:commentRangeEnd>` / `<w:commentReference>` into `document.xml`.
- [X] T029 [US4] Create main export orchestrator `modifyOriginalDocx()` in `src/lib/docx-modifier.ts` — (1) read original DOCX from `Document.filePath`, (2) unzip with `jszip`, (3) parse `word/document.xml`, (4) for each finding with `APPLY_FALLBACK` projection: find excerpt → split runs → inject tracked change, (5) build comments for all findings with summaries/notes, (6) ensure comments relationship, (7) serialize XML back, (8) rezip → return Buffer. Handle: no changes (return original), excerpt not found (skip with warning log), cross-paragraph excerpts (concatenate text across adjacent `<w:p>` elements when single-paragraph search fails — if the excerpt spans 2–3 paragraphs, match across the concatenated text and split the tracked change into per-paragraph `<w:del>`/`<w:ins>` pairs preserving each paragraph's formatting; if spanning 4+ paragraphs or match still fails, skip with warning log).
- [X] T030 [US4] Create export API endpoint `GET /api/contracts/[id]/export-modified` in `src/app/api/contracts/[id]/export-modified/route.ts` — authenticate, load contract + document + analysis + clauses + findings + decisions, compute projections, call `modifyOriginalDocx()`, return DOCX binary with Content-Disposition header per contracts/export-modified-api.md. Handle errors: 404 if no original file, 422 if not DOCX, 500 on XML parsing failure.
- [X] T031 [US4] Update export modal in `src/app/(app)/contracts/[id]/_components/redline-export-modal.tsx` — replace "Redline (.docx)" option with "Original with Changes (.docx)". Update API call from `/export-redline` to `/export-modified`. Update button text, download filename pattern to `{title}-reviewed.docx`.

**Checkpoint**: Triage a contract fully. Click Export → "Original with Changes". Open in Microsoft Word. Verify: original formatting preserved, tracked changes show with Accept/Reject, comments appear in margins with risk level + summary + notes. Author shows "Legal AI Analyzer".

---

## Phase 7: User Story 5 — View Triage Notes and Comments in Document (P2)

**Goal**: Notes, escalation reasons, and finding summaries appear as visible annotations in the document view alongside the relevant clause text.

**Independent Test**: Add a note to a clause. Verify it appears in the document view near the clause. Add multiple notes — verify correct positioning without overlap.

**Delivers**: FR-007

### Implementation

- [X] T032 [P] [US5] Create note overlay component in `src/app/(app)/contracts/[id]/_components/pdf-viewer/note-overlay.tsx` — renders margin annotation boxes positioned at the right edge of the page, aligned vertically with the clause/finding position. Shows: note icon + truncated text. Click to expand full note. Handles multiple notes by stacking vertically with small gaps.
- [X] T033 [US5] Extend overlay manager for notes in `src/app/(app)/contracts/[id]/_components/pdf-viewer/overlay-manager.tsx` — collect all notes from projections for findings on the current page. Pass to `<NoteOverlay>`. Include: reviewer-typed notes, AI finding summaries for unresolved findings, escalation reasons.

**Checkpoint**: Add notes to several clauses. Open document — notes visible as margin annotations at correct positions. No overlapping.

---

## Phase 8: User Story 6 — Export Annotated PDF (P3)

**Goal**: Export the contract as a PDF with risk highlights, strikethrough, replacement text, and notes baked into the file.

**Independent Test**: Triage a contract. Export as "Annotated PDF". Open — all visual annotations visible in any PDF reader.

**Delivers**: FR-011

### Implementation

- [X] T034 [P] [US6] Create `generateAnnotatedPdf()` in `src/lib/pdf-export.ts` — use `pdf-lib` to load the converted PDF. For each finding: draw colored rectangles (risk highlights), red strikethrough lines over original text, green text boxes with replacement text, and note annotations. Return modified PDF buffer.
- [X] T035 [US6] Add PDF format support to export endpoint in `src/app/api/contracts/[id]/export-modified/route.ts` — accept `?format=pdf` query param. When `format=pdf`: call `generateAnnotatedPdf()` with the converted PDF path + projections. Return PDF with Content-Type `application/pdf`.
- [X] T036 [US6] Wire PDF export option to export modal in `src/app/(app)/contracts/[id]/_components/redline-export-modal.tsx` — add "Annotated PDF (.pdf)" option alongside "Original with Changes (.docx)". Each option calls the same endpoint with different `?format=` param.

**Checkpoint**: Export as Annotated PDF. Open in any PDF reader. Risk highlights, strikethrough, replacement text, and notes all visible.

---

## Phase 9: Polish & Deprecation

**Purpose**: Clean up replaced code, remove Collabora dependencies, final optimizations

- [X] T037 [P] Mark all files in `src/app/(app)/contracts/[id]/_components/collabora-viewer/` as `@deprecated` with JSDoc comment: "Deprecated by Feature 012 (PDF viewer). Use pdf-viewer/ instead."
- [X] T038 [P] Mark `src/lib/document-exporter.ts` as `@deprecated` with comment: "Replaced by src/lib/docx-modifier.ts (Feature 012). Use /api/contracts/[id]/export-modified instead."
- [X] T039 [P] Deprecate `src/app/api/contracts/[id]/export-redline/route.ts` — add `@deprecated` comment, optionally redirect to `/export-modified`
- [X] T040 [P] Deprecate WOPI/Collabora API endpoints — add `@deprecated` to: `src/app/api/collabora/`, `src/app/api/wopi/`, `src/app/api/contracts/[id]/highlights-applied/route.ts`, `src/app/api/contracts/[id]/export-collabora/route.ts`
- [X] T041 Remove WOPI middleware path check in `src/middleware.ts` — remove the WOPI path exception from the authentication middleware
- [ ] T042 Remove `highlightsApplied` field from `ContractAnalysis` model in `prisma/schema.prisma` — run migration `npx prisma migrate dev --name remove-highlights-applied`
- [X] T043 Remove Collabora Docker container from `docker-compose.yml` (if present) — remove the `collabora` service definition

**Checkpoint**: Run `npm run build` — no compilation errors. Run `npm run lint` — passes. Open a contract — PDF viewer works. Old Collabora viewer code is marked deprecated but still compiles.

---

## Dependencies & Execution Order

### Phase Dependencies

```
Phase 1: Setup ──────────────────────────────┐
                                              ↓
Phase 2: Foundational (PDF Pipeline) ────────┤ BLOCKS all viewer stories
                                              ↓
Phase 3: US1 - View + Highlights (P1) ──────┤ 🎯 MVP
                                              ↓
Phase 4: US2 - Navigation (P1) ─────────────┤ depends on Phase 3 (viewer exists)
                                              ↓
Phase 5: US3 - Instant Fallback (P1) ───────┤ depends on Phase 3 (overlay manager)
                                              │
Phase 6: US4 - DOCX Export (P1) ────────────┤ ‖ PARALLEL with Phases 4-5 (server-only)
                                              │   depends on Phase 1 only (jszip, fast-xml-parser)
                                              ↓
Phase 7: US5 - Notes in Viewer (P2) ────────┤ depends on Phase 3 (overlay manager)
                                              │
Phase 8: US6 - PDF Export (P3) ─────────────┤ depends on Phase 2 (PDF file exists)
                                              ↓
Phase 9: Polish & Deprecation ──────────────┘ depends on all above validated
```

### User Story Dependencies

- **US1 (P1)**: Depends on Foundational (Phase 2). First viewer story — establishes PDF rendering + highlight overlays.
- **US2 (P1)**: Depends on US1 (viewer must exist to add navigation). Can start as soon as US1's viewer container (T014) is committed.
- **US3 (P1)**: Depends on US1 (overlay manager must exist). Can start as soon as US1's overlay manager (T013) is committed.
- **US4 (P1)**: **Independent of viewer stories**. Depends only on Phase 1 (packages installed). Can run in **parallel** with Phases 3-5.
- **US5 (P2)**: Depends on US1 (overlay manager). Independent of US2, US3, US4.
- **US6 (P3)**: Depends on Phase 2 (PDF file generated). Independent of viewer stories.
- **US7 (P2)**: Satisfied architecturally by Phase 2 + Phase 3. No dedicated tasks — verified by testing that the viewer works without Collabora running.

### Parallel Opportunities

**Phase 2 (Foundational)**:
```
T005 (convertDocxToPdf) ‖ T006 (extractTextPositions) ‖ T007 (mapExcerptToPositions)
→ All write to separate functions in different files
```

**Phase 3 + Phase 6 (US1 ‖ US4)**:
```
T011-T016 (PDF viewer components) ‖ T024-T030 (DOCX modifier + export API)
→ Viewer is client-side; export is server-side; completely independent
```

**Phase 4 + Phase 5 (US2 ‖ US3)**:
```
T017-T018 (navigation hooks) ‖ T021 (redline overlay)
→ Different files, no dependencies on each other
```

**Phase 9 (Deprecation)**:
```
T037 ‖ T038 ‖ T039 ‖ T040 → All independent file-level deprecation markers
```

---

## Parallel Example: US1 + US4 Simultaneously

```
Developer A (Frontend — US1):              Developer B (Backend — US4):
  T011 PDF page renderer                     T024 DOCX XML text finder
  T012 Risk highlight overlay                T025 XML run splitter
  T013 Overlay manager                       T026 Track Changes injector
  T014 PDF viewer container                  T027 Word comments builder
  T015 Barrel export                         T028 Comments relationship setup
  T016 Wire to page.tsx                      T029 Main export orchestrator
                                             T030 Export API endpoint
                                             T031 Update export modal
```

These two tracks have zero file conflicts and can merge independently.

---

## Implementation Strategy

### MVP First (US1 Only — Phases 1-3)

1. Complete Phase 1: Setup (T001-T004)
2. Complete Phase 2: Foundational PDF Pipeline (T005-T010)
3. Complete Phase 3: US1 — View with Highlights (T011-T016)
4. **STOP and VALIDATE**: Open a contract. PDF visible in <3s. Risk highlights present. Scroll works.
5. This alone replaces the 18-second Collabora preparation delay.

### Full P1 Delivery (Phases 1-6)

1. Setup + Foundational → PDF pipeline works
2. US1 (View) → PDF viewer with highlights → **Deploy/Demo**
3. US2 (Navigation) → Clause clicking works → **Deploy/Demo**
4. US3 (Instant Fallback) → Overlays update instantly → **Deploy/Demo**
5. US4 (Export) → Original DOCX with tracked changes → **Deploy/Demo**
6. Each increment adds value without breaking previous stories.

### Complete Feature (All Phases)

1. P1 stories (US1-US4) deliver the core experience
2. US5 (Notes) adds document-level context
3. US6 (PDF Export) adds convenience sharing
4. Phase 9 cleans up deprecated code

---

## Task Summary

| Phase | Story | Tasks | Key Files |
|-------|-------|-------|-----------|
| 1. Setup | — | T001-T004 (4) | `package.json`, `schema.prisma`, `pdf-viewer.ts`, LibreOffice setup |
| 2. Foundational | — | T005-T010 (6) | `pdf-pipeline.ts`, `pdf-position-mapper.ts`, `analyze/route.ts`, `pdf-document/route.ts` |
| 3. US1 View | P1 🎯 | T011-T016 (6) | `pdf-page-renderer.tsx`, `risk-highlight-overlay.tsx`, `overlay-manager.tsx`, `pdf-viewer.tsx`, `page.tsx` |
| 4. US2 Navigate | P1 | T017-T020 (4) | `use-pdf-navigation.ts`, `use-scroll-sync.ts`, `page.tsx`, `clause-list.tsx` |
| 5. US3 Fallback | P1 | T021-T023 (3) | `redline-overlay.tsx`, `overlay-manager.tsx`, `page.tsx` |
| 6. US4 Export | P1 | T024-T031 (8) | `docx-modifier.ts`, `export-modified/route.ts`, `redline-export-modal.tsx` |
| 7. US5 Notes | P2 | T032-T033 (2) | `note-overlay.tsx`, `overlay-manager.tsx` |
| 8. US6 PDF Export | P3 | T034-T036 (3) | `pdf-export.ts`, `export-modified/route.ts`, `redline-export-modal.tsx` |
| 9. Polish | — | T037-T043 (7) | Multiple deprecated files, `middleware.ts`, `schema.prisma` |
| **Total** | | **43 tasks** | |

---

## Notes

- [P] tasks = different files, no dependencies — safe to run in parallel
- [Story] label maps task to specific user story for traceability
- US7 (No External Service) is satisfied architecturally — no dedicated tasks, verified by testing without Collabora
- T007 fuzzy matching is the highest-complexity single function — budget extra time
- T024-T029 (DOCX modifier) is the highest-complexity module (~450 lines) — budget extra time
- `fast-xml-parser` options are critical: `preserveOrder: true`, `ignoreAttributes: false`, `trimValues: false` — incorrect options will corrupt the DOCX
- Author name "Legal AI Analyzer" is hardcoded in T026, T027 per spec clarification C3
- Comment content scope (risk + summary + notes, no escalation/playbook) per spec clarification C1
- Export replaces existing reconstructed DOCX per spec clarification C2 — T031 removes old option
