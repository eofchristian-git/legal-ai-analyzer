# Implementation Plan: PDF Document Viewer & Original-File Export

**Branch**: `012-pdf-viewer-docx-export` | **Date**: 2026-02-20 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `specs/012-pdf-viewer-docx-export/spec.md`

---

## Summary

Replace the Collabora-based document viewer with a PDF.js-based read-only viewer that uses pre-computed text positions for deterministic clause navigation and React overlay layers for risk highlights, redline annotations, and notes. Export the **original uploaded DOCX** with native Word Track Changes and Comments injected server-side via direct XML manipulation (`jszip` + `fast-xml-parser`). This replaces the existing reconstructed DOCX export (`document-exporter.ts`) as the sole Word export option.

Key spec clarifications integrated:
- **Comment content**: Exported Word comments include risk level indicator, AI finding summary, and reviewer-typed notes (no escalation reasons or playbook rules).
- **Export replacement**: The new "Original with Changes" export replaces the existing reconstructed DOCX; no coexistence.
- **Author attribution**: All tracked changes and comments attributed to a fixed system name "Legal AI Analyzer".

> **⚠️ Task & Phase ID Notice**: The task IDs (T001–T042) and phase numbers (0–6) in this plan were reorganized during task generation. **`tasks.md` is the canonical reference** for task IDs, phase numbers, and execution order. Cross-referencing by ID between this plan and tasks.md will not match — tasks.md renumbered phases to 1–9 (43 tasks, T001–T043) and reordered tasks by user story. When in doubt, use tasks.md IDs.

---

## Technical Context

**Language/Version**: TypeScript 5.x, Node.js 20+, Next.js 16 (App Router)
**Primary Dependencies**: `pdfjs-dist` (^5.4.624, already installed), `react-window` (^2.2.7, already installed), `pdf-lib` (new), `jszip` (new), `fast-xml-parser` (new), LibreOffice headless (system/Docker — conversion only)
**Storage**: Prisma ORM with SQLite — schema changes required (new fields on `ContractDocument`)
**Testing**: No test framework; manual verification
**Target Platform**: Web (Next.js server + browser)
**Project Type**: Web application (single repo, Next.js App Router)
**Performance Goals**: Document visible in <3s; navigation <300ms; fallback visual update <500ms; virtualized rendering for 200+ page documents
**Constraints**: LibreOffice headless required at analysis time only (not at view time); DOCX XML manipulation must preserve all original formatting; export author fixed to "Legal AI Analyzer"
**Scale/Scope**: Single-user contract review sessions; typical contracts 5-100 pages; up to 30-50 clauses per contract

---

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| **I. Data Integrity** | ✅ Pass | All triage decisions remain in append-only `ClauseDecision` events (existing). PDF position mappings stored in DB. No new mutation paths — viewer is read-only. Export reads from DB + original file. |
| **II. Simplicity** | ✅ Pass | Three new npm packages justified: `jszip` (DOCX unzip/rezip), `fast-xml-parser` (DOCX XML manipulation), `pdf-lib` (PDF annotation baking). All are zero-dependency or minimal. LibreOffice headless runs once at analysis time, not at runtime. |
| **III. AI-Assisted, Human-Controlled** | ✅ Pass | Feature does not touch AI prompts or analysis logic. Viewer displays AI-generated findings; export includes AI summaries in Word comments per spec clarification. User controls all triage decisions. |
| **Type safety (`any` usage)** | ✅ Pass | New types defined in `src/types/pdf-viewer.ts`. DOCX XML parsing will use typed interfaces for OOXML structures. |
| **shadcn/ui primitives** | ✅ Pass | PDF viewer container, overlays, and error states use existing shadcn components. No custom UI framework. |
| **Path alias `@/*`** | ✅ Pass | All new imports follow `@/` convention. |
| **Append-Only Event Sourcing** | ✅ Pass | Existing `ClauseDecision` events → `computeProjection()` pattern preserved. Viewer overlays derived from projections. Export content derived from projections. |

**Gate**: PASSED — proceed to Phase 0.

---

## Project Structure

### Documentation (this feature)

```text
specs/012-pdf-viewer-docx-export/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
└── tasks.md             # Phase 2 output (/speckit.tasks)
```

### Source Code (files touched by this feature)

```text
src/
├── types/
│   └── pdf-viewer.ts                              # NEW — TextPosition, ClausePdfMapping, FindingPdfMapping, etc.
│
├── lib/
│   ├── pdf-pipeline.ts                            # NEW — DOCX→PDF conversion + text position extraction
│   ├── pdf-position-mapper.ts                     # NEW — fuzzy-match excerpts to PDF coordinates
│   ├── docx-modifier.ts                           # NEW — server-side DOCX XML manipulation for export
│   ├── pdf-export.ts                              # NEW — annotated PDF generation via pdf-lib
│   ├── document-exporter.ts                       # DEPRECATE — reconstructed DOCX export (replaced)
│   └── collabora/                                 # DEPRECATE — Collabora-specific utilities
│       ├── navigation.ts
│       ├── anchor.ts
│       ├── config.ts
│       ├── discovery.ts
│       └── wopi-token.ts
│
└── app/
    ├── api/
    │   └── contracts/[id]/
    │       ├── analyze/route.ts                   # MODIFY — trigger PDF pipeline after analysis
    │       ├── pdf-document/route.ts              # NEW — serve PDF + position mappings
    │       ├── export-modified/route.ts           # NEW — export original DOCX with tracked changes
    │       ├── export-redline/route.ts            # DEPRECATE — reconstructed export (replaced)
    │       └── export-collabora/route.ts          # DEPRECATE — Collabora live file export
    │
    └── (app)/contracts/[id]/
        ├── page.tsx                               # MODIFY — add 'pdf' view mode, wire PDF viewer
        └── _components/
            ├── pdf-viewer/                        # NEW — PDF viewer components
            │   ├── pdf-viewer.tsx                  # Container with virtualized scrolling
            │   ├── pdf-page-renderer.tsx           # Single page canvas renderer
            │   ├── risk-highlight-overlay.tsx      # Colored rects over findings
            │   ├── redline-overlay.tsx             # Strikethrough + replacement annotations
            │   ├── note-overlay.tsx                # Margin notes/comments
            │   ├── overlay-manager.tsx             # Combines all overlays per page
            │   ├── use-pdf-navigation.ts           # scrollToClause(clauseId) hook
            │   ├── use-scroll-sync.ts              # Intersection Observer → selectedClauseId
            │   └── index.ts                        # Barrel export
            ├── collabora-viewer/                  # DEPRECATE (7 files, ~2,200 lines)
            ├── redline-export-modal.tsx            # MODIFY — update export options
            └── clause-list.tsx                     # MINOR — unmapped clause indicator
```

**Structure Decision**: Single Next.js App Router project. New PDF viewer components live alongside existing viewers in `_components/pdf-viewer/`. New server-side libraries in `src/lib/`. New API routes in existing `api/contracts/[id]/` directory. Deprecated code marked but not immediately deleted (Phase 6).

---

## Implementation Phases

### Phase 0: Dependencies & Infrastructure

**Purpose**: Install new packages, add DB fields, verify LibreOffice headless

| Task | Description | Files |
|------|-------------|-------|
| T001 | Install npm packages: `pdf-lib`, `jszip`, `fast-xml-parser` | `package.json` |
| T002 | Verify `pdfjs-dist` (^5.4.624) and `react-window` (^2.2.7) already installed | `package.json` |
| T003 | Set up LibreOffice headless — add to Docker Compose or document local install | `docker-compose.yml` or README |
| T004 | Add DB fields to `ContractDocument`: `pdfPath` (String?), `pdfPageCount` (Int?), `textPositions` (String? — JSON), `clausePositionMappings` (String? — JSON), `findingPositionMappings` (String? — JSON), `pdfConversionStatus` (String, default "pending"). Run Prisma migration. | `prisma/schema.prisma` |

### Phase 1: Server-Side PDF Generation Pipeline

**Purpose**: Convert DOCX → PDF at analysis time and extract text positions for deterministic navigation (FR-012, FR-014)

| Task | Description | Files |
|------|-------------|-------|
| T005 | Create `convertDocxToPdf()` — calls LibreOffice headless CLI to convert DOCX to PDF | `src/lib/pdf-pipeline.ts` |
| T006 | Create `extractTextPositions()` — uses `pdfjs-dist` `getTextContent()` to extract text spans with `(text, pageIndex, x, y, width, height)` | `src/lib/pdf-pipeline.ts` |
| T007 | Create `mapExcerptToPositions()` — fuzzy-matches clause/finding excerpts to PDF text coordinates using normalized text comparison + Levenshtein fallback | `src/lib/pdf-position-mapper.ts` |
| T008 | Trigger pipeline after analysis — after AI analysis completes, run: DOCX → PDF → extract positions → map clauses → save to DB | `src/app/api/contracts/[id]/analyze/route.ts` |
| T009 | Create PDF/positions API endpoint — GET returns PDF binary + position mappings + clause/finding mappings from DB | `src/app/api/contracts/[id]/pdf-document/route.ts` |

### Phase 2: PDF Viewer Component

**Purpose**: Replace Collabora iframe with pdf.js canvas + annotation overlays (FR-001, FR-002, FR-003, FR-004, FR-005, FR-006, FR-007, FR-013, FR-015)

| Task | Description | Files |
|------|-------------|-------|
| T010 | Create types — `TextPosition`, `ClausePdfMapping`, `FindingPdfMapping`, `PageOverlayData` | `src/types/pdf-viewer.ts` |
| T011 | Create PDF page renderer — renders one PDF page using pdf.js `renderTask` onto a `<canvas>` | `_components/pdf-viewer/pdf-page-renderer.tsx` |
| T012 | Create PDF viewer container — virtualized scrolling via `react-window`, loads pages on demand, exposes scroll API | `_components/pdf-viewer/pdf-viewer.tsx` |
| T013 | Create risk highlight overlay — renders colored transparent rects (red/yellow/green) over finding positions | `_components/pdf-viewer/risk-highlight-overlay.tsx` |
| T014 | Create redline overlay — for resolved findings: red strikethrough line over original text + green annotation box with replacement text | `_components/pdf-viewer/redline-overlay.tsx` |
| T015 | Create note overlay — margin annotations for triage notes, AI summaries, escalation reasons | `_components/pdf-viewer/note-overlay.tsx` |
| T016 | Create overlay manager — combines risk highlights + redline + notes per page. Reads projections via `computeProjection()`, computes what to show | `_components/pdf-viewer/overlay-manager.tsx` |
| T017 | Create clause navigation hook — `scrollToClause(clauseId)` looks up `ClausePdfMapping` → calls `scrollTo(pageIndex, y)`. Deterministic. | `_components/pdf-viewer/use-pdf-navigation.ts` |
| T018 | Create scroll-sync hook — Intersection Observer on clause start rects → updates `selectedClauseId` in parent (FR-004) | `_components/pdf-viewer/use-scroll-sync.ts` |
| T019 | Add unmapped clause indicator — clauses with no position mapping show a warning icon in the list; clicking shows toast instead of scrolling | `_components/clause-list.tsx` |

### Phase 3: Server-Side DOCX Modification for Export

**Purpose**: Modify the **original DOCX file** with native Word Track Changes and Comments (FR-008, FR-009, FR-010)

| Task | Description | Files |
|------|-------------|-------|
| T020 | Create DOCX XML text finder — `findTextInDocXml()` parses `word/document.xml`, concatenates `<w:t>` runs per paragraph, finds excerpt by string match, returns XML node path + character offsets | `src/lib/docx-modifier.ts` |
| T021 | Create XML run splitter — `splitRunAtOffset()` splits a `<w:r>` element at a character boundary, preserving `<w:rPr>` formatting on both halves | `src/lib/docx-modifier.ts` |
| T022 | Create Track Changes injector — `injectTrackedChange()` wraps matched runs in `<w:del>` + inserts `<w:ins>` with replacement text. Author = "Legal AI Analyzer". Preserves original `<w:rPr>`. | `src/lib/docx-modifier.ts` |
| T023 | Create Word comments builder — `buildCommentsXml()` generates `word/comments.xml` with `<w:comment>` entries containing: risk level indicator + AI finding summary + reviewer notes. Author = "Legal AI Analyzer". | `src/lib/docx-modifier.ts` |
| T024 | Create comments relationship setup — `ensureCommentsRelationship()` adds `comments.xml` to `[Content_Types].xml` and `word/_rels/document.xml.rels` if not already present | `src/lib/docx-modifier.ts` |
| T025 | Create main export function — `modifyOriginalDocx()` orchestrates: unzip → parse → find excerpts → inject tracked changes → add comments → repack | `src/lib/docx-modifier.ts` |
| T026 | Create export API endpoint — GET reads original DOCX from `Document.filePath`, calls `modifyOriginalDocx()` with projections, returns modified DOCX | `src/app/api/contracts/[id]/export-modified/route.ts` |

### Phase 4: Integration with Contract Page

**Purpose**: Wire PDF viewer into the existing contract detail page and replace Collabora (FR-001 through FR-016)

| Task | Description | Files |
|------|-------------|-------|
| T027 | Add `'pdf'` to `documentViewMode` in page.tsx. Render `<PdfViewer>` when PDF conversion is available. | `page.tsx` |
| T028 | Wire clause navigation — pass `selectedClauseId` to `<PdfViewer>`, wire `onClauseClick` from clause list | `page.tsx` |
| T029 | Wire projection data to overlays — pass `clauseProjections` and finding projections to `<OverlayManager>` | `page.tsx`, `overlay-manager.tsx` |
| T030 | Update export modal — replace "Redline (.docx)" with "Original with Changes (.docx)". Call new `/api/contracts/[id]/export-modified`. | `redline-export-modal.tsx` |
| T031 | Wire fallback/undo to overlay refresh — when `onFallbackApplied` or `onFallbackUndone` fires, `historyRefreshKey` increments → projection re-fetches → overlay re-renders instantly | `page.tsx` |
| T032 | Remove Collabora-specific state — `pendingRedline`, `pendingUndoRedline`, `collaboraReloadTrigger`, `CollaboraPendingQueueProvider` no longer needed | `page.tsx` |

### Phase 5: Annotated PDF Export (Bonus)

**Purpose**: Export annotated PDF with visual overlays baked in (FR-011)

| Task | Description | Files |
|------|-------------|-------|
| T033 | Create `generateAnnotatedPdf()` — uses `pdf-lib` to read the converted PDF and draw strikethrough lines, colored rectangles, replacement text, and note annotations | `src/lib/pdf-export.ts` |
| T034 | Add PDF format to export endpoint — accept `?format=pdf` query param on `/export-modified` | `export-modified/route.ts` |
| T035 | Wire to export modal — add "Annotated PDF" option | `redline-export-modal.tsx` |

### Phase 6: Deprecation & Cleanup

**Purpose**: Remove Collabora-dependent code and replaced export paths

| Task | Description | Files |
|------|-------------|-------|
| T036 | Mark `collabora-viewer/` (7 files) as `@deprecated` with migration notice | `collabora-viewer/*.ts` |
| T037 | Mark `document-exporter.ts` as `@deprecated` — replaced by `docx-modifier.ts` | `src/lib/document-exporter.ts` |
| T038 | Deprecate export-redline API — replaced by export-modified | `export-redline/route.ts` |
| T039 | Deprecate WOPI/Collabora endpoints: `/api/collabora/session`, `/api/wopi/*`, `/api/contracts/[id]/highlights-applied`, `/api/contracts/[id]/export-collabora` | Multiple API routes |
| T040 | Remove WOPI middleware path check | `src/middleware.ts` |
| T041 | Remove `highlightsApplied` field from `ContractAnalysis` | `prisma/schema.prisma` |
| T042 | Optionally remove Collabora Docker container from `docker-compose.yml` | `docker-compose.yml` |

---

## Execution Order & Dependencies

```
Phase 0: Dependencies (T001-T004)
    ↓
Phase 1: PDF Pipeline (T005-T009) — server-side, no UI
    ↓ (T010-T012 can start in parallel with T005-T007)
Phase 2: PDF Viewer (T010-T019) — client-side components
    ↓
Phase 3: DOCX Export (T020-T026) — can run in parallel with Phase 2
    ↓
Phase 4: Integration (T027-T032) — depends on Phase 1 + 2 + 3
    ↓
Phase 5: PDF Export (T033-T035) — anytime after Phase 1
    ↓
Phase 6: Cleanup (T036-T042) — only after Phase 4 is validated
```

### Parallel Opportunities

- **T005-T007** (server pipeline) ‖ **T010-T012** (viewer skeleton)
- **T020-T025** (DOCX modifier) ‖ **T010-T019** (viewer components)
- **T033-T035** (PDF export) can run anytime after T005

---

## Key Design Decisions

### D1: Read-Only Viewer with Overlay Annotations

The PDF viewer is **read-only**. All visual changes (highlights, strikethrough, fallback text) are React overlay layers positioned absolutely over the PDF canvas. Changes are not written into the PDF file. The source of truth is always the database (`ClauseDecision` events → `computeProjection()`).

**Rationale**: Eliminates the fragile UNO command chains. Applying a fallback = save to DB → re-render overlay. No 3.5-second delays, no success/failure ambiguity.

**Trade-off**: Fallback text appears as annotation boxes rather than inline replacements. Accepted because the viewer is for review/triage, not final editing. The exported DOCX has proper inline tracked changes.

### D2: Pre-Computed Position Mappings

Text positions are extracted from the PDF at **analysis time** (not view time) and stored in the database as JSON on `ContractDocument`. Navigation = simple lookup + `scrollTo()`.

**Rationale**: Eliminates text-search-at-runtime fragility. Position mappings are computed once with full fuzzy matching and cached permanently.

### D3: Server-Side DOCX XML Manipulation for Export

The export pipeline unzips the original DOCX, parses `word/document.xml` with `fast-xml-parser`, injects `<w:del>/<w:ins>` elements for tracked changes and creates/updates `word/comments.xml` for Word comments, then re-zips.

**Rationale**: Preserves 100% of original formatting. No reconstruction. Opens in Microsoft Word with native Accept/Reject functionality. Author fixed to "Legal AI Analyzer" per spec clarification.

### D4: Replace (Not Coexist) Existing Export

The new export replaces the reconstructed DOCX export (`document-exporter.ts` + `/export-redline`). Only one Word export option exists: "Original with Changes (.docx)".

**Rationale**: Spec clarification Q2. The new export is strictly superior — preserves original formatting AND includes tracked changes. Keeping both would add UI clutter and maintenance burden.

### D5: Word Comment Content Scope

Each exported Word comment contains:
1. Risk level indicator (e.g., "⚠ RED")
2. AI-generated finding summary
3. Reviewer-typed notes (if any)

Excluded: escalation reasons, playbook rule references (internal workflow artifacts).

**Rationale**: Spec clarification Q1. Provides full context to recipients without leaking internal process details.

---

## Code Impact Summary

### New (~2,100 lines estimated)

| File | Est. Lines | Complexity |
|------|-----------|------------|
| `src/types/pdf-viewer.ts` | ~60 | Low |
| `src/lib/pdf-pipeline.ts` | ~200 | Medium |
| `src/lib/pdf-position-mapper.ts` | ~200 | Medium |
| `src/lib/docx-modifier.ts` | ~450 | **High** |
| `src/lib/pdf-export.ts` | ~150 | Medium |
| `pdf-viewer/pdf-viewer.tsx` | ~200 | Medium |
| `pdf-viewer/pdf-page-renderer.tsx` | ~100 | Low |
| `pdf-viewer/risk-highlight-overlay.tsx` | ~80 | Low |
| `pdf-viewer/redline-overlay.tsx` | ~120 | Medium |
| `pdf-viewer/note-overlay.tsx` | ~80 | Low |
| `pdf-viewer/overlay-manager.tsx` | ~100 | Low |
| `pdf-viewer/use-pdf-navigation.ts` | ~60 | Low |
| `pdf-viewer/use-scroll-sync.ts` | ~60 | Low |
| API routes (2 new) | ~200 | Low |

### Deprecated (~2,800+ lines)

| File | Lines | Replacement |
|------|-------|-------------|
| `collabora-viewer/` (7 files) | ~2,200 | `pdf-viewer/` |
| `src/lib/document-exporter.ts` | ~640 | `src/lib/docx-modifier.ts` |
| `src/lib/collabora/` (5 files) | ~680+ | Removed (no replacement needed) |
| `export-redline/route.ts` | ~137 | `export-modified/route.ts` |
| `export-collabora/route.ts` | ~50 | Removed |

### Modified

| File | Change |
|------|--------|
| `prisma/schema.prisma` | Add PDF fields to `ContractDocument` |
| `analyze/route.ts` | Trigger PDF pipeline after analysis |
| `page.tsx` | Add `'pdf'` view mode, remove Collabora state |
| `clause-list.tsx` | Add unmapped clause indicator |
| `redline-export-modal.tsx` | Update export options |
| `middleware.ts` | Remove WOPI path check |

---

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| LibreOffice headless not available on host | Pipeline blocked | Docker container with LibreOffice pre-installed; document error message for setup instructions |
| Text position mapping misses some excerpts | Some highlights/navigation missing | Fuzzy matching with Levenshtein; log misses; export uses separate DOCX XML pipeline (not dependent on PDF positions) |
| DOCX XML run splitting across complex formatting | Export partially fails for some tracked changes | Start with single-paragraph excerpts; handle cross-paragraph later; test with diverse real contracts |
| `word/comments.xml` setup tricky for DOCX files that don't already have comments | Notes not exported | Well-documented OOXML spec; check for existing comments.xml before creating; add Content_Types entry |
| Performance for large PDFs (200+ pages) | Slow page load / memory | Virtualized rendering; lazy page loading; text positions cached in DB |
| `fast-xml-parser` may reformat XML whitespace | Corrupted DOCX | Use `preserveOrder: true`, `ignoreAttributes: false`, `trimValues: false` options |

---

## MVP vs Full Scope

| Scope | Phases | Delivers |
|-------|--------|----------|
| **MVP** | 0 + 1 + 2 + 4 | PDF viewer with risk highlights + deterministic navigation + instant fallback overlays. Export unchanged (uses existing path temporarily). |
| **Full** | + Phase 3 | Original DOCX export with inline tracked changes + Word comments. Replaces existing export. |
| **Polish** | + Phase 5 + 6 | Annotated PDF export + Collabora code cleanup |

---

## Complexity Tracking

| New Dependency | Why Needed | Simpler Alternative Rejected Because |
|----------------|------------|--------------------------------------|
| `jszip` | Unzip/rezip DOCX files for XML manipulation | No simpler alternative — DOCX is a ZIP archive by spec |
| `fast-xml-parser` | Parse and serialize DOCX XML with full fidelity | Regex-based XML manipulation would be fragile and error-prone |
| `pdf-lib` | Bake annotations into PDF for export | Only needed for Phase 5 (bonus); could defer or skip |
| LibreOffice headless | High-fidelity DOCX → PDF conversion | `mammoth.js` loses too much formatting; `pdfjs-dist` can't convert DOCX |
