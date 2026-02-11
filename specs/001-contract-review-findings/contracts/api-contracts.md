# API Contracts: Contract Review — Clause List & Findings

**Branch**: `001-contract-review-findings` | **Date**: 2026-02-11

All endpoints are Next.js App Router API routes under `/api/contracts/`.

---

## POST /api/contracts/[id]/analyze

**Purpose**: Trigger contract analysis (existing, modified).
**Auth**: Session required.

### Changes from current behavior

- Prompt now requests structured JSON output (clauses + findings).
- Parser extracts structured data and persists to `AnalysisClause` and
  `AnalysisFinding` tables (in addition to legacy JSON fields).
- Stores `playbookSnapshotId` (FK to snapshot) instead of version string.
- If a previous analysis exists, deletes it (cascade deletes clauses +
  findings) before creating the new one.

### Request

```
POST /api/contracts/{id}/analyze
Content-Type: application/json
(no body required — contract and playbook loaded server-side)
```

### Response

SSE stream (unchanged transport):

```
data: {"type":"chunk","content":"..."}
data: {"type":"done","overallRisk":"high","greenCount":5,"yellowCount":8,"redCount":3,"clauseCount":16,"findingCount":22}
data: {"type":"error","message":"..."}
```

**New in `done` event**: `clauseCount` and `findingCount` added.

---

## GET /api/contracts/[id]

**Purpose**: Get contract with analysis, clauses, and findings (existing, modified).
**Auth**: Session required.

### Changes from current behavior

- Response now includes nested `analysis.clauses[].findings[]`.
- Each clause includes `findings` array with triage state.

### Response

```json
{
  "id": "cuid",
  "title": "string",
  "ourSide": "string",
  "status": "pending|analyzing|completed|error",
  "document": { "filename": "string", "extractedText": "string" },
  "analysis": {
    "id": "cuid",
    "overallRisk": "low|medium|high",
    "greenCount": 5,
    "yellowCount": 8,
    "redCount": 3,
    "finalized": false,
    "finalizedAt": null,
    "playbookSnapshotId": "cuid|null",
    "playbookVersion": 12,
    "currentPlaybookVersion": 14,
    "executiveSummary": "string",
    "negotiationStrategy": "string|null",
    "modelUsed": "string",
    "createdAt": "ISO8601",
    "clauses": [
      {
        "id": "cuid",
        "clauseName": "Limitation of Liability",
        "clauseText": "string (extracted contract text)",
        "position": 1,
        "findings": [
          {
            "id": "cuid",
            "riskLevel": "RED",
            "matchedRuleTitle": "Limitation of Liability",
            "summary": "Liability cap is set at 3 months of fees, below the 12-month standard.",
            "fallbackText": "The aggregate liability shall not exceed the total fees paid in the preceding twelve (12) months.",
            "whyTriggered": "Playbook rule requires minimum 12-month fee cap; contract specifies 3 months.",
            "triageDecision": null,
            "triageNote": null,
            "triagedBy": null,
            "triagedAt": null
          }
        ]
      }
    ]
  }
}
```

---

## PATCH /api/contracts/[id]/findings

**Purpose**: Update triage decisions on one or more findings.
**Auth**: Session required.

### Request

```json
{
  "decisions": [
    {
      "findingId": "cuid",
      "triageDecision": "ACCEPT|NEEDS_REVIEW|REJECT",
      "triageNote": "optional note"
    }
  ]
}
```

### Response

```json
{
  "updated": 3,
  "findings": [
    {
      "id": "cuid",
      "triageDecision": "ACCEPT",
      "triageNote": "Acceptable for this deal size.",
      "triagedBy": "cuid (user ID from session)",
      "triagedAt": "ISO8601"
    }
  ]
}
```

### Errors

| Status | Condition |
|--------|-----------|
| 400 | Invalid `triageDecision` value |
| 403 | Analysis is finalized (`finalized: true`) |
| 404 | Finding not found or doesn't belong to this contract |

---

## POST /api/contracts/[id]/finalize

**Purpose**: Lock all triage decisions for the analysis.
**Auth**: Session required.

### Request

```
POST /api/contracts/{id}/finalize
(no body required)
```

### Response

```json
{
  "finalized": true,
  "finalizedAt": "ISO8601",
  "totalFindings": 22,
  "triaged": 22,
  "pending": 0
}
```

### Errors

| Status | Condition |
|--------|-----------|
| 400 | No analysis exists for this contract |
| 400 | Analysis already finalized |
| 400 | Some findings still have `triageDecision: null` (all must be triaged before finalizing) |

---

## GET /api/contracts/[id]/export?format=csv|pdf

**Purpose**: Export findings as CSV or PDF.
**Auth**: Session required.

### Query Parameters

| Param | Required | Values | Description |
|-------|----------|--------|-------------|
| `format` | Yes | `csv` or `pdf` | Export format |

### Response — CSV

```
Content-Type: text/csv
Content-Disposition: attachment; filename="contract-findings-{title}.csv"
```

CSV columns:
```
Clause,Position,Risk Level,Matched Rule,Summary,Fallback Text,Decision,Note
```

### Response — PDF

```
Content-Type: application/pdf
Content-Disposition: attachment; filename="contract-findings-{title}.pdf"
```

PDF structure:
- Cover page: contract title, analysis date, playbook version, overall risk
- Summary statistics: GREEN/YELLOW/RED counts, triage counts
- Findings table: clause name, risk level, matched rule, summary, decision

### Errors

| Status | Condition |
|--------|-----------|
| 400 | Invalid or missing `format` parameter |
| 404 | No analysis exists for this contract |
