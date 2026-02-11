# API Contracts: Contract Review — Professional Legal UI/UX

**Feature**: 002-contract-review-ux  
**Date**: 2026-02-11

## Overview

This feature modifies three existing API endpoints. No new endpoints are created. All changes are backward-compatible additions to response payloads.

---

## Modified Endpoints

### 1. GET `/api/contracts/[id]` — Contract Detail

**Change**: Response now includes `negotiationItems` array and `excerpt` field on each finding.

#### Response Schema (additions only)

```typescript
interface ContractDetailResponse {
  // ... existing fields unchanged ...
  analysis: {
    // ... existing fields unchanged ...
    negotiationItems: NegotiationItemResponse[];  // NEW
    clauses: {
      // ... existing fields unchanged ...
      findings: {
        // ... existing fields unchanged ...
        excerpt: string;  // NEW — verbatim substring from clauseText
      }[];
    }[];
  } | null;
}

interface NegotiationItemResponse {
  id: string;
  priority: string;   // "P1" | "P2" | "P3"
  title: string;
  description: string;
  clauseRef: string | null;
  position: number;
}
```

#### Prisma Include Change

```typescript
analysis: {
  include: {
    // ... existing includes unchanged ...
    negotiationItems: {
      orderBy: { position: "asc" },
    },
  },
}
```

#### Backward Compatibility

- Existing clients that don't consume `negotiationItems` or `excerpt` are unaffected.
- `negotiationItems` is an empty array `[]` for legacy analyses.
- `excerpt` defaults to `""` for existing findings.

---

### 2. POST `/api/contracts/[id]/analyze` — Run Analysis

**Change**: Analysis pipeline now persists `excerpt` on each `AnalysisFinding` and creates `NegotiationItem` rows.

#### Request: Unchanged

```
POST /api/contracts/{id}/analyze
Authorization: session cookie
Body: (none)
```

#### Response: Unchanged shape

```json
{
  "success": true,
  "overallRisk": "high",
  "greenCount": 2,
  "yellowCount": 5,
  "redCount": 3,
  "clauseCount": 12,
  "findingCount": 10,
  "warning": "optional string"
}
```

#### Internal Changes

1. **Finding persistence**: Each `AnalysisFinding.create()` now includes `excerpt: finding.excerpt`.
2. **NegotiationItem persistence**: After clauses/findings, inside the same `$transaction`:
   ```typescript
   for (let i = 0; i < parsed.negotiationItems.length; i++) {
     await tx.negotiationItem.create({
       data: {
         analysisId: analysis.id,
         priority: item.priority,
         title: item.title,
         description: item.description,
         clauseRef: item.clauseRef || null,
         position: i + 1,
       },
     });
   }
   ```
3. **Legacy `negotiationStrategy` string**: Still stored for backward compat. If AI returns an array, the string field is set to `""`.

---

### 3. GET `/api/contracts/[id]/export?format=csv|pdf` — Export Findings

**Change**: Export data now includes `excerpt` column.

#### CSV Output Columns (updated)

| Column | Description |
|--------|-------------|
| Clause | Clause name |
| Position | Clause position |
| Risk Level | GREEN/YELLOW/RED |
| Matched Rule | Playbook rule title |
| Summary | Finding summary |
| Excerpt | Verbatim triggering text ← NEW |
| Fallback Text | Recommended alternative language |
| Decision | Triage decision or "Pending" |
| Note | Triage note |

#### PDF Output

Findings detail table gains an "Excerpt" column. Column widths adjusted to accommodate.

#### Backward Compatibility

- For legacy findings with empty `excerpt`, the column contains an empty string.

---

## Unchanged Endpoints

The following endpoints require **no changes** for this feature:

| Endpoint | Reason |
|----------|--------|
| PATCH `/api/contracts/[id]/findings` | Triage decisions — no excerpt/negotiation involvement |
| POST `/api/contracts/[id]/finalize` | Finalize triage — no excerpt/negotiation involvement |
| GET `/api/contracts/[id]/activity` | Activity logs — no new actions added |
| POST `/api/contracts/[id]/findings/[findingId]/comments` | Comments — no changes |
| GET `/api/contracts` | Contract list — no negotiation data needed |
| POST `/api/contracts` | Contract creation — no changes |
