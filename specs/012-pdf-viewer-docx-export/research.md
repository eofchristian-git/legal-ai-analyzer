# Research: PDF Viewer + Server-Side DOCX Export

**Feature**: 012-pdf-viewer-docx-export

---

## Background & Motivation

### Current System: Collabora-Based Document Viewer

The existing document viewer (Features 010/011) uses Collabora Online (CODE) to render and modify DOCX files inside an iframe. All interactions (navigation, highlighting, fallback application, strikethrough, undo) are performed via UNO commands sent through the PostMessage API.

#### Identified Problems

1. **Fire-and-forget UNO commands**: There is no reliable feedback mechanism to confirm whether an `ExecuteSearch`, `InsertText`, or `Strikeout` command succeeded. The system uses fixed-delay timers (100-500ms between steps) and hopes each command completes.

2. **Text search fragility**: Navigation depends on `.uno:ExecuteSearch` finding exact text matches. Unicode normalization differences (smart quotes, em-dashes, non-breaking spaces), multi-occurrence ambiguity, and Collabora's internal text representation cause ~15-30% failure rate.

3. **Slow preparation**: Applying risk-level highlights to N findings requires 2N sequential UNO commands with 450ms delays. A 20-finding document takes ~18 seconds behind a loading overlay before the user can interact.

4. **Complex redline chains**: Each "Apply Fallback" operation is a 7-step UNO command chain (search → select → insert replacement → search back to original → select → strikethrough → save) with 500ms delays per step = 3.5 seconds with no confirmation.

5. **Export unreliability**: The Collabora DOCX export serves whatever the UNO commands managed to write. Partial failures during multi-step chains can produce corrupted or incomplete modifications.

6. **Infrastructure overhead**: Requires a running Collabora CODE Docker container for every page view.

7. **Bookmark API unusable**: Research in Feature 011 confirmed that `.uno:InsertBookmark` opens a dialog in Collabora Online and cannot be used programmatically for anchor-based navigation.

### Current Export Paths

| Path | What it exports | Fidelity |
|---|---|---|
| `/api/contracts/[id]/export-collabora` | The live DOCX file that Collabora modified | Original format preserved, but modifications may be incomplete |
| `/api/contracts/[id]/export-redline` | A brand-new DOCX built from DB data via `document-exporter.ts` | Database-accurate, but loses all original formatting (headers, logos, tables, page layout) |

**User requirement**: Export the **original contract file** with all triage modifications (fallback language, strikethrough, notes) baked in. Neither current path fully satisfies this.

---

## Common Approaches in Legal Tech

Research into how existing legal tech platforms handle clause navigation and document annotation reveals several patterns:

### Pattern 1: PDF Rendering + Annotation Overlay (Selected)

**Used by**: Kira Systems, Luminance, eBrevia

- Convert documents to PDF for pixel-perfect display
- Render annotations (highlights, comments, redlines) as HTML/SVG overlays on top of the PDF canvas
- All changes stored in a database, not in the document file
- Export modifies the original file server-side

**Pros**: Deterministic navigation via pre-computed coordinates, instant visual updates, no runtime editing dependency  
**Cons**: No inline text reflow in viewer (annotations appear as overlays, not inline edits)

### Pattern 2: HTML Conversion + DOM Manipulation

**Used by**: ContractPodAi, Ironclad

- Convert DOCX to HTML, inject data attributes for clause boundaries
- Use DOM-based navigation (`element.scrollIntoView()`)
- Modify DOM for visual changes

**Pros**: Fast, familiar web technology  
**Cons**: Conversion loses formatting; export requires rebuilding document from scratch

### Pattern 3: Native Editor Integration

**Used by**: DocuSign CLM (Word Add-in), Agiloft

- Use Word Online or native editor APIs
- Direct access to document model

**Pros**: Full editing capabilities  
**Cons**: Requires Microsoft/Google ecosystem; complex API integration

### Pattern 4: Custom Document Engine

**Used by**: iManage (RAVN), Thomson Reuters

- Purpose-built rendering engine
- Complete control over document model

**Pros**: Maximum flexibility  
**Cons**: Extremely high development cost

---

## Decision: Pattern 1 — PDF Rendering + Annotation Overlay

### Why PDF + Overlay

1. **Navigation reliability**: Text positions are pre-computed at analysis time from the PDF. Clicking a clause = `scrollTo(page, y)`. No text search at runtime. Expected >95% accuracy vs ~70-85% with text search.

2. **Instant visual feedback**: Applying a fallback = save decision to DB → re-render overlay. No UNO commands, no 3.5-second waits.

3. **Deterministic display**: PDF rendering via pdf.js is well-tested, widely used, and produces identical output every time. No dependency on Collabora container.

4. **Original file export**: Server-side DOCX XML manipulation using `jszip` + `fast-xml-parser` surgically modifies the original file's XML to inject native Word Track Changes (`<w:del>/<w:ins>`) and Word Comments (`<w:comment>`). This preserves all original formatting while producing a file that opens in Word with Accept/Reject functionality.

5. **Reduced infrastructure**: No Collabora Docker container needed for viewing. LibreOffice headless only runs once at analysis time for DOCX → PDF conversion.

### Trade-offs Accepted

1. **No inline text reflow in viewer**: Fallback text appears as annotation boxes next to/below the original text, not as inline replacements. This is acceptable because:
   - The viewer is for **review/triage**, not final editing
   - The exported DOCX will have proper inline tracked changes
   - Most legal review tools (Kira, Luminance) use the same pattern

2. **One-time conversion dependency**: LibreOffice headless must be available at analysis time. Mitigated by Docker container or system installation.

3. **Text position mapping**: Fuzzy matching between AI-extracted excerpts and PDF text positions may miss some excerpts. Mitigated by Levenshtein distance matching and logging misses for debugging.

### Export Architecture

The exported DOCX is the **original file** with surgical modifications:

```
Original DOCX (uploaded by user)
    ↓ unzip with jszip
    ↓ parse word/document.xml with fast-xml-parser
    ↓ for each resolved finding with fallback:
    │   ↓ find excerpt text across <w:t> runs
    │   ↓ split runs at character boundaries
    │   ↓ wrap original runs in <w:del> (tracked deletion)
    │   ↓ insert new runs in <w:ins> (tracked insertion)
    │   ↓ preserve original <w:rPr> (font, size, bold, etc.)
    ↓ for each triage note:
    │   ↓ add <w:commentRangeStart/End> in document.xml
    │   ↓ add <w:comment> entry in word/comments.xml
    ↓ repack with jszip
    ↓ serve as download
= Original contract with native Word Track Changes + Comments
```

When opened in Microsoft Word:
- Deletions appear with strikethrough in the Review pane
- Insertions appear with underline in the Review pane
- User can Accept/Reject each change individually
- Triage notes appear as margin comments
- All original formatting, headers, logos, and page layout are preserved

---

## Technology Stack

| Component | Technology | Purpose |
|---|---|---|
| PDF rendering | `pdfjs-dist` (already installed) | Canvas-based page rendering |
| Text position extraction | `pdfjs-dist` `getTextContent()` | Character-level coordinates from PDF |
| Annotation overlays | React + absolute-positioned divs | Highlights, strikethrough, fallback boxes |
| Virtualized scrolling | `react-window` (already installed) | Efficient rendering for large documents |
| DOCX → PDF conversion | LibreOffice headless | High-fidelity conversion preserving layout |
| DOCX XML manipulation | `jszip` + `fast-xml-parser` | Surgical modification of original file |
| PDF annotation baking | `pdf-lib` | Optional: bake overlays into PDF for export |
| Fuzzy text matching | Custom (Levenshtein) | Map AI excerpts to PDF text positions |

---

## Spec Clarification Decisions (Session 2026-02-20)

### C1: Word Comment Content Scope

- **Decision**: Each exported Word comment contains: risk level indicator (e.g., "⚠ RED"), AI-generated finding summary, and reviewer-typed notes.
- **Rationale**: Provides full context for recipients to understand why a change was proposed. Escalation reasons and playbook rule references are excluded as internal workflow artifacts that may confuse external recipients.
- **Alternatives considered**: (A) User notes only — too sparse, recipients lack context; (C) Everything including escalation/playbook — leaks internal process; (D) Configurable — unnecessary complexity for MVP.

### C2: Export Options — Replace vs Coexist

- **Decision**: The new "Original with Changes" export replaces the existing reconstructed DOCX export entirely. One Word export option.
- **Rationale**: The new export is strictly superior — preserves original formatting AND includes tracked changes from the database. Keeping both adds UI clutter, maintenance burden, and user confusion.
- **Alternatives considered**: (B) Coexist with different labels — confusing for users; (C) Ship both during transition — adds scope.
- **Impact**: `src/lib/document-exporter.ts` and `/api/contracts/[id]/export-redline` are deprecated and removed in Phase 6.

### C3: Author Attribution

- **Decision**: All tracked changes and Word comments attributed to a fixed system name: "Legal AI Analyzer".
- **Rationale**: Makes it clear to recipients that changes were generated by an automated review tool, not a specific individual. Avoids accountability confusion. Reviewer identity is still recorded in the database via `ClauseDecision.userId`.
- **Alternatives considered**: (A) Logged-in reviewer name — could imply personal endorsement; (C) Combined (system for AI, reviewer for notes) — adds complexity for marginal benefit.

---

## References

- OOXML Specification for Track Changes: [ECMA-376, Part 1, §17.13](https://www.ecma-international.org/publications-and-standards/standards/ecma-376/)
- pdf.js documentation: https://mozilla.github.io/pdf.js/
- pdf-lib documentation: https://pdf-lib.js.org/
- Feature 008 spec: `specs/008-document-viewer-redline/`
- Feature 011 research on Collabora limitations: `.uno:InsertBookmark` opens dialog, cannot be used programmatically
