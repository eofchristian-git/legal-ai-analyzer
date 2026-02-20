# Data Model: PDF Document Viewer & Original-File Export

**Feature**: 012-pdf-viewer-docx-export
**Date**: 2026-02-20

---

## Schema Changes

### Modified: `ContractDocument`

The existing `ContractDocument` model (Feature 008) is extended with PDF viewer pipeline fields. Existing fields (`htmlContent`, `clausePositions`, `findingPositions`, `conversionStatus`) remain for backward compatibility but will be deprecated once the PDF viewer is validated.

```prisma
model ContractDocument {
  // ... existing fields unchanged ...

  // NEW: PDF viewer pipeline (Feature 012)
  pdfPath                  String?   // Absolute path to LibreOffice-converted PDF file
  pdfPageCount             Int?      // Total pages in the PDF
  textPositions            String?   // JSON: TextPosition[] — character-level coordinates per page
  clausePositionMappings   String?   // JSON: ClausePdfMapping[] — clause → page/rect
  findingPositionMappings  String?   // JSON: FindingPdfMapping[] — finding → page/rects + riskLevel
  pdfConversionStatus      String    @default("pending")  // 'pending' | 'converting' | 'extracting' | 'mapping' | 'completed' | 'failed'
  pdfConversionError       String?   // Error message if conversion/extraction failed
}
```

**Migration notes**:
- All new fields are nullable (except `pdfConversionStatus` with default) — no data loss on existing records.
- Existing `conversionStatus` field tracks HTML conversion; new `pdfConversionStatus` tracks PDF pipeline independently.
- JSON fields store denormalized position data to avoid additional tables and joins.

### Unchanged (used as-is)

- **`ClauseDecision`**: Append-only event log. Projections from this drive both viewer overlays and export content.
- **`AnalysisFinding`**: Source of `excerpt`, `fallbackText`, `riskLevel`, `summary` used for position mapping and export.
- **`AnalysisClause`**: Source of `clauseName`, `clauseText`, `position` used for clause navigation.
- **`Document`**: Source of `filePath` for original DOCX file used by export pipeline.

### Deprecated (Phase 6)

- `ContractAnalysis.highlightsApplied` — Collabora-specific flag for baked-in highlights. No longer needed.

---

## JSON Data Structures

### TextPosition (stored in `ContractDocument.textPositions`)

```typescript
interface TextPosition {
  /** The text content of this span */
  text: string;
  /** Zero-based page index in the PDF */
  pageIndex: number;
  /** Left edge in PDF points (72 points = 1 inch) */
  x: number;
  /** Top edge in PDF points (origin: top-left after coordinate flip) */
  y: number;
  /** Width in PDF points */
  width: number;
  /** Height in PDF points */
  height: number;
}
```

**Volume**: A typical 20-page contract produces ~2,000-5,000 TextPosition entries (~200-500KB JSON).

### ClausePdfMapping (stored in `ContractDocument.clausePositionMappings`)

```typescript
interface ClausePdfMapping {
  /** References AnalysisClause.id */
  clauseId: string;
  /** Page where the clause starts */
  pageIndex: number;
  /** Bounding rectangle of the clause heading/start text */
  startRect: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  /** Match confidence: 1.0 = exact, <1.0 = fuzzy */
  confidence: number;
  /** True if mapping failed — clause exists in list but has no position */
  unmapped: boolean;
}
```

**Volume**: Typically 10-50 entries per contract (~5-25KB JSON).

### FindingPdfMapping (stored in `ContractDocument.findingPositionMappings`)

```typescript
interface FindingPdfMapping {
  /** References AnalysisFinding.id */
  findingId: string;
  /** References AnalysisClause.id (for grouping) */
  clauseId: string;
  /** Risk level for highlight coloring */
  riskLevel: 'RED' | 'YELLOW' | 'GREEN';
  /** Page where the finding excerpt starts */
  pageIndex: number;
  /** One or more rectangles covering the excerpt text (may span lines) */
  rects: Array<{
    x: number;
    y: number;
    width: number;
    height: number;
  }>;
  /** Match confidence */
  confidence: number;
  /** True if mapping failed */
  unmapped: boolean;
}
```

**Volume**: Typically 5-30 entries per contract (~5-20KB JSON).

---

## Entity Relationships

```
Document (original DOCX)
    │
    ├── Contract
    │   ├── ContractDocument (1:1)
    │   │   ├── pdfPath → PDF file on disk
    │   │   ├── textPositions → TextPosition[]
    │   │   ├── clausePositionMappings → ClausePdfMapping[]
    │   │   └── findingPositionMappings → FindingPdfMapping[]
    │   │
    │   └── ContractAnalysis (1:1)
    │       ├── AnalysisClause[] (1:N)
    │       │   ├── ClauseDecision[] (1:N, append-only)
    │       │   └── AnalysisFinding[] (1:N)
    │       │       └── ClauseDecision[] (1:N, append-only)
    │       └── highlightsApplied ← DEPRECATED
```

---

## State Transitions

### PDF Conversion Pipeline Status

```
pending → converting → extracting → mapping → completed
    │         │            │           │
    └─────────┴────────────┴───────────┴──→ failed
```

| State | Description |
|-------|-------------|
| `pending` | Default. PDF pipeline not yet started. |
| `converting` | LibreOffice headless is converting DOCX → PDF. |
| `extracting` | `pdfjs-dist` is extracting text positions from the PDF. |
| `mapping` | Fuzzy matching is mapping clause/finding excerpts to PDF coordinates. |
| `completed` | Pipeline finished. PDF + positions + mappings available. |
| `failed` | Pipeline failed at any stage. `pdfConversionError` contains details. |

---

## Data Flow

### At Analysis Time (server-side, one-time)

```
1. AI analysis completes → clauses + findings saved to DB
2. Read original DOCX from Document.filePath
3. LibreOffice headless: DOCX → PDF → save to ContractDocument.pdfPath
4. pdfjs-dist: PDF → TextPosition[] → save to ContractDocument.textPositions
5. For each AnalysisClause:
   mapExcerptToPositions(clauseName/clauseText, textPositions) → ClausePdfMapping
6. For each AnalysisFinding:
   mapExcerptToPositions(excerpt, textPositions) → FindingPdfMapping
7. Save all mappings to ContractDocument
8. Set pdfConversionStatus = 'completed'
```

### At View Time (client-side, every page load)

```
1. GET /api/contracts/[id]/pdf-document → PDF binary + mappings
2. pdf.js renders PDF pages onto <canvas> elements (virtualized)
3. OverlayManager reads:
   - findingPositionMappings (for risk highlights)
   - computeProjection() results (for redline overlays + notes)
4. Overlay layers render colored rects, strikethrough lines, annotation boxes
5. Click clause → look up clausePositionMappings → scrollTo(page, y)
```

### At Export Time (server-side, on demand)

```
1. Read original DOCX from Document.filePath
2. Unzip with jszip
3. Parse word/document.xml with fast-xml-parser
4. For each finding with APPLY_FALLBACK decision:
   - Find excerpt text in <w:t> runs
   - Split runs at character boundaries
   - Wrap in <w:del> (author="Legal AI Analyzer")
   - Insert <w:ins> with fallbackText (author="Legal AI Analyzer")
5. For each finding with notes/summary:
   - Add <w:commentRangeStart/End> around excerpt
   - Build <w:comment> with: "⚠ {riskLevel}: {summary}\n{notes}"
6. Ensure word/comments.xml and relationships exist
7. Repack with jszip → serve as download
```
