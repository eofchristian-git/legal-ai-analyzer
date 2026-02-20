# API Contract: PDF Document & Position Mappings

**Feature**: 012-pdf-viewer-docx-export
**Endpoint**: `GET /api/contracts/[id]/pdf-document`

---

## Purpose

Serve the converted PDF file and its associated position mappings for the PDF viewer. Used at view time to render the document and enable clause navigation + risk highlight overlays.

---

## Request

```
GET /api/contracts/{contractId}/pdf-document
```

### Path Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `contractId` | string | Yes | The contract ID (cuid) |

### Query Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `dataOnly` | boolean | `false` | If `true`, returns only position mapping JSON (no PDF binary). Used for overlay refresh after triage actions. |

### Headers

| Header | Required | Description |
|--------|----------|-------------|
| `Cookie` (session) | Yes | Authenticated session via NextAuth |

---

## Response

### When `dataOnly=false` (default) — Full document load

**Content-Type**: `application/json`

```json
{
  "pdfUrl": "/api/contracts/{id}/pdf-document/file",
  "pageCount": 25,
  "conversionStatus": "completed",
  "clauseMappings": [
    {
      "clauseId": "clxyz123",
      "pageIndex": 0,
      "startRect": { "x": 72, "y": 120, "width": 468, "height": 14 },
      "confidence": 1.0,
      "unmapped": false
    }
  ],
  "findingMappings": [
    {
      "findingId": "fnd456",
      "clauseId": "clxyz123",
      "riskLevel": "RED",
      "pageIndex": 0,
      "rects": [
        { "x": 72, "y": 148, "width": 468, "height": 12 },
        { "x": 72, "y": 162, "width": 320, "height": 12 }
      ],
      "confidence": 0.95,
      "unmapped": false
    }
  ]
}
```

### When `dataOnly=true` — Position data only (no PDF URL)

Same JSON structure but `pdfUrl` omitted. Used when overlays need refreshing without reloading the PDF.

### When conversion pending

```json
{
  "conversionStatus": "converting",
  "pdfUrl": null,
  "clauseMappings": [],
  "findingMappings": []
}
```

### When conversion failed

```json
{
  "conversionStatus": "failed",
  "conversionError": "LibreOffice process exited with code 1",
  "pdfUrl": null,
  "clauseMappings": [],
  "findingMappings": []
}
```

---

## Sub-Endpoint: PDF File

```
GET /api/contracts/{contractId}/pdf-document/file
```

**Content-Type**: `application/pdf`
**Response**: Raw PDF binary stream

---

## Error Responses

| Status | Condition |
|--------|-----------|
| 401 | Not authenticated |
| 404 | Contract not found or no `ContractDocument` record |
| 500 | Internal error reading PDF or parsing mappings |

---

## Notes

- The PDF file itself is served separately (`/file` sub-route) to allow the browser to stream it directly into `pdfjs-dist` without base64 encoding.
- Position mappings are returned as JSON in the main response for the viewer to use immediately.
- When `pdfConversionStatus` is not `completed`, the viewer should fall back to a loading/error state.
