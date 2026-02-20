# Document Conversion Workflow

**Feature**: 008-document-viewer-redline  
**Date**: 2026-02-17  
**Purpose**: Technical specification for converting Word/PDF documents to HTML with position mappings

## Overview

Document conversion is the foundational process that enables the interactive document viewer. It transforms uploaded Word (.docx) or PDF files into HTML format while preserving layout, calculating position mappings for clauses and findings, and storing the results for rendering.

## Conversion Pipeline

```
Upload Document
   ↓
Detect Format
   ├─→ Word (.docx) ──→ mammoth.js ──→ HTML
   └─→ PDF ───────────→ pdf.js ────→ HTML
                           ↓
              Sanitize HTML (DOMPurify)
                           ↓
              Calculate Position Mappings
                           ↓
              Store in ContractDocument
                           ↓
              Update Status to 'completed'
```

## Word to HTML Conversion

### Library: mammoth.js

**Input**: Word .docx file (binary buffer)  
**Output**: Clean HTML string

### Configuration

```typescript
import mammoth from "mammoth";

const conversionOptions = {
  // Style mapping for semantic HTML
  styleMap: [
    "p[style-name='Heading 1'] => h1.clause-heading",
    "p[style-name='Heading 2'] => h2.section-heading",
    "p[style-name='Heading 3'] => h3.subsection-heading",
    "p[style-name='Normal'] => p.clause-text",
  ],
  
  // Include default style mappings
  includeDefaultStyleMap: true,
  
  // Convert embedded images
  convertImage: mammoth.images.imgElement((image) => {
    return image.read("base64").then((imageBuffer) => {
      return {
        src: `data:${image.contentType};base64,${imageBuffer}`
      };
    });
  })
};
```

### Implementation

```typescript
async function convertWordToHTML(
  fileBuffer: Buffer,
  contractId: string
): Promise<{ html: string; warnings: string[] }> {
  try {
    const result = await mammoth.convertToHtml(
      { buffer: fileBuffer },
      conversionOptions
    );
    
    // Extract HTML
    const html = result.value;
    
    // Collect warnings
    const warnings = result.messages
      .filter(m => m.type === 'warning')
      .map(m => m.message);
    
    // Inject data attributes for position mapping
    const htmlWithAttributes = injectClauseMarkers(html, contractId);
    
    return { html: htmlWithAttributes, warnings };
    
  } catch (error) {
    throw new Error(`Word conversion failed: ${error.message}`);
  }
}
```

### Handling Complex Elements

**Tables**:
- Preserved as HTML `<table>` elements
- Cell formatting maintained
- Borders and spacing converted to inline CSS

**Images**:
- Converted to base64 data URLs
- Embedded directly in HTML
- Alt text preserved if available

**Lists**:
- Ordered lists → `<ol>`
- Unordered lists → `<ul>`
- Nesting preserved

**Headers/Footers**:
- Extracted as separate sections
- Positioned with CSS
- Page numbers converted to placeholders

---

## PDF to HTML Conversion

### Library: pdf.js

**Input**: PDF file (ArrayBuffer)  
**Output**: HTML with text layer and positions

### Configuration

```typescript
import * as pdfjsLib from "pdfjs-dist";

// Set worker source
pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.js';

const loadOptions = {
  // Disable streaming for reliable text extraction
  disableStream: true,
  // Enable text layer for position data
  isEvalSupported: false,
  useSystemFonts: true
};
```

### Implementation

```typescript
async function convertPDFToHTML(
  fileBuffer: Buffer,
  contractId: string
): Promise<{ html: string; pageCount: number }> {
  try {
    // Load PDF document
    const loadingTask = pdfjsLib.getDocument({
      data: fileBuffer,
      ...loadOptions
    });
    
    const pdf = await loadingTask.promise;
    const pageCount = pdf.numPages;
    
    const pages: string[] = [];
    
    // Process each page
    for (let pageNum = 1; pageNum <= pageCount; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const pageHTML = await convertPDFPage(page, pageNum, contractId);
      pages.push(pageHTML);
    }
    
    // Combine pages
    const html = `
      <div class="pdf-document">
        ${pages.join('\n')}
      </div>
    `;
    
    return { html, pageCount };
    
  } catch (error) {
    throw new Error(`PDF conversion failed: ${error.message}`);
  }
}

async function convertPDFPage(
  page: PDFPageProxy,
  pageNum: number,
  contractId: string
): Promise<string> {
  // Get viewport
  const viewport = page.getViewport({ scale: 1.5 });
  
  // Get text content with positions
  const textContent = await page.getTextContent();
  
  // Build HTML from text items
  const textItems = textContent.items.map((item) => {
    const tx = item.transform;
    const x = tx[4];
    const y = tx[5];
    const width = item.width;
    const height = item.height;
    
    return `
      <span 
        class="pdf-text-item"
        style="
          position: absolute;
          left: ${x}px;
          top: ${y}px;
          width: ${width}px;
          height: ${height}px;
          font-size: ${item.height}px;
        "
        data-page="${pageNum}"
      >
        ${escapeHTML(item.str)}
      </span>
    `;
  });
  
  return `
    <div 
      class="pdf-page" 
      data-page-number="${pageNum}"
      style="
        position: relative;
        width: ${viewport.width}px;
        height: ${viewport.height}px;
        page-break-after: always;
      "
    >
      ${textItems.join('')}
    </div>
  `;
}
```

### Handling Complex Elements

**Images**:
- Extract using `page.getOperatorList()`
- Render to canvas, convert to base64
- Position absolutely using PDF coordinates

**Forms**:
- Extract form fields
- Convert to static HTML elements
- Preserve visual appearance

**Annotations**:
- Extract annotation data
- Convert to HTML elements or comments
- Position using PDF coordinates

---

## Position Mapping

### Algorithm

Position mapping connects clause and finding IDs to their locations in the HTML document.

### Step 1: Inject Clause Markers

```typescript
function injectClauseMarkers(
  html: string,
  contractId: string,
  clauses: AnalysisClause[]
): string {
  let result = html;
  
  for (const clause of clauses) {
    // Find clause text in HTML
    const clauseText = clause.clauseText || clause.clauseNumber;
    if (!clauseText) continue;
    
    // Use fuzzy matching to find position
    const position = findTextPosition(result, clauseText);
    if (!position) {
      console.warn(`Could not find position for clause ${clause.id}`);
      continue;
    }
    
    // Inject data attribute
    const marker = `<span data-clause-id="${clause.id}" data-clause-number="${clause.clauseNumber}">`;
    result = insertAt(result, position, marker);
  }
  
  return result;
}
```

### Step 2: Calculate Bounding Rectangles

```typescript
async function calculatePositions(
  documentId: string,
  html: string
): Promise<{
  clausePositions: ClausePosition[];
  findingPositions: FindingPosition[];
}> {
  // Render HTML in headless browser
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  
  // Set viewport to standard size
  await page.setViewport({ width: 800, height: 1200 });
  
  // Load HTML
  await page.setContent(html, { waitUntil: 'networkidle0' });
  
  // Calculate clause positions
  const clausePositions = await page.evaluate(() => {
    const elements = document.querySelectorAll('[data-clause-id]');
    return Array.from(elements).map((el) => {
      const rect = el.getBoundingClientRect();
      return {
        clauseId: el.getAttribute('data-clause-id'),
        page: Math.floor(rect.top / 1200) + 1,
        x: rect.left,
        y: rect.top % 1200,
        width: rect.width,
        height: rect.height
      };
    });
  });
  
  // Calculate finding positions using locationPage/locationPosition
  const findingPositions = await calculateFindingPositions(
    page,
    documentId
  );
  
  await browser.close();
  
  return { clausePositions, findingPositions };
}
```

### Step 3: Finding Position Calculation

```typescript
async function calculateFindingPositions(
  page: Page,
  documentId: string
): Promise<FindingPosition[]> {
  // Fetch findings from database
  const findings = await db.analysisFinding.findMany({
    where: {
      clause: {
        analysis: {
          contract: {
            document: { id: documentId }
          }
        }
      }
    },
    include: { clause: true }
  });
  
  const positions: FindingPosition[] = [];
  
  for (const finding of findings) {
    // Use existing locationPage and locationPosition from Feature 005
    const page = finding.locationPage || 1;
    let position;
    
    if (finding.excerpt) {
      // Find excerpt in HTML
      position = await page.evaluate((excerpt) => {
        const text = document.body.innerText;
        const index = text.indexOf(excerpt);
        if (index === -1) return null;
        
        // Create range to get position
        const range = document.createRange();
        const walker = document.createTreeWalker(
          document.body,
          NodeFilter.SHOW_TEXT
        );
        
        let currentPos = 0;
        let node;
        while (node = walker.nextNode()) {
          const nodeLength = node.textContent.length;
          if (currentPos + nodeLength >= index) {
            range.setStart(node, index - currentPos);
            range.setEnd(node, Math.min(index - currentPos + excerpt.length, nodeLength));
            const rect = range.getBoundingClientRect();
            return {
              x: rect.left,
              y: rect.top,
              width: rect.width,
              height: rect.height
            };
          }
          currentPos += nodeLength;
        }
        return null;
      }, finding.excerpt);
    }
    
    if (position) {
      positions.push({
        findingId: finding.id,
        clauseId: finding.clauseId,
        page,
        ...position
      });
    } else {
      // Fallback to clause-level position
      console.warn(`Using clause-level position for finding ${finding.id}`);
      // Use clause position as fallback
    }
  }
  
  return positions;
}
```

---

## HTML Sanitization

### Purpose

Prevent XSS attacks and ensure safe HTML rendering.

### Implementation

```typescript
import DOMPurify from 'isomorphic-dompurify';

function sanitizeHTML(html: string): string {
  return DOMPurify.sanitize(html, {
    // Allow safe tags
    ALLOWED_TAGS: [
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'p', 'div', 'span', 'br', 'hr',
      'strong', 'em', 'u', 'i', 'b',
      'ul', 'ol', 'li',
      'table', 'thead', 'tbody', 'tr', 'th', 'td',
      'img', 'a'
    ],
    
    // Allow safe attributes
    ALLOWED_ATTR: [
      'class', 'id', 'style',
      'data-clause-id', 'data-clause-number', 'data-finding-id',
      'data-page', 'data-position',
      'href', 'src', 'alt', 'title'
    ],
    
    // Allow data URIs for images
    ALLOWED_URI_REGEXP: /^data:image\/(png|jpg|jpeg|gif|svg\+xml);base64,/,
    
    // Keep HTML structure
    KEEP_CONTENT: true,
    
    // Return as string
    RETURN_DOM: false,
    RETURN_DOM_FRAGMENT: false
  });
}
```

---

## Error Handling

### Retry Logic

```typescript
async function convertWithRetry(
  fileBuffer: Buffer,
  format: 'word' | 'pdf',
  maxRetries: number = 3
): Promise<string> {
  let lastError: Error;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      if (format === 'word') {
        const { html } = await convertWordToHTML(fileBuffer);
        return html;
      } else {
        const { html } = await convertPDFToHTML(fileBuffer);
        return html;
      }
    } catch (error) {
      lastError = error;
      console.error(`Conversion attempt ${attempt} failed:`, error);
      
      // Wait before retry (exponential backoff)
      if (attempt < maxRetries) {
        await sleep(Math.pow(2, attempt) * 1000);
      }
    }
  }
  
  throw new Error(`Conversion failed after ${maxRetries} attempts: ${lastError.message}`);
}
```

### Fallback Strategies

1. **Text Extraction Only**: If full conversion fails, extract plain text
2. **PDF Rendering**: For PDF, render to images as last resort
3. **Manual Upload**: Prompt user to upload pre-converted HTML

### Conversion Failures

```typescript
async function handleConversionFailure(
  documentId: string,
  error: Error
): Promise<void> {
  // Update document status
  await db.contractDocument.update({
    where: { id: documentId },
    data: {
      conversionStatus: 'failed',
      conversionError: error.message
    }
  });
  
  // Log for monitoring
  logger.error('Document conversion failed', {
    documentId,
    error: error.message,
    stack: error.stack
  });
  
  // Notify user
  await notifyUser({
    type: 'conversion_failed',
    documentId,
    message: 'Document conversion failed. Please try uploading a different format or contact support.'
  });
}
```

---

## Performance Optimization

### Async Processing

```typescript
// Queue conversion job
import Bull from 'bull';

const conversionQueue = new Bull('document-conversion', {
  redis: process.env.REDIS_URL
});

conversionQueue.process(async (job) => {
  const { documentId, fileBuffer, format } = job.data;
  
  try {
    // Perform conversion
    const html = await convertWithRetry(fileBuffer, format);
    
    // Sanitize
    const sanitized = sanitizeHTML(html);
    
    // Calculate positions
    const positions = await calculatePositions(documentId, sanitized);
    
    // Save to database
    await db.contractDocument.update({
      where: { id: documentId },
      data: {
        htmlContent: sanitized,
        clausePositions: JSON.stringify(positions.clausePositions),
        findingPositions: JSON.stringify(positions.findingPositions),
        conversionStatus: 'completed'
      }
    });
    
    return { success: true, documentId };
    
  } catch (error) {
    await handleConversionFailure(documentId, error);
    throw error;
  }
});
```

### Caching

- Cache converted HTML in Redis (5-minute TTL)
- Cache position calculations
- Reuse browser instances for position calculation

### Resource Management

- Limit concurrent conversions (max 5)
- Use timeouts (5 minutes per conversion)
- Clean up temporary files
- Release browser instances properly

---

## Testing

### Unit Tests

```typescript
describe('Word to HTML Conversion', () => {
  it('should convert Word document to HTML', async () => {
    const buffer = fs.readFileSync('test.docx');
    const { html } = await convertWordToHTML(buffer, 'test-id');
    expect(html).toContain('<p');
  });
  
  it('should preserve table formatting', async () => {
    // ...
  });
  
  it('should handle embedded images', async () => {
    // ...
  });
});

describe('PDF to HTML Conversion', () => {
  it('should convert PDF to HTML with positions', async () => {
    const buffer = fs.readFileSync('test.pdf');
    const { html, pageCount } = await convertPDFToHTML(buffer, 'test-id');
    expect(pageCount).toBeGreaterThan(0);
    expect(html).toContain('pdf-page');
  });
});

describe('Position Mapping', () => {
  it('should calculate clause positions', async () => {
    const positions = await calculatePositions('doc-id', sampleHTML);
    expect(positions.clausePositions).toHaveLength(10);
  });
});
```

### Integration Tests

- Upload Word file → Verify HTML conversion
- Upload PDF file → Verify HTML conversion
- Verify position accuracy (within 1 paragraph)
- Test retry logic on transient failures

---

## Monitoring

### Metrics

- Conversion success rate by format
- Average conversion time
- Position calculation accuracy
- Cache hit rate

### Alerts

- Conversion failure rate > 5%
- Average conversion time > 30s
- Queue backlog > 50 documents

## Related Documents

- [api-document-viewer.md](./api-document-viewer.md) - Document viewer API
- [research.md](../research.md) - Technology selection rationale
- [data-model.md](../data-model.md) - ContractDocument schema
