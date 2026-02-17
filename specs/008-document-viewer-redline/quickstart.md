# Quickstart Guide: Interactive Document Viewer & Redline Export

**Feature**: 008-document-viewer-redline  
**Date**: 2026-02-17  
**Prerequisites**: Node.js 18+, Prisma, Next.js development environment

## Overview

This guide will help you set up and integrate the document viewer feature into the Legal AI Analyzer. Follow these steps to add document conversion, interactive viewing, and redline export capabilities.

## Setup (30 minutes)

### 1. Install Dependencies

```bash
# Document conversion libraries
npm install mammoth pdfjs-dist

# Document export libraries
npm install docx puppeteer

# Virtualized scrolling
npm install react-window

# HTML sanitization
npm install isomorphic-dompurify

# Type definitions
npm install --save-dev @types/react-window
```

### 2. Install Puppeteer Dependencies (for PDF export)

**Linux**:
```bash
# Ubuntu/Debian
sudo apt-get install -y \
  chromium-browser \
  ca-certificates \
  fonts-liberation \
  libappindicator3-1 \
  libasound2 \
  libatk-bridge2.0-0 \
  libatk1.0-0 \
  libc6 \
  libcairo2 \
  libcups2 \
  libdbus-1-3 \
  libexpat1 \
  libfontconfig1 \
  libgbm1 \
  libgcc1 \
  libglib2.0-0 \
  libgtk-3-0 \
  libnspr4 \
  libnss3 \
  libpango-1.0-0 \
  libpangocairo-1.0-0 \
  libstdc++6 \
  libx11-6 \
  libx11-xcb1 \
  libxcb1 \
  libxcomposite1 \
  libxcursor1 \
  libxdamage1 \
  libxext6 \
  libxfixes3 \
  libxi6 \
  libxrandr2 \
  libxrender1 \
  libxss1 \
  libxtst6 \
  lsb-release \
  wget \
  xdg-utils
```

**Windows**: No additional dependencies required

**macOS**: No additional dependencies required

### 3. Run Database Migration

```bash
# Generate migration
npx prisma migrate dev --name add-contract-document

# The migration script is auto-generated from schema changes
# If you need to customize it, edit the migration file before applying

# Alternatively, for development:
npx prisma db push
npx prisma generate
```

**Migration Script** (auto-generated):
```sql
-- CreateTable
CREATE TABLE "ContractDocument" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "contractId" TEXT NOT NULL,
    "originalPdfPath" TEXT NOT NULL,
    "htmlContent" TEXT,
    "pageCount" INTEGER NOT NULL,
    "clausePositions" TEXT NOT NULL DEFAULT '[]',
    "findingPositions" TEXT NOT NULL DEFAULT '[]',
    "conversionStatus" TEXT NOT NULL DEFAULT 'pending',
    "conversionError" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ContractDocument_contractId_fkey" 
      FOREIGN KEY ("contractId") REFERENCES "Contract" ("id") 
      ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "ContractDocument_contractId_key" 
  ON "ContractDocument"("contractId");

CREATE INDEX "ContractDocument_conversionStatus_idx" 
  ON "ContractDocument"("conversionStatus");

CREATE INDEX "ContractDocument_createdAt_idx" 
  ON "ContractDocument"("createdAt");
```

### 4. Set Up Environment Variables (Optional)

Add to `.env.local`:

```bash
# PDF Worker (if needed)
NEXT_PUBLIC_PDF_WORKER_SRC=/pdf.worker.js

# Puppeteer Configuration (for PDF export)
PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=false
PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser  # Linux only

# Conversion Settings
MAX_DOCUMENT_SIZE_MB=50
CONVERSION_TIMEOUT_MS=300000  # 5 minutes

# Export Settings
EXPORT_TIMEOUT_MS=30000  # 30 seconds
MAX_CONCURRENT_EXPORTS=5
```

### 5. Copy PDF.js Worker

```bash
# Copy pdf.worker.js to public directory
cp node_modules/pdfjs-dist/build/pdf.worker.js public/
```

## Integration Points

### 1. Modify Analysis Workflow

**File**: `src/app/api/contracts/[id]/analyze/route.ts`

Add document conversion to the analysis process:

```typescript
import { convertDocument } from '@/lib/document-converter';
import { calculatePositions } from '@/lib/position-mapper';

// In your POST handler, after AI analysis completes:

// 1. Create ContractDocument record
const contractDocument = await db.contractDocument.create({
  data: {
    contractId: contract.id,
    originalPdfPath: contract.document.filename,
    pageCount: 0, // Will be updated after conversion
    conversionStatus: 'processing'
  }
});

// 2. Trigger document conversion (async)
try {
  const { html, pageCount } = await convertDocument({
    fileBuffer: documentBuffer,
    format: detectFormat(contract.document.filename), // 'word' or 'pdf'
    contractId: contract.id
  });
  
  // 3. Calculate position mappings
  const { clausePositions, findingPositions } = await calculatePositions({
    html,
    documentId: contractDocument.id,
    clauses: analysis.clauses,
    findings: allFindings
  });
  
  // 4. Update ContractDocument
  await db.contractDocument.update({
    where: { id: contractDocument.id },
    data: {
      htmlContent: html,
      pageCount,
      clausePositions: JSON.stringify(clausePositions),
      findingPositions: JSON.stringify(findingPositions),
      conversionStatus: 'completed'
    }
  });
  
} catch (error) {
  // Handle conversion failure
  await db.contractDocument.update({
    where: { id: contractDocument.id },
    data: {
      conversionStatus: 'failed',
      conversionError: error.message
    }
  });
  
  console.error('Document conversion failed:', error);
  // Continue with analysis - viewer will show error state
}
```

### 2. Create Document Viewer Components

**File**: `src/app/(app)/contracts/[id]/_components/document-viewer/document-viewer.tsx`

Create the main document viewer component (see implementation in `src/` after Phase 1 tasks).

### 3. Integrate into Contract Detail Page

**File**: `src/app/(app)/contracts/[id]/page.tsx`

Replace the current center panel with the document viewer:

```typescript
import { DocumentViewer } from './_components/document-viewer/document-viewer';

// In your component:
const [documentData, setDocumentData] = useState(null);

// Fetch document on mount
useEffect(() => {
  async function loadDocument() {
    const response = await fetch(`/api/contracts/${params.id}/document`);
    if (response.ok) {
      const data = await response.json();
      setDocumentData(data);
    }
  }
  
  if (contract?.analysis?.status === 'completed') {
    loadDocument();
  }
}, [params.id, contract?.analysis?.status]);

// Render
{documentData ? (
  <DocumentViewer
    document={documentData.document}
    selectedClauseId={selectedClauseId}
    onClauseClick={setSelectedClauseId}
    onFindingClick={handleFindingClick}
  />
) : (
  <ClauseText clause={selectedClause} />  // Fallback to old view
)}
```

### 4. Add Export Button

**File**: `src/app/(app)/contracts/[id]/_components/contract-header.tsx`

Add the export button to the contract header:

```typescript
import { RedlineExportModal } from './_components/redline-export-modal';

// In your component:
const [isExportModalOpen, setIsExportModalOpen] = useState(false);

<Button
  variant="outline"
  onClick={() => setIsExportModalOpen(true)}
  disabled={!contract?.analysis || contract.analysis.status !== 'completed'}
>
  <Download className="h-4 w-4 mr-2" />
  Export Redline
</Button>

<RedlineExportModal
  isOpen={isExportModalOpen}
  onClose={() => setIsExportModalOpen(false)}
  contractId={contract.id}
  contractTitle={contract.title}
/>
```

## Testing

### Manual Testing Checklist

#### Document Conversion

1. **Upload Word Document**:
   ```
   - [ ] Upload a .docx file
   - [ ] Verify analysis completes
   - [ ] Check ContractDocument created
   - [ ] Verify HTML content stored
   - [ ] Verify position mappings calculated
   ```

2. **Upload PDF Document**:
   ```
   - [ ] Upload a .pdf file
   - [ ] Verify analysis completes
   - [ ] Check ContractDocument created
   - [ ] Verify HTML content stored
   - [ ] Verify position mappings calculated
   ```

3. **Test Various Document Sizes**:
   ```
   - [ ] 1-page document
   - [ ] 10-page document
   - [ ] 50-page document
   - [ ] 200-page document
   ```

#### Document Viewer

1. **Basic Rendering**:
   ```
   - [ ] Document renders without errors
   - [ ] Text is readable
   - [ ] Images display correctly
   - [ ] Tables format properly
   ```

2. **Finding Highlights**:
   ```
   - [ ] High-risk findings show red highlight
   - [ ] Medium-risk findings show yellow highlight
   - [ ] Low-risk findings show green highlight
   - [ ] Tooltips appear on hover
   - [ ] Clicking highlight opens findings panel
   ```

3. **Navigation**:
   ```
   - [ ] Click clause in left panel → document scrolls
   - [ ] Manual scroll → clause list updates
   - [ ] Next/Previous finding buttons work
   - [ ] Keyboard shortcuts work (Ctrl+↓/↑)
   ```

4. **Tracked Changes**:
   ```
   - [ ] Toggle "Show Tracked Changes" works
   - [ ] Deletions show red strikethrough
   - [ ] Insertions show blue underline
   - [ ] Change tooltips show user and date
   - [ ] Changes appear at correct positions
   ```

#### Export

1. **Word Export**:
   ```
   - [ ] Export button enabled after analysis
   - [ ] Modal opens with Word selected by default
   - [ ] Export generates successfully
   - [ ] Download starts automatically
   - [ ] File opens in Microsoft Word
   - [ ] Track Changes are visible
   - [ ] Changes attributed to correct users
   - [ ] Metadata is correct
   ```

2. **PDF Export**:
   ```
   - [ ] Select PDF format in modal
   - [ ] Export generates successfully
   - [ ] Download starts automatically
   - [ ] File opens in PDF reader
   - [ ] Visual markup is visible
   - [ ] Metadata is correct
   ```

### Test Data

**Sample Contracts**:
- `test-contracts/simple-nda.docx` (1 page, 5 clauses)
- `test-contracts/medium-contract.docx` (20 pages, 30 clauses)
- `test-contracts/large-contract.pdf` (100 pages, 80 clauses)

**Test Scenarios**:
1. Contract with no findings (should render without highlights)
2. Contract with all risk levels (red, yellow, green)
3. Contract with multiple decisions per clause
4. Contract with escalated findings

## Troubleshooting

### Conversion Fails

**Symptom**: `conversionStatus` = 'failed'

**Solutions**:
1. Check conversion error message in `conversionError` field
2. Verify document format is supported (.docx or .pdf)
3. Try converting document manually to verify it's valid
4. Check server logs for detailed error stack
5. Increase conversion timeout if needed
6. Verify mammoth/pdf.js dependencies installed correctly

### Position Mappings Inaccurate

**Symptom**: Highlights appear in wrong locations

**Solutions**:
1. Verify clause/finding IDs in position JSON match database
2. Check HTML has correct data attributes (`data-clause-id`)
3. Recalculate positions by re-running analysis
4. Verify viewport size used for position calculation
5. Check for dynamic content that changes after measurement

### Export Fails

**Symptom**: Export button works but download fails

**Solutions**:
1. Check export timeout settings
2. Verify Puppeteer installed correctly (for PDF)
3. Check disk space for temporary files
4. Verify user has permissions for the contract
5. Check rate limiting (max exports per user/hour)
6. Review server logs for detailed error

### Virtualized Scrolling Laggy

**Symptom**: Slow scrolling or janky performance

**Solutions**:
1. Verify `react-window` installed correctly
2. Check item height calculations are cached
3. Reduce `overscanCount` if too high
4. Optimize HTML structure (reduce nested divs)
5. Enable GPU acceleration in browser
6. Profile with React DevTools Profiler

## Performance Tips

1. **Optimize Images**: Convert large images to smaller sizes during conversion
2. **Lazy Load**: Only load document when user switches to document view
3. **Cache Aggressively**: Use Redis for HTML content caching
4. **Debounce Scroll**: Already implemented (200-300ms), verify it's working
5. **Progressive Rendering**: Load first page immediately, rest progressively

## Next Steps

1. ✅ Complete setup and integration
2. ⏭️ Test with real contract documents
3. ⏭️ Monitor conversion success rates
4. ⏭️ Optimize performance based on metrics
5. ⏭️ Implement data retention cleanup job

## Resources

- [Feature Spec](./spec.md) - Full feature specification
- [Research](./research.md) - Technology selection rationale
- [Data Model](./data-model.md) - Database schema details
- [API Contracts](./contracts/) - Endpoint specifications
- [Implementation Plan](./plan.md) - Overall technical plan

## Support

For issues or questions:
1. Check server logs first
2. Review error messages in database
3. Consult troubleshooting section above
4. Check mammoth/pdf.js/puppeteer documentation
5. Review Feature 005 (locationPage/locationPosition metadata)
6. Review Feature 006/007 (decision projection system)

## Common Errors

### "Document conversion not completed"

**Cause**: Trying to view document before conversion finishes

**Fix**: Wait for `conversionStatus` to be 'completed', or show loading state

### "Position not found for clause X"

**Cause**: Clause text not found in HTML during position calculation

**Fix**: Verify clause text exists, use text matching fallback

### "Export generation timed out"

**Cause**: Export takes longer than 30-second timeout

**Fix**: Increase timeout for large documents, or optimize export generation

### "Puppeteer failed to launch"

**Cause**: Missing Chromium dependencies (Linux)

**Fix**: Install dependencies listed in Setup section

## Feature Flags (Optional)

If you want to gradually roll out:

```typescript
// .env.local
FEATURE_DOCUMENT_VIEWER_ENABLED=true
FEATURE_REDLINE_EXPORT_ENABLED=true

// Usage
const isDocumentViewerEnabled = process.env.FEATURE_DOCUMENT_VIEWER_ENABLED === 'true';

{isDocumentViewerEnabled && documentData ? (
  <DocumentViewer {...props} />
) : (
  <ClauseText clause={selectedClause} />  // Fallback
)}
```

## Monitoring (Production)

Set up monitoring for:
- Conversion success rate (target: > 95%)
- Average conversion time (target: < 30s)
- Export success rate (target: > 95%)
- API response times (target: p95 < 3s)
- Cache hit rate (target: > 70%)

Use existing logging infrastructure to track these metrics.
