# API Contract: Export Modified Original DOCX

**Feature**: 012-pdf-viewer-docx-export
**Endpoint**: `GET /api/contracts/[id]/export-modified`

---

## Purpose

Export the **original uploaded DOCX** with all triage modifications injected as native Word Track Changes (`<w:del>/<w:ins>`) and Word Comments (`<w:comment>`). This replaces the previous reconstructed DOCX export (`/export-redline`).

---

## Request

```
GET /api/contracts/{contractId}/export-modified?format=docx
```

### Path Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `contractId` | string | Yes | The contract ID (cuid) |

### Query Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `format` | string | `docx` | Export format: `docx` (tracked changes) or `pdf` (annotated PDF — Phase 5) |

### Headers

| Header | Required | Description |
|--------|----------|-------------|
| `Cookie` (session) | Yes | Authenticated session via NextAuth |

---

## Response

### Success (format=docx)

**Content-Type**: `application/vnd.openxmlformats-officedocument.wordprocessingml.document`
**Content-Disposition**: `attachment; filename="{original-filename}-reviewed.docx"`

**Body**: Binary DOCX file — the original uploaded document with:
- `<w:del>` elements wrapping original excerpt text (for each finding with `APPLY_FALLBACK` decision)
- `<w:ins>` elements containing replacement/fallback text
- Both attributed to `w:author="Legal AI Analyzer"` with `w:date` set to the decision timestamp
- `<w:comment>` entries in `word/comments.xml` containing:
  - Risk level indicator (e.g., "⚠ RED")
  - AI finding summary
  - Reviewer notes (if any)
- `<w:commentRangeStart/End>` anchoring comments to relevant clause text

### Success (format=pdf) — Phase 5

**Content-Type**: `application/pdf`
**Content-Disposition**: `attachment; filename="{original-filename}-reviewed.pdf"`

**Body**: The converted PDF with visual annotations (colored highlights, strikethrough, replacement text boxes, notes) baked in using `pdf-lib`.

### No changes made

If no triage decisions exist (no fallbacks, no notes), the original file is returned unmodified.

---

## Export Logic

### Tracked Changes (per finding with APPLY_FALLBACK)

For each finding where `computeProjection()` shows an applied fallback:

1. Find `finding.excerpt` text in `word/document.xml` `<w:t>` runs
2. Split runs at character boundaries of the matched excerpt
3. Wrap matched runs in `<w:del w:author="Legal AI Analyzer" w:date="{timestamp}">`
4. Replace `<w:t>` with `<w:delText>` inside the deletion
5. Insert `<w:ins w:author="Legal AI Analyzer" w:date="{timestamp}">` after the deletion
6. Copy original `<w:rPr>` (formatting) from the deleted runs to the insertion
7. Add `<w:t>{fallbackText}</w:t>` inside the insertion

### Word Comments (per finding with notes/summary)

For each finding:

1. Insert `<w:commentRangeStart w:id="{N}"/>` before the excerpt text
2. Insert `<w:commentRangeEnd w:id="{N}"/>` after the excerpt text
3. Add `<w:commentReference w:id="{N}"/>` run after the range end
4. Add `<w:comment>` to `word/comments.xml`:

```
⚠ {RISK_LEVEL}: {finding.summary}

{reviewer notes, if any}
```

---

## Error Responses

| Status | Condition |
|--------|-----------|
| 401 | Not authenticated |
| 404 | Contract not found or original DOCX file missing from disk |
| 422 | Original file is not a DOCX (e.g., PDF upload) |
| 500 | DOCX XML parsing or modification error |

---

## Notes

- This endpoint reads the **original uploaded file** from `Document.filePath` — not the Collabora-modified copy.
- If `format=pdf` is requested but the PDF conversion hasn't completed, returns 422 with a message.
- The exported DOCX opens in Microsoft Word with the Review tab showing all tracked changes and comments ready for Accept/Reject.
- Author name "Legal AI Analyzer" is hardcoded per spec clarification C3.
- Escalation reasons and playbook rule references are **not** included in comments per spec clarification C1.
