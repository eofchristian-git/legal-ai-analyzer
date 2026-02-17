# Implementation Plan: Interactive Document Viewer & Redline Export

**Branch**: `008-document-viewer-redline` | **Date**: 2026-02-17 | **Spec**: [spec.md](./spec.md)  
**Input**: Feature specification from `/specs/008-document-viewer-redline/spec.md`

**Note**: This template is filled in by the `/speckit.plan` command. See `.specify/templates/commands/plan.md` for the execution workflow.

## Summary

Implement an interactive document viewer that displays full contract documents (Word/PDF converted to HTML) with color-coded finding highlights, bi-directional navigation between clause list and document positions, tracked changes overlay for decision modifications, and redline export to Word/PDF formats. This feature transforms the current clause-by-clause review experience into a cohesive full-document workflow with visual markup and negotiation-ready exports.

**Key Technical Approach**:
- Convert all contract formats (Word .docx and PDF) to HTML during analysis phase for unified rendering
- Store position mappings (page, x, y, width, height) in new ContractDocument entity
- Render HTML with virtualized scrolling for performance with 200+ page documents
- Inject highlight overlays and tracked changes using DOM manipulation
- Export to Word with Track Changes format or PDF with visual markup
- Retain document data indefinitely for finalized contracts, 90 days for draft/cancelled

## Technical Context

**Language/Version**: TypeScript with Next.js 16.1.6 (App Router)  
**Primary Dependencies**: 
- Next.js, React 19, TypeScript
- Prisma ORM (SQLite)
- shadcn/ui components
- Document conversion: `mammoth` (Word to HTML) and `pdf2htmlEX` or `pdf.js` (PDF processing)
- Document export: `docx` library (Word generation with Track Changes), `puppeteer` or `html-pdf-node` (PDF generation)
- Text diff: `diff-match-patch` (already in use for tracked changes)

**Storage**: SQLite via Prisma ORM
- New `ContractDocument` table for HTML content and position mappings
- Leverage existing `Contract`, `ContractAnalysis`, `AnalysisClause`, `AnalysisFinding` tables
- Leverage existing `ClauseDecision` append-only event log from Feature 006

**Testing**: Manual testing (no test framework currently configured per constitution)

**Target Platform**: Web application (desktop and tablet browsers)

**Performance Goals**:
- First page load: < 3 seconds for documents up to 200 pages
- Scroll sync debounce: 200-300ms after scrolling stops
- Finding navigation: < 500ms response time
- Export generation: < 30 seconds for 200-page documents
- Position accuracy: within 1 paragraph for HTML rendering

**Constraints**:
- Must preserve original document formatting (tables, images, headers/footers) during conversion
- HTML conversion must be reliable; failures block analysis completion
- Virtualized scrolling required for documents > 50 pages
- Export must work with Microsoft Word Track Changes format
- Must integrate with existing decision projection system (Feature 006/007)

**Scale/Scope**:
- Support contracts up to 200 pages
- Handle 50+ clauses with 100+ findings
- Concurrent viewing by multiple users
- Indefinite storage for finalized contracts

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

### ✅ Data Integrity
- **Compliance**: New `ContractDocument` entity includes `createdAt` and `updatedAt` timestamps
- **Audit Trail**: Leverages existing append-only `ClauseDecision` event log for all user actions
- **Soft Delete**: Implements retention policy (delete HTML/position data after 90 days for draft/cancelled, never for finalized)
- **Migration**: New Prisma migration required for `ContractDocument` table

### ✅ Simplicity
- **Justified Complexity**: HTML conversion adds complexity but justified by:
  - Unified rendering approach (single code path for Word and PDF)
  - Easier highlight and tracked changes injection vs. PDF annotation
  - Better text selection and accessibility
- **No Premature Optimization**: Virtualized scrolling only introduced due to explicit 200-page requirement
- **Minimal Dependencies**: Document conversion libraries (`mammoth`, `pdf2htmlEX`) and export libraries (`docx`, `puppeteer`) are standard, well-maintained tools
- **YAGNI**: No speculative features; all requirements traced to user stories

### ✅ AI-Assisted, Human-Controlled
- **No AI Decision Making**: Feature extends existing human decision workflow (Features 006/007)
- **Position Metadata**: Leverages existing AI-generated `locationPage` and `locationPosition` from Feature 005
- **No New AI Prompts**: No additional Claude interactions required for this feature
- **Graceful Handling**: HTML conversion failures result in clear error messages; user must re-upload

### ✅ Technology Constraints
- **Runtime**: Next.js App Router with TypeScript (compliant)
- **Database**: Prisma ORM with SQLite (compliant)
- **UI**: shadcn/ui components (compliant)
- **AI Provider**: No new Claude interactions (N/A for this feature)
- **Text Processing**: Reuses existing `diff-match-patch` for tracked changes (compliant per constitution 1.1.1)
- **Path Alias**: `@/*` → `./src/*` (compliant)

### ✅ Data Design Patterns
- **Position Fields**: `ContractDocument` includes position mappings as JSON
- **Optional Fields**: `htmlContent` nullable for cases where conversion fails initially
- **Status Lifecycle**: N/A - no new status fields introduced
- **Event Sourcing**: Leverages existing `ClauseDecision` event log and `computeProjection()` from Feature 006

### Gate Decision: ✅ **PASS** - All principles satisfied, complexities justified

## Project Structure

### Documentation (this feature)

```text
specs/008-document-viewer-redline/
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output - Document conversion library evaluation
├── data-model.md        # Phase 1 output - ContractDocument entity and relationships
├── quickstart.md        # Phase 1 output - Setup and integration guide
├── contracts/           # Phase 1 output - API endpoint specifications
│   ├── api-document-viewer.md
│   ├── api-document-export.md
│   └── document-conversion.md
├── spec.md              # Feature specification (input)
└── checklists/
    └── requirements.md  # Specification quality checklist
```

### Source Code (repository root)

```text
src/
├── app/
│   ├── (app)/
│   │   └── contracts/
│   │       └── [id]/
│   │           └── _components/
│   │               ├── document-viewer/         # NEW: Document viewer components
│   │               │   ├── document-viewer.tsx  # Main container with virtualized scrolling
│   │               │   ├── html-renderer.tsx    # HTML document rendering
│   │               │   ├── highlight-layer.tsx  # Finding highlights overlay
│   │               │   ├── tracked-changes-layer.tsx  # Changes overlay
│   │               │   ├── navigation-controls.tsx    # Next/prev finding buttons
│   │               │   └── position-utils.ts    # Position calculation utilities
│   │               ├── redline-export-modal.tsx # NEW: Export modal
│   │               ├── clause-list.tsx          # MODIFIED: Enhanced with scroll sync
│   │               ├── findings-panel.tsx       # EXISTING: No changes
│   │               └── page.tsx                 # MODIFIED: Integrate document viewer
│   └── api/
│       ├── contracts/
│       │   └── [id]/
│       │       ├── analyze/
│       │       │   └── route.ts                 # MODIFIED: Trigger document conversion
│       │       ├── document/
│       │       │   └── route.ts                 # NEW: Fetch document HTML and positions
│       │       └── export-redline/
│       │           └── route.ts                 # NEW: Generate redline exports
│       └── documents/
│           └── convert/
│               └── route.ts                     # NEW: Document conversion endpoint
├── lib/
│   ├── document-converter.ts                    # NEW: Word/PDF to HTML conversion
│   ├── document-exporter.ts                     # NEW: Word/PDF export with tracked changes
│   ├── position-mapper.ts                       # NEW: Calculate and store position mappings
│   └── projection.ts                            # EXISTING: Reused for tracked changes data
├── components/
│   └── ui/                                      # EXISTING: shadcn/ui primitives
└── types/
    └── document-viewer.ts                       # NEW: TypeScript interfaces

prisma/
└── schema.prisma                                # MODIFIED: Add ContractDocument model

public/                                          # EXISTING: Static assets
```

**Structure Decision**: Web application structure (Next.js App Router). Document viewer components are colocated with contract detail page components under `src/app/(app)/contracts/[id]/_components/document-viewer/`. Document conversion and export logic are isolated in `src/lib/` for testability and reuse. API routes follow existing REST patterns under `/api/contracts/[id]/`.

## Complexity Tracking

> **No violations** - All complexities justified in Constitution Check section above

## Phase 0: Research & Technology Selection

**Objective**: Resolve technology choices for document conversion and export, establish patterns for position mapping and virtualized rendering.

### Research Tasks

#### R1: Document Conversion Libraries (Word → HTML)

**Goal**: Evaluate libraries for converting Word .docx to HTML while preserving formatting

**Options**:
- `mammoth.js` - JavaScript library, focus on clean HTML
- `docx2html` - Node library with styling preservation
- Native LibreOffice/Pandoc - Command-line tools

**Evaluation Criteria**:
- Formatting preservation (tables, images, headers/footers)
- Text positioning reliability
- Performance (conversion time for 200-page documents)
- Maintenance and community support

**Decision**: Document in `research.md`

#### R2: Document Conversion Libraries (PDF → HTML)

**Goal**: Evaluate libraries for converting PDF to HTML while preserving layout

**Options**:
- `pdf2htmlEX` - CLI tool, excellent layout preservation
- `pdf.js` - Mozilla library, canvas/text layer rendering
- `pdftohtml` (Poppler) - CLI tool, open source

**Evaluation Criteria**:
- Layout accuracy
- Text extraction quality
- Position metadata availability
- Integration complexity

**Decision**: Document in `research.md`

#### R3: Word Export with Track Changes

**Goal**: Evaluate libraries for generating Word documents with Track Changes

**Options**:
- `docx` npm package - Programmatic Word generation
- `officegen` - Office document generator
- Template-based approach with `docxtemplater`

**Evaluation Criteria**:
- Track Changes format support
- User attribution capability
- Compatibility with Microsoft Word
- API ergonomics

**Decision**: Document in `research.md`

#### R4: PDF Export with Redline Markup

**Goal**: Evaluate approaches for PDF generation with visual change markup

**Options**:
- `puppeteer` - HTML to PDF via headless Chrome
- `html-pdf-node` - Lighter weight HTML to PDF
- `pdf-lib` - Low-level PDF manipulation
- `jsPDF` - Client-side PDF generation

**Evaluation Criteria**:
- Visual markup quality (strikethrough, underline)
- Metadata embedding
- Performance
- Server-side compatibility

**Decision**: Document in `research.md`

#### R5: Virtualized Scrolling Implementation

**Goal**: Determine approach for rendering large HTML documents efficiently

**Options**:
- `react-window` - Virtualized list/grid component
- `react-virtuoso` - Virtualized scrolling with dynamic heights
- Custom implementation using Intersection Observer
- CSS `content-visibility: auto` with manual windowing

**Evaluation Criteria**:
- Support for variable-height content
- Smooth scrolling experience
- Integration with position mapping
- Bundle size

**Decision**: Document in `research.md`

#### R6: Position Mapping Strategy

**Goal**: Define algorithm for mapping clause/finding positions to HTML DOM coordinates

**Approach**:
- Leverage existing `locationPage` and `locationPosition` from Feature 005
- During HTML conversion, inject data attributes at clause boundaries
- Store bounding rectangles (x, y, width, height) in `ContractDocument`
- Use text matching as fallback when exact positions unavailable

**Decision**: Document strategy in `research.md`

### Dependencies to Research

- **Document Conversion**: Best practices for maintaining position fidelity during format conversion
- **Change Tracking**: Word Track Changes XML format specification
- **Performance**: Virtualized rendering patterns for large documents
- **Export**: PDF annotation standards for redline markup

## Phase 1: Design Artifacts

**Objective**: Define data model, API contracts, and integration patterns.

### Deliverables

#### 1. data-model.md

**New Entities**:
- `ContractDocument` - Stores HTML content and position mappings
- Relationships to existing `Contract`, `AnalysisClause`, `AnalysisFinding`

**Schema Changes**:
- Add `ContractDocument` model to Prisma schema
- Migration script for new table
- Retention policy implementation (90-day cleanup for draft/cancelled)

**State Management**:
- No new state transitions (uses existing Contract status)
- Position data computed during analysis phase
- Cache strategy for HTML content

#### 2. contracts/ (API Specifications)

**api-document-viewer.md**:
- `GET /api/contracts/[id]/document` - Fetch HTML content and position mappings
- `POST /api/documents/convert` - Convert uploaded document to HTML (internal use during analysis)

**api-document-export.md**:
- `POST /api/contracts/[id]/export-redline` - Generate Word or PDF with tracked changes
- Request payload: `{ format: "docx" | "pdf" }`
- Response: File download with appropriate MIME type

**document-conversion.md**:
- Conversion workflow during analysis phase
- Position mapping algorithm
- Error handling and retry logic
- Fallback strategies

#### 3. quickstart.md

**Setup Instructions**:
- Install document conversion dependencies (`mammoth`, `pdf2htmlEX`, etc.)
- Configure export libraries (`docx`, `puppeteer`)
- Run Prisma migration for `ContractDocument`
- Environment variables for conversion settings

**Integration Points**:
- Hook into analysis workflow to trigger conversion
- Integrate document viewer into contract detail page
- Connect export modal to decision projection system

**Testing Guide**:
- Upload test contracts (Word and PDF)
- Verify HTML conversion quality
- Test highlight positioning accuracy
- Validate export formatting

## Phase 2: Implementation Phases

**Note**: Task breakdown and implementation sequencing will be handled by `/speckit.tasks` command.

### Expected Implementation Phases (High-Level)

1. **Phase 1: Document Conversion Infrastructure**
   - Implement Word → HTML conversion
   - Implement PDF → HTML conversion
   - Create `ContractDocument` entity and migrations
   - Integrate with analysis workflow

2. **Phase 2: Position Mapping & Storage**
   - Implement position calculation algorithm
   - Store clause/finding positions in database
   - Create position retrieval API

3. **Phase 3: Document Viewer MVP**
   - Render HTML document with virtualized scrolling
   - Display finding highlights with color coding
   - Implement click-to-navigate from highlights to findings panel

4. **Phase 4: Navigation & Synchronization**
   - Clause list → document scroll (click to jump)
   - Document scroll → clause list update (bi-directional sync with debouncing)
   - Finding navigation buttons (next/previous)

5. **Phase 5: Tracked Changes Display**
   - Fetch decision projections for all clauses
   - Inject tracked changes overlays (strikethrough/underline)
   - Toggle tracked changes view
   - Display change attribution tooltips

6. **Phase 6: Redline Export**
   - Implement Word export with Track Changes
   - Implement PDF export with visual markup
   - Export modal UI with format selection
   - Metadata embedding and user attribution

7. **Phase 7: Performance & Polish**
   - Optimize virtualized scrolling
   - Implement page caching
   - Add loading states and error handling
   - Accessibility improvements

8. **Phase 8: Data Retention & Cleanup**
   - Implement 90-day cleanup job for draft/cancelled contracts
   - Add retention metadata tracking
   - Create manual cleanup utilities

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| HTML conversion loses formatting | High | Test with diverse documents; provide manual retry; require user verification |
| Position mapping inaccurate | High | Use clause-level fallback; leverage existing Feature 005 metadata; text matching as backup |
| Export format incompatible with Word | Medium | Test with multiple Word versions; follow Track Changes XML spec strictly |
| Large documents cause performance issues | Medium | Implement virtualized scrolling; progressive loading; page caching |
| Conversion libraries have security vulnerabilities | Medium | Use well-maintained libraries; regular dependency updates; input validation |
| Storage costs increase significantly | Low | Implement retention policy; monitor storage usage; compress HTML if needed |

## Dependencies

### External Dependencies (New)
- `mammoth` - Word to HTML conversion
- `pdf2htmlEX` or equivalent - PDF to HTML conversion
- `docx` - Word document generation with Track Changes
- `puppeteer` or `html-pdf-node` - PDF generation from HTML

### Internal Dependencies (Existing)
- Feature 005: Leverage `locationPage` and `locationPosition` metadata
- Feature 006: Use `computeProjection()` for tracked changes data
- Feature 007: Per-finding decision system provides granular change data

### System Dependencies
- Node.js (existing)
- SQLite (existing)
- File system storage for temporary conversion files

## Success Metrics (from spec)

- SC-001: Time to locate finding < 5 seconds (vs ~30s currently)
- SC-002: Document load < 3 seconds for 200-page contracts
- SC-003: 90% user satisfaction with document context
- SC-004: Position accuracy within 1 paragraph
- SC-005: Navigation response < 500ms
- SC-006: Tracked changes display correctly
- SC-007: 100% export success for finalized contracts < 30s
- SC-008: Word exports open correctly with Track Changes
- SC-009: 80% of finalized contracts exported within 24 hours
- SC-010: 70% reduction in "where is this clause" support requests
- SC-011: 30% reduction in contract review time
- SC-012: User satisfaction 8+/10

## Next Steps

1. ✅ Complete Phase 0 research and document findings
2. ✅ Complete Phase 1 design artifacts (data-model.md, contracts/, quickstart.md)
3. ⏭️ Run `/speckit.tasks` to generate implementation task breakdown
4. ⏭️ Begin Phase 1 implementation (Document Conversion Infrastructure)
