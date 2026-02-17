# API Contract: Document Export (Redline)

**Feature**: 008-document-viewer-redline  
**Date**: 2026-02-17  
**Purpose**: Export redlined contract documents with tracked changes in Word or PDF format

## Endpoints

### POST /api/contracts/[id]/export-redline

**Purpose**: Generate and download a redlined document with all tracked changes

**Authentication**: Required (session-based)

**Authorization**: User must have `REVIEW_CONTRACTS` permission and access to the contract

**Request**

- **Path Parameters**:
  - `id` (string, required): Contract ID

- **Body** (JSON):
  ```typescript
  {
    format: 'docx' | 'pdf';     // Export format (defaults to 'docx')
  }
  ```

**Response (200 OK)**

- **Content-Type**: 
  - `application/vnd.openxmlformats-officedocument.wordprocessingml.document` (for Word)
  - `application/pdf` (for PDF)

- **Headers**:
  ```
  Content-Disposition: attachment; filename="Contract_Title_Redline_2026-02-17.docx"
  Content-Length: <file-size>
  ```

- **Body**: Binary file data (Word or PDF document)

**Response (400 Bad Request)**

```json
{
  "success": false,
  "error": "Contract analysis not completed",
  "details": "Cannot export redline before analysis is complete"
}
```

```json
{
  "success": false,
  "error": "Document conversion not completed",
  "details": "Original document must be converted to HTML before export"
}
```

```json
{
  "success": false,
  "error": "Invalid format",
  "details": "Format must be 'docx' or 'pdf'"
}
```

**Response (404 Not Found)**

```json
{
  "success": false,
  "error": "Contract not found"
}
```

**Response (401 Unauthorized)**

```json
{
  "success": false,
  "error": "Authentication required"
}
```

**Response (403 Forbidden)**

```json
{
  "success": false,
  "error": "Insufficient permissions to export this contract"
}
```

**Response (500 Internal Server Error)**

```json
{
  "success": false,
  "error": "Export generation failed",
  "details": "Failed to generate Word document: <error>"
}
```

**Response (503 Service Unavailable)**

```json
{
  "success": false,
  "error": "Export service temporarily unavailable",
  "details": "Too many concurrent exports. Please try again in a moment."
}
```

**Implementation Notes**:

1. Verify authentication and permissions
2. Fetch contract with analysis, decisions, and document
3. Compute projection for all clauses (to get tracked changes)
4. Generate export based on format:
   - **Word (.docx)**: Use `docx` library with Track Changes
   - **PDF**: Render HTML with change markup, convert via Puppeteer
5. Add metadata (title, counterparty, export date, reviewer)
6. Stream file to client
7. Log export action for audit trail

**Export Workflow**:

```
1. Validate request and permissions
   ↓
2. Fetch contract data
   - ContractDocument (HTML)
   - ContractAnalysis (clauses, findings)
   - ClauseDecisions (for all clauses)
   ↓
3. Compute projections for all clauses
   - Get tracked changes per clause
   - Include user attribution
   ↓
4. Generate document
   - Format: Word → Use docx library
   - Format: PDF → Render HTML → Puppeteer
   ↓
5. Add metadata
   - Title, counterparty
   - Export date, reviewer
   - Change attribution
   ↓
6. Write to temporary file
   ↓
7. Stream to client
   ↓
8. Clean up temporary file
```

**Performance Considerations**:

- Generate exports on-demand (don't pre-generate)
- Use temporary file storage and cleanup after download
- Stream large files instead of loading into memory
- Set 30-second timeout for export generation
- Limit concurrent exports (max 5 per user, 20 system-wide)

**Security Considerations**:

- Verify user has permission to export contract
- Include watermark if contract not finalized (optional)
- Audit log all export actions
- Rate limit exports (max 10 per hour per user)
- Sanitize filename to prevent path traversal

**Word Export Format** (Track Changes):

```typescript
// Deletion
new TextRun({
  text: "Original text to be deleted",
  revision: {
    id: 1,
    author: "John Doe",
    date: new Date("2026-02-15"),
    type: "delete"
  },
  strike: true,
  color: "FF0000"  // Red
})

// Insertion
new TextRun({
  text: "Replacement text",
  revision: {
    id: 2,
    author: "John Doe",
    date: new Date("2026-02-15"),
    type: "insert"
  },
  underline: { type: UnderlineType.SINGLE },
  color: "0000FF"  // Blue
})
```

**PDF Export Format** (Visual Markup):

```html
<!-- Deletion -->
<del style="color: #ff0000; text-decoration: line-through;">
  Original text to be deleted
</del>

<!-- Insertion -->
<ins style="color: #0000ff; text-decoration: underline;">
  Replacement text
</ins>

<!-- Attribution (tooltip) -->
<span title="Edited by John Doe on 2026-02-15 14:30">
  <ins>Replacement text</ins>
</span>
```

**Metadata Embedding**:

- **Word**: Document properties (Title, Author, Subject, Comments)
- **PDF**: PDF metadata (Title, Author, Subject, Keywords, Producer)

```typescript
// Word metadata
doc.core.properties = {
  title: contractTitle,
  subject: `Redline Export - ${counterparty}`,
  creator: reviewerName,
  keywords: "contract, redline, negotiation",
  description: `Exported on ${exportDate}`,
  lastModifiedBy: reviewerName,
  revision: "1"
};

// PDF metadata (Puppeteer)
await page.pdf({
  // ...other options...
  metadata: {
    title: contractTitle,
    author: reviewerName,
    subject: `Redline Export - ${counterparty}`,
    keywords: "contract, redline, negotiation",
    producer: "Legal AI Analyzer"
  }
});
```

**Example Usage**:

```typescript
// Client-side request (Word format)
const response = await fetch(`/api/contracts/${contractId}/export-redline`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ format: 'docx' })
});

if (response.ok) {
  const blob = await response.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Contract_Redline_${contractId}.docx`;
  document.body.appendChild(a);
  a.click();
  window.URL.revokeObjectURL(url);
  document.body.removeChild(a);
}
```

---

## Export Formats

### Word (.docx) - Default

**Advantages**:
- Native Track Changes support
- Counterparties can accept/reject changes
- Full compatibility with Microsoft Word
- Change attribution built-in

**Structure**:
```
Document
├── Title page (optional)
│   ├── Contract title
│   ├── Counterparty
│   └── Export date
├── Body
│   ├── Original text (no changes)
│   ├── Modified clauses (with Track Changes)
│   │   ├── Deletions (strikethrough, red, author)
│   │   └── Insertions (underline, blue, author)
│   └── Accepted deviations (no markup)
└── Footer
    └── Page numbers
```

**Change Attribution**:
- Each change includes author name
- Timestamp for each modification
- Comment bubbles for escalation reasons (optional)

### PDF - Alternative

**Advantages**:
- Read-only format (prevents modification)
- Consistent rendering across platforms
- Suitable for archival

**Structure**:
```
PDF Document
├── Header
│   ├── Contract title
│   ├── Counterparty
│   └── Export date
├── Body
│   ├── Original text (no changes)
│   ├── Modified clauses (with visual markup)
│   │   ├── Deletions (red strikethrough)
│   │   └── Insertions (blue underline)
│   └── Accepted deviations (no markup)
├── Legend (first page or footer)
│   ├── Red strikethrough = Deletion
│   ├── Blue underline = Insertion
│   └── Attribution in tooltips/annotations
└── Footer
    └── Page numbers
```

**Change Attribution**:
- PDF annotations for each change
- Author and date in annotation properties
- Visible in Adobe Reader comment panel

---

## Data Flow

```
1. User clicks "Export Redline" button
   ↓
2. Select format (Word/PDF) in modal
   ↓
3. POST /api/contracts/[id]/export-redline
   ↓
4. Backend fetches data
   - Contract metadata
   - HTML document
   - All clause decisions
   ↓
5. Compute projections for tracked changes
   ↓
6. Generate document (Word or PDF)
   ↓
7. Stream file to browser
   ↓
8. Browser downloads file
   ↓
9. Log export action
```

## Error States

| Scenario | HTTP Status | Error Message |
|----------|-------------|---------------|
| Contract not found | 404 | Contract not found |
| Analysis not completed | 400 | Contract analysis not completed |
| Document not converted | 400 | Document conversion not completed |
| Invalid format | 400 | Invalid format (must be 'docx' or 'pdf') |
| Unauthorized | 401 | Authentication required |
| Insufficient permissions | 403 | Insufficient permissions |
| Export generation failed | 500 | Export generation failed |
| Too many concurrent exports | 503 | Service temporarily unavailable |
| Export timeout | 504 | Export generation timed out |

## Rate Limiting

**Per User**:
- Max 10 exports per hour
- Max 5 concurrent exports

**System-wide**:
- Max 20 concurrent exports
- Max 100 exports per hour

**Exceeded Limits**:
```json
{
  "success": false,
  "error": "Rate limit exceeded",
  "retryAfter": 600  // seconds
}
```

## Testing Checklist

### Unit Tests

- [ ] Generate Word document with Track Changes
- [ ] Generate PDF with visual markup
- [ ] Validate metadata embedding
- [ ] Test change attribution logic
- [ ] Handle missing decisions gracefully

### Integration Tests

- [ ] Export contract with no changes (should work)
- [ ] Export contract with all change types (accept, fallback, edit)
- [ ] Export with multiple users' changes
- [ ] Verify Word opens correctly in Microsoft Word
- [ ] Verify PDF displays changes correctly
- [ ] Test with documents of various sizes (1, 50, 200 pages)
- [ ] Verify rate limiting works
- [ ] Test concurrent export limits

### End-to-End Tests

- [ ] Make decisions → Export Word → Verify changes in Word
- [ ] Make decisions → Export PDF → Verify changes in PDF
- [ ] Verify metadata is correct
- [ ] Test download workflow in browser
- [ ] Verify audit log entry created

## Performance Targets

| Metric | Target |
|--------|--------|
| Export generation (50 pages, Word) | < 10s |
| Export generation (50 pages, PDF) | < 15s |
| Export generation (200 pages, Word) | < 30s |
| Export generation (200 pages, PDF) | < 30s |
| Memory usage per export | < 500MB |

## Monitoring

### Metrics to Track

- Export generation time by format and document size
- Export success rate
- Export error rate by error type
- Concurrent exports (current count)
- Rate limit violations

### Alerts

- Export failure rate > 5%
- Average export time > 1 minute
- Concurrent exports > 18 (near limit)
- Memory usage per export > 800MB

### Audit Log

Each export should log:
```typescript
{
  action: 'export_redline',
  userId: string,
  contractId: string,
  format: 'docx' | 'pdf',
  timestamp: Date,
  fileSize: number,
  generationTime: number,  // milliseconds
  success: boolean,
  error?: string
}
```

## Related Endpoints

- `GET /api/contracts/[id]` - Contract details (existing)
- `GET /api/contracts/[id]/document` - Fetch document for viewing (new, see api-document-viewer.md)
- `GET /api/clauses/[id]/projection` - Get clause decision state (existing, Feature 006/007)
- `GET /api/clauses/[id]/decisions` - Get decision history (existing, Feature 006/007)

## Future Enhancements

- **Selective Export**: Export only specific clauses or findings
- **Export Templates**: Custom export formats and styles
- **Batch Export**: Export multiple contracts at once
- **Email Export**: Send export directly to counterparty
- **Version Comparison**: Export showing diff between two versions
