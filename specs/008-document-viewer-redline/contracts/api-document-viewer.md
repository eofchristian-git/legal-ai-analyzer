# API Contract: Document Viewer

**Feature**: 008-document-viewer-redline  
**Date**: 2026-02-17  
**Purpose**: Endpoints for fetching contract document HTML and position data

## Endpoints

### GET /api/contracts/[id]/document

**Purpose**: Fetch HTML document and position mappings for rendering in document viewer

**Authentication**: Required (session-based)

**Authorization**: User must have `REVIEW_CONTRACTS` permission and access to the contract

**Request**

- **Path Parameters**:
  - `id` (string, required): Contract ID

- **Query Parameters**: None

**Response (200 OK)**

```typescript
{
  success: true;
  document: {
    id: string;
    htmlContent: string;           // Full HTML document
    pageCount: number;
    conversionStatus: 'completed' | 'processing' | 'pending' | 'failed';
    clausePositions: ClausePosition[];
    findingPositions: FindingPosition[];
  };
  contract: {
    id: string;
    title: string;
    status: string;
  };
}

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
```

**Response (404 Not Found)**

```json
{
  "success": false,
  "error": "Contract not found"
}
```

**Response (400 Bad Request)**

```json
{
  "success": false,
  "error": "Document conversion not completed yet",
  "conversionStatus": "processing"
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
  "error": "Insufficient permissions to view this contract"
}
```

**Implementation Notes**:

1. Check user authentication and permissions
2. Verify contract exists and user has access
3. Fetch ContractDocument with position data
4. Return 400 if conversionStatus !== 'completed'
5. Parse JSON position arrays before returning
6. Include cache headers for performance (ETags, Last-Modified)

**Performance Considerations**:

- Cache HTML content in Redis (5-minute TTL)
- Consider pagination or streaming for very large documents
- Compress response with gzip

**Security Considerations**:

- Sanitize HTML before serving (already done during conversion)
- Verify user has access to the specific contract
- Rate limit to prevent abuse (max 100 requests/minute per user)

**Example Usage**:

```typescript
// Client-side request
const response = await fetch(`/api/contracts/${contractId}/document`);
if (!response.ok) {
  throw new Error('Failed to load document');
}

const { document, contract } = await response.json();

// Render document
renderHTMLDocument(document.htmlContent, {
  clausePositions: document.clausePositions,
  findingPositions: document.findingPositions
});
```

---

### POST /api/documents/convert (Internal Use)

**Purpose**: Convert uploaded Word/PDF document to HTML during analysis phase

**Authentication**: Required (session-based)

**Authorization**: System use only (called from analysis workflow)

**Request**

- **Body** (multipart/form-data):
  ```typescript
  {
    file: File;              // Word or PDF document
    contractId: string;      // Associated contract ID
  }
  ```

**Response (200 OK)**

```typescript
{
  success: true;
  documentId: string;
  conversionStatus: 'processing';
  message: 'Document conversion started';
}
```

**Response (400 Bad Request)**

```json
{
  "success": false,
  "error": "Invalid file format. Only .docx and .pdf are supported"
}
```

**Response (413 Payload Too Large)**

```json
{
  "success": false,
  "error": "File size exceeds maximum limit of 50MB"
}
```

**Response (500 Internal Server Error)**

```json
{
  "success": false,
  "error": "Document conversion failed",
  "details": "Conversion library error message"
}
```

**Implementation Notes**:

1. Validate file type (MIME type and extension)
2. Validate file size (< 50MB)
3. Create ContractDocument with status='processing'
4. Queue conversion job (async)
5. Return immediately with processing status
6. Update status to 'completed' or 'failed' when done

**Conversion Workflow**:

```typescript
1. Upload file to temporary storage
2. Detect file format (Word vs PDF)
3. Convert to HTML using appropriate library
   - Word: mammoth.js
   - PDF: pdf.js
4. Calculate position mappings for clauses/findings
5. Sanitize HTML (DOMPurify)
6. Store in ContractDocument
7. Clean up temporary files
8. Update conversionStatus
```

**Error Handling**:

- Conversion timeout: 5 minutes
- Retry on transient failures: Up to 3 attempts
- Log detailed error for debugging
- Store error message in conversionError field

**Security Considerations**:

- Scan uploaded files for malware
- Validate file content (not just extension)
- Use isolated environment for conversion
- Limit concurrent conversions to prevent resource exhaustion

**Example Usage**:

```typescript
// Called internally from analysis workflow
const formData = new FormData();
formData.append('file', documentFile);
formData.append('contractId', contractId);

const response = await fetch('/api/documents/convert', {
  method: 'POST',
  body: formData
});

const { documentId, conversionStatus } = await response.json();
// Poll or wait for conversionStatus to become 'completed'
```

---

## Data Flow

```
1. User uploads contract
   ↓
2. POST /api/documents/convert (internal)
   ↓
3. Conversion processing (async)
   - Word/PDF → HTML
   - Calculate positions
   - Store in database
   ↓
4. User opens contract detail page
   ↓
5. GET /api/contracts/[id]/document
   ↓
6. Document viewer renders HTML with highlights
```

## Error States

| Scenario | HTTP Status | Error Message |
|----------|-------------|---------------|
| Contract not found | 404 | Contract not found |
| No document associated | 404 | Document not found for this contract |
| Conversion pending | 400 | Document conversion in progress |
| Conversion failed | 400 | Document conversion failed: {error} |
| Unauthorized access | 401 | Authentication required |
| Insufficient permissions | 403 | Insufficient permissions |
| Invalid file format | 400 | Invalid file format |
| File too large | 413 | File size exceeds limit |

## Testing Checklist

### Unit Tests

- [ ] Parse position JSON correctly
- [ ] Validate file format and size
- [ ] Handle missing document gracefully

### Integration Tests

- [ ] Upload Word document and verify HTML conversion
- [ ] Upload PDF document and verify HTML conversion
- [ ] Verify position mappings are calculated correctly
- [ ] Test with documents of various sizes (1, 50, 200 pages)
- [ ] Verify permission checks work correctly
- [ ] Test conversion failure handling

### End-to-End Tests

- [ ] Upload contract → Analyze → View in document viewer
- [ ] Verify clause positions are accurate
- [ ] Verify finding highlights appear in correct locations
- [ ] Test scroll sync between clause list and document

## Performance Targets

| Metric | Target |
|--------|--------|
| Document fetch (cached) | < 100ms |
| Document fetch (uncached) | < 1s |
| Conversion (50 pages) | < 5s |
| Conversion (200 pages) | < 30s |
| Position calculation | < 1s |

## Monitoring

### Metrics to Track

- Document conversion success rate
- Average conversion time by document size
- API response times (p50, p95, p99)
- Cache hit rate
- Error rate by error type

### Alerts

- Conversion failure rate > 5%
- Average conversion time > 1 minute
- API response time p95 > 3 seconds
- Cache hit rate < 70%

## Related Endpoints

- `GET /api/contracts/[id]` - Contract details (existing)
- `GET /api/contracts/[id]/analyze` - Trigger analysis (existing, modified to include conversion)
- `GET /api/clauses/[id]/projection` - Get clause decision state (existing, Feature 006/007)
- `POST /api/contracts/[id]/export-redline` - Export redlined document (new, see api-document-export.md)
