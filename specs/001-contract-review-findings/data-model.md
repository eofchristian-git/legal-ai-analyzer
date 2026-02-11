# Data Model: Contract Review — Clause List & Findings

**Branch**: `001-contract-review-findings` | **Date**: 2026-02-11

## Overview

This feature adds two new models (`AnalysisClause`, `AnalysisFinding`)
and modifies the existing `ContractAnalysis` model. The new models
replace the current JSON-blob storage of clause data with proper
relational records, enabling per-clause navigation, per-finding triage,
and structured export.

## Entity Relationship Diagram

```text
Contract (existing)
  └── ContractAnalysis (existing, modified)
        ├── playbookSnapshotId → PlaybookSnapshot (new FK)
        ├── finalized (new field)
        └── AnalysisClause[] (new)
              └── AnalysisFinding[] (new)
```

## Model Changes

### ContractAnalysis (MODIFY existing)

Existing fields retained. New fields added:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `playbookSnapshotId` | String? | No | FK to PlaybookSnapshot used for analysis. Null if no playbook. |
| `finalized` | Boolean | Yes (default: false) | When true, all triage decisions are locked. |
| `finalizedAt` | DateTime? | No | Timestamp when triage was finalized. |

**Existing fields to deprecate** (keep for backward compat, stop writing):
- `clauseAnalyses` (String — JSON blob) → replaced by AnalysisClause records
- `redlineSuggestions` (String — JSON blob) → replaced by finding fallbackText

**Relation added**:
- `playbookSnapshot` → `PlaybookSnapshot` (optional, via `playbookSnapshotId`)
- `clauses` → `AnalysisClause[]`

### AnalysisClause (NEW)

Represents one identified clause segment from the contract text.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | String | Yes (cuid) | Primary key |
| `analysisId` | String | Yes | FK to ContractAnalysis |
| `clauseName` | String | Yes | Name/title of the clause (e.g., "Limitation of Liability") |
| `clauseText` | String | Yes | Extracted text from the contract for this clause |
| `position` | Int | Yes | Order in the document (1-based) |
| `createdAt` | DateTime | Yes (auto) | Record creation timestamp |

**Relations**:
- `analysis` → `ContractAnalysis` (via `analysisId`, onDelete: Cascade)
- `findings` → `AnalysisFinding[]`

**Indexes**:
- `(analysisId, position)` — unique compound index for ordering

### AnalysisFinding (NEW)

Represents one issue found in a clause, linked to a playbook rule.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | String | Yes (cuid) | Primary key |
| `clauseId` | String | Yes | FK to AnalysisClause |
| `riskLevel` | String | Yes | GREEN, YELLOW, or RED |
| `matchedRuleTitle` | String | Yes | Title of the playbook rule that triggered this finding |
| `matchedRuleId` | String? | No | FK to PlaybookSnapshotRule for traceability (null if standard review) |
| `summary` | String | Yes | Plain-language summary of the issue |
| `fallbackText` | String | Yes | Recommended alternative contract language |
| `whyTriggered` | String | Yes | Explanation of why this rule was triggered (FR-009) |
| `triageDecision` | String? | No | "ACCEPT", "NEEDS_REVIEW", "REJECT", or null (pending) |
| `triageNote` | String? | No | Optional reviewer note on the decision |
| `triagedBy` | String? | No | User ID of the reviewer who made/changed the triage decision |
| `triagedAt` | DateTime? | No | Timestamp of last triage decision change |
| `createdAt` | DateTime | Yes (auto) | Record creation timestamp |

**Relations**:
- `clause` → `AnalysisClause` (via `clauseId`, onDelete: Cascade)

**Validation rules**:
- `riskLevel` must be one of: GREEN, YELLOW, RED
- `triageDecision` must be one of: ACCEPT, NEEDS_REVIEW, REJECT, or null
- `triageDecision` cannot be changed if parent analysis `finalized` is true
- `triagedBy` must reference a valid User ID (populated from session on PATCH)

## State Transitions

### Analysis Record Lifecycle

```text
pending → analyzing → completed → finalized
                   ↘ error
```

- `pending`: Contract uploaded, not yet analyzed
- `analyzing`: Claude stream in progress
- `completed`: Analysis finished, triage in progress
- `finalized`: Triage locked (via Finalize action)
- `error`: Analysis failed (can retry → back to `analyzing`)

### Triage Decision Lifecycle

```text
null (pending) → ACCEPT | NEEDS_REVIEW | REJECT
                 ↕ (changeable while not finalized)
                 LOCKED (when analysis.finalized = true)
```

## Prisma Schema (proposed additions)

```prisma
model ContractAnalysis {
  // ... existing fields ...
  playbookSnapshotId String?
  playbookSnapshot   PlaybookSnapshot? @relation(fields: [playbookSnapshotId], references: [id])
  finalized          Boolean           @default(false)
  finalizedAt        DateTime?
  clauses            AnalysisClause[]
}

// Add reverse relation on existing model:
model PlaybookSnapshot {
  // ... existing fields ...
  analyses ContractAnalysis[]  // NEW: reverse relation for playbookSnapshotId FK
}

model AnalysisClause {
  id         String            @id @default(cuid())
  analysisId String
  analysis   ContractAnalysis  @relation(fields: [analysisId], references: [id], onDelete: Cascade)
  clauseName String
  clauseText String
  position   Int
  createdAt  DateTime          @default(now())
  findings   AnalysisFinding[]

  @@unique([analysisId, position])
}

model AnalysisFinding {
  id               String          @id @default(cuid())
  clauseId         String
  clause           AnalysisClause  @relation(fields: [clauseId], references: [id], onDelete: Cascade)
  riskLevel        String
  matchedRuleTitle String
  matchedRuleId    String?
  summary          String
  fallbackText     String
  whyTriggered     String
  triageDecision   String?
  triageNote       String?
  triagedBy        String?
  triagedAt        DateTime?
  createdAt        DateTime        @default(now())
}
```

## Migration Strategy

1. Add new models (`AnalysisClause`, `AnalysisFinding`) and new fields
   on `ContractAnalysis` via a Prisma migration.
2. Existing `ContractAnalysis` records retain their `clauseAnalyses`
   JSON field (no data migration needed — old analyses stay readable).
3. New analyses write to the new relational tables only. Legacy JSON
   fields (`clauseAnalyses`, `redlineSuggestions`) are kept in schema
   but no longer written to — avoids dual-write complexity per
   Simplicity principle.
4. The three-panel UI reads from the relational tables only.
5. Legacy JSON fields can be dropped in a future cleanup migration.

## Volume Estimates

- Typical contract: 10–25 clauses
- Typical findings per clause: 0–3
- Total findings per analysis: 15–40
- Total records per analysis: ~60 (1 analysis + 20 clauses + 40 findings)
- SQLite handles this with no performance concerns.
