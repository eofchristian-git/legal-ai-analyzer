# Data Model: Contract Review — Professional Legal UI/UX

**Feature**: 002-contract-review-ux  
**Date**: 2026-02-11

## Overview

This feature introduces one new entity (`NegotiationItem`) and extends one existing entity (`AnalysisFinding` with `excerpt` field). No other schema changes are required.

---

## New Entity: NegotiationItem

Represents a single negotiation priority point returned by the AI and persisted as an individual database row.

### Fields

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `id` | String (cuid) | ✅ PK | auto | Unique identifier |
| `analysisId` | String | ✅ FK | — | Foreign key to `ContractAnalysis.id` |
| `priority` | String | ✅ | — | Priority level: `"P1"`, `"P2"`, or `"P3"` |
| `title` | String | ✅ | — | Concise title for this negotiation point |
| `description` | String | ✅ | — | Detailed negotiation guidance text |
| `clauseRef` | String? | ❌ | null | Optional reference to a clause name or number |
| `position` | Int | ✅ | — | Sort order (1-based sequential) |
| `createdAt` | DateTime | ✅ | `now()` | Timestamp of creation |

### Relationships

| Relation | Target | Type | On Delete |
|----------|--------|------|-----------|
| `analysis` | `ContractAnalysis` | Many-to-One | Cascade |

### Prisma Schema

```prisma
model NegotiationItem {
  id          String           @id @default(cuid())
  analysisId  String
  analysis    ContractAnalysis @relation(fields: [analysisId], references: [id], onDelete: Cascade)
  priority    String           // "P1" | "P2" | "P3"
  title       String
  description String
  clauseRef   String?
  position    Int
  createdAt   DateTime         @default(now())
}
```

### Reverse Relation on ContractAnalysis

```prisma
model ContractAnalysis {
  // ... existing fields ...
  negotiationItems NegotiationItem[]
}
```

### Validation Rules

- `priority` MUST be one of: `"P1"`, `"P2"`, `"P3"`. If AI returns an unrecognized value, default to `"P3"`.
- `position` MUST be sequential starting at 1.
- `title` MUST be non-empty.
- `description` MUST be non-empty.
- `clauseRef` is optional; `null` when no specific clause is referenced.

### Lifecycle

- **Created**: During analysis pipeline, inside the `$transaction` after clauses and findings are persisted.
- **Read**: Included in GET `/api/contracts/[id]` response via Prisma `include`.
- **Deleted**: Cascade-deleted when parent `ContractAnalysis` is deleted (re-analysis or contract deletion).
- **No updates**: Negotiation items are write-once, read-many. No user edits.

---

## Modified Entity: AnalysisFinding (new field)

### New Field

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `excerpt` | String | ✅ | `""` | Verbatim substring from the clause text that triggered this finding. Used for inline highlighting in the clause text panel. |

### Prisma Change

```prisma
model AnalysisFinding {
  // ... existing fields ...
  excerpt          String         @default("")
  // ... remaining fields ...
}
```

### Validation Rules

- `excerpt` SHOULD be a verbatim substring of the parent clause's `clauseText`.
- Empty string `""` is valid (means no excerpt available — no highlight rendered).
- No maximum length constraint (Claude may return multi-sentence excerpts).

### Backward Compatibility

- The `@default("")` ensures existing rows migrate cleanly with an empty excerpt.
- Frontend handles empty excerpt gracefully (no highlighting attempted).

---

## Entity Relationship Diagram

```text
ContractAnalysis (1) ──< (N) AnalysisClause
ContractAnalysis (1) ──< (N) NegotiationItem  ← NEW
AnalysisClause   (1) ──< (N) AnalysisFinding  (excerpt field added)
AnalysisFinding  (1) ──< (N) FindingComment
```

---

## Migration Strategy

### SQL Changes

```sql
-- Add excerpt column to AnalysisFinding
ALTER TABLE "AnalysisFinding" ADD COLUMN "excerpt" TEXT NOT NULL DEFAULT '';

-- Create NegotiationItem table
CREATE TABLE "NegotiationItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "analysisId" TEXT NOT NULL,
    "priority" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "clauseRef" TEXT,
    "position" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "NegotiationItem_analysisId_fkey"
      FOREIGN KEY ("analysisId") REFERENCES "ContractAnalysis"("id")
      ON DELETE CASCADE ON UPDATE CASCADE
);

-- Index for fast lookup by analysis
CREATE INDEX "NegotiationItem_analysisId_idx" ON "NegotiationItem"("analysisId");
```

### Rollback

```sql
-- Remove NegotiationItem table
DROP TABLE IF EXISTS "NegotiationItem";

-- Remove excerpt column (SQLite requires table rebuild)
-- In practice, use Prisma's migration rollback
```

---

## AI Output Schema Changes

### Finding Object (existing, extended)

```json
{
  "riskLevel": "GREEN|YELLOW|RED",
  "matchedRuleTitle": "string",
  "summary": "string",
  "fallbackText": "string",
  "whyTriggered": "string",
  "excerpt": "string — verbatim substring from clauseText"
}
```

### Negotiation Strategy (changed from string to array)

```json
"negotiationStrategy": [
  {
    "priority": "P1|P2|P3",
    "title": "string",
    "description": "string",
    "clauseRef": "string|null"
  }
]
```

### Parser Handling

The parser MUST handle both formats:
- **Array** (new): Parse into `NegotiationItem[]`, store as rows.
- **String** (legacy/fallback): Store in `negotiationStrategy` text column, set `negotiationItems` to `[]`.
