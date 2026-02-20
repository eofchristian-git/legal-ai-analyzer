# Research: Interactive Document Viewer & Redline Export

**Feature**: 008-document-viewer-redline  
**Date**: 2026-02-17  
**Purpose**: Technology selection and pattern definition for document conversion, rendering, and export

## R1: Document Conversion (Word → HTML)

### Decision: `mammoth.js`

**Rationale**:
- Clean, semantic HTML output focused on content over styling
- Excellent table and list support
- Active maintenance (last update 2023, stable API)
- Pure JavaScript, no external dependencies
- Good balance of formatting preservation vs. simplicity
- Text positioning remains reliable through clean markup

**Alternatives Considered**:
- `docx2html`: Better styling preservation but more complex HTML output makes position mapping harder
- LibreOffice CLI: Requires system dependency, slower conversion, harder to integrate
- Pandoc: Excellent but overkill for our use case, additional system dependency

**Implementation Notes**:
- Convert during analysis phase (`/api/contracts/[id]/analyze`)
- Extract styles to separate CSS for consistent rendering
- Preserve data attributes for clause/finding boundaries
- Handle embedded images by converting to base64 or external URLs

**Example Usage**:
```typescript
import mammoth from "mammoth";

const result = await mammoth.convertToHtml(
  { buffer: fileBuffer },
  {
    styleMap: ["p[style-name='Heading 1'] => h1"],
    includeDefaultStyleMap: true
  }
);

const html = result.value; // Clean HTML
const messages = result.messages; // Warnings/errors
```

## R2: Document Conversion (PDF → HTML)

### Decision: `pdf.js` with custom text layer extraction

**Rationale**:
- Mozilla's official PDF rendering library, well-maintained
- Provides text layer with position coordinates out of the box
- Better suited for web environment than CLI tools
- Handles complex PDFs with images, forms, annotations
- Can extract text with bounding boxes for position mapping
- No system dependencies required

**Alternatives Considered**:
- `pdf2htmlEX`: Excellent layout preservation but CLI tool, system dependency, harder integration
- `pdftohtml` (Poppler): CLI tool, less accurate layout than pdf2htmlEX
- Canvas-only rendering: No text extraction, can't support text selection or search

**Implementation Notes**:
- Use pdf.js to extract text layer with positions
- Render to HTML using text coordinates
- Preserve page boundaries and layout
- Extract and embed images as base64
- Handle forms and annotations by converting to static content

**Example Usage**:
```typescript
import * as pdfjsLib from "pdfjs-dist";

const loadingTask = pdfjsLib.getDocument(pdfUrl);
const pdf = await loadingTask.promise;

for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
  const page = await pdf.getPage(pageNum);
  const textContent = await page.getTextContent();
  
  // textContent.items contains text with positions
  // Transform to HTML with position data attributes
}
```

## R3: Word Export with Track Changes

### Decision: `docx` library

**Rationale**:
- Most comprehensive TypeScript library for Word generation
- Native Track Changes support via revision marks
- User attribution through author metadata
- Compatible with Microsoft Word 2016+
- Programmatic control over all document elements
- Active development and good documentation

**Alternatives Considered**:
- `officegen`: Less Track Changes support, older API
- `docxtemplater`: Template-based, not suitable for programmatic generation
- XML manipulation directly: Too low-level, error-prone

**Implementation Notes**:
- Generate Word document from original HTML + tracked changes data
- Use `Paragraph.createTextRun()` with revision marks
- Set `author` and `date` for each change
- Export deletion runs with `isDelete: true`
- Export insertion runs with normal styling

**Example Usage**:
```typescript
import { Document, Paragraph, TextRun, AlignmentType } from "docx";

const doc = new Document({
  sections: [{
    properties: {},
    children: [
      new Paragraph({
        children: [
          new TextRun({
            text: "Original text",
            revision: {
              id: 1,
              author: "John Doe",
              date: new Date(),
              type: "delete"
            }
          }),
          new TextRun({
            text: "Replacement text",
            revision: {
              id: 2,
              author: "John Doe",
              date: new Date(),
              type: "insert"
            }
          })
        ]
      })
    ]
  }]
});
```

## R4: PDF Export with Redline Markup

### Decision: `puppeteer` (headless Chrome)

**Rationale**:
- Most accurate HTML to PDF conversion (uses real browser engine)
- Perfect rendering of strikethrough and underline styles
- CSS support for visual change markup
- Page break control and headers/footers
- Metadata embedding support
- Industry standard for server-side PDF generation

**Alternatives Considered**:
- `html-pdf-node`: Lighter but less accurate rendering
- `pdf-lib`: Too low-level for HTML conversion
- `jsPDF`: Client-side focused, limited HTML support

**Implementation Notes**:
- Generate HTML with inline CSS for change markup
- Use `<del>` tags with red strikethrough for deletions
- Use `<ins>` tags with green/blue underline for insertions
- Include metadata in PDF properties
- Add header with contract title and export date

**Example Usage**:
```typescript
import puppeteer from "puppeteer";

const browser = await puppeteer.launch({
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox']
});

const page = await browser.newPage();
await page.setContent(htmlWithChanges, { waitUntil: 'networkidle0' });

const pdf = await page.pdf({
  format: 'A4',
  printBackground: true,
  margin: { top: '20mm', bottom: '20mm', left: '15mm', right: '15mm' },
  displayHeaderFooter: true,
  headerTemplate: '<div class="header">Contract: ${contractTitle}</div>',
  footerTemplate: '<div class="footer">Page <span class="pageNumber"></span></div>'
});

await browser.close();
```

## R5: Virtualized Scrolling Implementation

### Decision: `react-window` with custom variable height support

**Rationale**:
- Lightweight and performant (14KB gzipped)
- Good support for variable-height items
- Simple API, easy integration
- Smooth scrolling experience
- Can handle 200+ pages without performance issues
- Compatible with position mapping system

**Alternatives Considered**:
- `react-virtuoso`: More features but heavier bundle, overkill for our needs
- Custom Intersection Observer: More work, harder to get smooth scrolling
- CSS `content-visibility`: Browser support inconsistent, less control

**Implementation Notes**:
- Use `VariableSizeList` component
- Calculate item heights from HTML element measurements
- Cache heights for performance
- Implement scroll-to-position for navigation
- Use `overscanCount` for smooth scrolling

**Example Usage**:
```typescript
import { VariableSizeList } from 'react-window';

const DocumentViewer = ({ pages, highlights }: Props) => {
  const listRef = useRef<VariableSizeList>(null);
  const [pageHeights, setPageHeights] = useState<number[]>([]);

  const getItemSize = (index: number) => pageHeights[index] || 1000;

  const scrollToClause = (clauseId: string) => {
    const pageIndex = findPageForClause(clauseId);
    listRef.current?.scrollToItem(pageIndex, 'start');
  };

  return (
    <VariableSizeList
      ref={listRef}
      height={800}
      itemCount={pages.length}
      itemSize={getItemSize}
      width="100%"
      overscanCount={2}
    >
      {({ index, style }) => (
        <div style={style}>
          <PageRenderer page={pages[index]} highlights={highlights[index]} />
        </div>
      )}
    </VariableSizeList>
  );
};
```

## R6: Position Mapping Strategy

### Decision: Hybrid approach with data attributes and text matching

**Approach**:
1. **During HTML Conversion**:
   - Inject `data-clause-id` and `data-finding-id` attributes at known boundaries
   - Store bounding rectangles for each clause/finding in database
   - Use existing `locationPage` and `locationPosition` from Feature 005

2. **Position Calculation**:
   - After HTML rendering, measure element positions using `getBoundingClientRect()`
   - Store `{ page, x, y, width, height }` for each clause/finding
   - Update `ContractDocument.clausePositions` and `findingPositions` JSON fields

3. **Position Retrieval**:
   - Query DOM elements by `data-clause-id` attribute
   - Use cached positions from database for initial render
   - Recalculate on window resize or content changes

4. **Fallback Strategy**:
   - If exact position unavailable, use text matching to find excerpt
   - Fall back to clause-level positioning (show at clause start)
   - Display warning icon when precision is reduced

**Implementation Notes**:
- Position mapping happens during analysis phase after HTML conversion
- Store positions as JSON in database for efficient retrieval
- Use Intersection Observer to detect visible clauses for scroll sync
- Debounce position updates to avoid excessive calculations

**Example Data Structure**:
```typescript
interface ClausePosition {
  clauseId: string;
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

interface FindingPosition {
  findingId: string;
  clauseId: string;
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

// Stored in ContractDocument
{
  clausePositions: ClausePosition[];
  findingPositions: FindingPosition[];
}
```

## Best Practices

### Document Conversion
- Always validate conversion output before storing
- Implement retry logic with alternative settings on failure
- Preserve original uploaded document as fallback
- Sanitize HTML output to prevent XSS (use DOMPurify)
- Handle conversion errors gracefully with user-friendly messages

### Performance
- Convert documents asynchronously during analysis phase
- Cache converted HTML in database
- Use virtualized scrolling for documents > 50 pages
- Lazy-load images and heavy content
- Implement progressive rendering (first page first)

### Export
- Generate exports on-demand, don't pre-generate
- Use temporary file storage and cleanup after download
- Stream large PDFs instead of loading into memory
- Set appropriate timeouts for export generation (30s limit)
- Include metadata for audit trail

### Position Mapping
- Recalculate positions when document structure changes
- Use relative positions (percentages) for responsive layouts
- Cache position calculations
- Implement debouncing for scroll-triggered updates (200-300ms)
- Validate position data before storage

## Dependency Installation

```bash
# Document conversion
npm install mammoth pdfjs-dist

# Document export
npm install docx puppeteer

# Virtualized scrolling
npm install react-window

# Utilities (if needed)
npm install dompurify @types/dompurify
```

## Security Considerations

### HTML Sanitization
- Use DOMPurify to sanitize converted HTML
- Strip potentially dangerous attributes (onclick, onerror, etc.)
- Whitelist allowed tags and attributes
- Prevent XSS through user-uploaded content

### File Upload Validation
- Validate MIME types before conversion
- Limit file sizes (max 50MB recommended)
- Scan for malicious content
- Use secure temporary storage for uploads

### Export Security
- Validate user permissions before export
- Include watermarks if contract is not finalized
- Audit log all export actions
- Rate limit export requests to prevent abuse

## Performance Benchmarks (Expected)

Based on library documentation and similar implementations:

| Operation | Target | Notes |
|-----------|--------|-------|
| Word → HTML (50 pages) | < 2s | mammoth.js is fast for typical contracts |
| PDF → HTML (50 pages) | < 5s | pdf.js text extraction is slower |
| HTML render (first page) | < 1s | With virtualization |
| Position calculation | < 500ms | Per 50 clauses |
| Word export (50 pages) | < 10s | Including Track Changes |
| PDF export (50 pages) | < 15s | Puppeteer rendering time |

## Future Enhancements (Out of Scope for MVP)

- Real-time collaborative editing
- Inline comments and annotations
- Version comparison (diff two contracts)
- OCR for scanned PDFs
- Mobile app support with native rendering
- Cloud storage integration for large files

## References

- [mammoth.js documentation](https://github.com/mwilliamson/mammoth.js)
- [pdf.js documentation](https://mozilla.github.io/pdf.js/)
- [docx library documentation](https://docx.js.org/)
- [Puppeteer API](https://pptr.dev/)
- [react-window documentation](https://react-window.vercel.app/)
- [Microsoft Word Track Changes XML format](https://docs.microsoft.com/en-us/openspecs/office_standards/ms-docx/)
