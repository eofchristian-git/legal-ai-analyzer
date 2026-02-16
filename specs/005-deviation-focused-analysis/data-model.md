# Data Model: Deviation-Focused Contract Analysis

**Feature**: 005-deviation-focused-analysis  
**Date**: 2026-02-13

## Overview

This document defines the Prisma schema changes required to support deviation-focused contract analysis. The primary changes are:
1. Add `formatVersion` and `totalClauses` to `ContractAnalysis`
2. Make `clauseText` and `clauseTextFormatted` optional in `AnalysisClause`
3. Add `contextBefore`, `contextAfter`, `locationPage`, and `locationPosition` to `AnalysisFinding`
4. All changes are backward compatible (additive only, no breaking changes)

---

## Modified Models

### ContractAnalysis

**Purpose**: Track which format version an analysis uses and how many clauses were in the original document.

**Changes**:
```prisma
model ContractAnalysis {
  id                  String            @id @default(cuid())
  contractId          String            @unique
  contract            Contract          @relation(fields: [contractId], references: [id], onDelete: Cascade)
  overallRisk         String
  greenCount          Int               @default(0)
  yellowCount         Int               @default(0)
  redCount            Int               @default(0)
  rawAnalysis         String
  clauseAnalyses      String
  redlineSuggestions  String
  negotiationStrategy String?
  executiveSummary    String?
  modelUsed           String
  tokensUsed          Int?
  reviewBasis         String
  playbookVersionId   String?
  playbookSnapshotId  String?
  playbookSnapshot    PlaybookSnapshot? @relation(fields: [playbookSnapshotId], references: [id])
  finalized           Boolean           @default(false)
  finalizedAt         DateTime?
  finalizedBy         String?
  finalizedByUser     User?             @relation("AnalysesFinalizedBy", fields: [finalizedBy], references: [id])
  createdBy           String?
  createdByUser       User?             @relation("AnalysesCreated", fields: [createdBy], references: [id])
  createdAt           DateTime          @default(now())
  
  // 🆕 NEW FIELDS
  formatVersion       Int               @default(1)  // 1 = old clause-based, 2 = new deviation-based
  totalClauses        Int               @default(0)  // Total clauses in document (v2 only)

  clauses             AnalysisClause[]
  negotiationItems    NegotiationItem[]
}
```

**Field Details**:
- `formatVersion` (Int, default 1): 
  - Value `1` = old format (clause-grouped, full clauseText)
  - Value `2` = new format (flat findings, excerpts only)
  - Default ensures all existing analyses are marked as v1
- `totalClauses` (Int, default 0): 
  - Total number of clauses Claude identified in the document
  - Only populated for formatVersion=2 analyses
  - Allows UI to show "X findings in Y clauses"

**Migration**:
```sql
-- Add new columns with defaults
ALTER TABLE ContractAnalysis ADD COLUMN formatVersion INTEGER NOT NULL DEFAULT 1;
ALTER TABLE ContractAnalysis ADD COLUMN totalClauses INTEGER NOT NULL DEFAULT 0;
```

**Validation**:
- `formatVersion` must be 1 or 2
- `totalClauses` must be >= 0
- If `formatVersion = 1`, `totalClauses` should be 0 (not used)
- If `formatVersion = 2`, `totalClauses` should match number of unique clause positions

---

### AnalysisClause

**Purpose**: Store clause-level metadata. In v2 format, full `clauseText` is not stored.

**Changes**:
```prisma
model AnalysisClause {
  id                  String           @id @default(cuid())
  analysisId          String
  analysis            ContractAnalysis @relation(fields: [analysisId], references: [id], onDelete: Cascade)
  clauseNumber        String           @default("")
  clauseName          String
  position            Int
  createdAt           DateTime         @default(now())
  
  // ✏️ MODIFIED FIELDS (now optional)
  clauseText          String?          // v1: full text, v2: null or empty
  clauseTextFormatted String?          // v1: formatted text, v2: null

  findings            AnalysisFinding[]

  @@unique([analysisId, position])
}
```

**Field Details**:
- `clauseText` (String?, optional): 
  - v1: Contains full clause text (500+ words)
  - v2: null or empty string (excerpt stored in finding instead)
- `clauseTextFormatted` (String?, optional):
  - v1: Markdown-formatted clause text
  - v2: null (excerpt already includes minimal formatting)

**Migration**:
```sql
-- No migration needed - fields already exist, just changing nullability in Prisma
-- SQLite doesn't enforce nullability at runtime, so this is a code-level change only
```

**Validation**:
- If analysis.formatVersion = 1, `clauseText` should be non-empty
- If analysis.formatVersion = 2, `clauseText` may be empty/null
- `clauseNumber` can be empty string if document has no numbering
- `position` must be > 0 and unique within analysisId

---

### AnalysisFinding

**Purpose**: Store individual findings. In v2 format, includes excerpt context and location metadata.

**Changes**:
```prisma
model AnalysisFinding {
  id                  String         @id @default(cuid())
  clauseId            String
  clause              AnalysisClause @relation(fields: [clauseId], references: [id], onDelete: Cascade)
  riskLevel           String
  matchedRuleTitle    String
  matchedRuleId       String?
  summary             String
  fallbackText        String
  whyTriggered        String
  excerpt             String         @default("")
  triageDecision      String?
  triageNote          String?
  triagedBy           String?
  triagedByUser       User?          @relation("FindingsTriagedBy", fields: [triagedBy], references: [id])
  triagedAt           DateTime?
  createdAt           DateTime       @default(now())
  
  // 🆕 NEW FIELDS
  contextBefore       String?        // v2: 30-50 words before excerpt
  contextAfter        String?        // v2: 30-50 words after excerpt
  locationPage        Int?           // v2: approximate page number (1-indexed)
  locationPosition    String?        // v2: "top" | "middle" | "bottom"

  comments            FindingComment[]
}
```

**Field Details**:
- `contextBefore` (String?, optional):
  - v2: 30-50 words of text appearing before the excerpt in the document
  - Provides context for understanding the deviation
  - Null if not available or if formatVersion=1
- `contextAfter` (String?, optional):
  - v2: 30-50 words of text appearing after the excerpt
  - Provides context for understanding the deviation
  - Null if not available or if formatVersion=1
- `locationPage` (Int?, optional):
  - v2: Approximate page number where finding appears (1-indexed)
  - Based on Claude's best-effort estimation
  - Null if not determinable
- `locationPosition` (String?, optional):
  - v2: Approximate position on page
  - Values: "top", "middle", "bottom"
  - Null if not determinable

**Migration**:
```sql
-- Add new nullable columns
ALTER TABLE AnalysisFinding ADD COLUMN contextBefore TEXT;
ALTER TABLE AnalysisFinding ADD COLUMN contextAfter TEXT;
ALTER TABLE AnalysisFinding ADD COLUMN locationPage INTEGER;
ALTER TABLE AnalysisFinding ADD COLUMN locationPosition TEXT;
```

**Validation**:
- All new fields are nullable (no validation required)
- `locationPage` must be > 0 if present
- `locationPosition` must be one of: "top", "middle", "bottom" (enforced in TypeScript)
- `contextBefore` and `contextAfter` should be <200 characters each

---

## Unchanged Models

The following models are not modified but are referenced for completeness:

- **Document**: No changes (still stores `extractedText` as backup)
- **Contract**: No changes (still has `status` field for analysis lifecycle)
- **User**: No changes (still tracks who created/triaged)
- **FindingComment**: No changes (still linked to findings)
- **ActivityLog**: No changes (audit trail unchanged)
- **NegotiationItem**: No changes (still linked to analysis)

---

## TypeScript Interfaces

These interfaces will be used in the codebase to work with the new data model:

### For Claude API Response (v2)

```typescript
// src/lib/types/claude-response.ts

export interface ClaudeResponseV2 {
  executiveSummary: string;
  overallRisk: "low" | "medium" | "high";
  totalClauses: number;
  findings: ClaudeFindingV2[];
  negotiationStrategy: ClaudeNegotiationItem[];
}

export interface ClaudeFindingV2 {
  clauseReference: {
    number: string;              // e.g. "3.1", "" if missing
    name: string;                // e.g. "Limitation of Liability"
    position: number;            // Sequential 1-based index
  };
  excerpt: string;               // 20-80 words, verbatim
  context: {
    before: string | null;       // 30-50 words before
    after: string | null;        // 30-50 words after
  };
  location: {
    page: number | null;         // 1-indexed page number
    approximatePosition: "top" | "middle" | "bottom" | null;
  };
  riskLevel: "GREEN" | "YELLOW" | "RED";
  matchedRuleTitle: string;
  summary: string;
  fallbackText: string;
  whyTriggered: string;
}

export interface ClaudeNegotiationItem {
  priority: "P1" | "P2" | "P3";
  title: string;
  description: string;
  clauseRef: string | null;
}
```

### For Parser Output (Unified)

```typescript
// src/lib/analysis-parser.ts (updated)

export interface StructuredFinding {
  riskLevel: "GREEN" | "YELLOW" | "RED";
  matchedRuleTitle: string;
  summary: string;
  fallbackText: string;
  whyTriggered: string;
  excerpt: string;
  // 🆕 NEW FIELDS
  context?: {
    before: string | null;
    after: string | null;
  };
  location?: {
    page: number | null;
    approximatePosition: string | null;
  };
}

export interface StructuredClause {
  clauseNumber: string;
  clauseName: string;
  clauseText: string;          // v1: full text, v2: empty string
  clauseTextFormatted: string; // v1: formatted, v2: empty string
  position: number;
  findings: StructuredFinding[];
}

export interface StructuredAnalysisResult {
  executiveSummary: string;
  overallRisk: string;
  clauses: StructuredClause[];
  negotiationStrategy: string;
  negotiationItems: StructuredNegotiationItem[];
  greenCount: number;
  yellowCount: number;
  redCount: number;
  rawAnalysis: string;
  // 🆕 NEW FIELD
  totalClauses?: number;  // v2 only
}
```

### For UI Components

```typescript
// src/app/(app)/contracts/[id]/_components/types.ts (updated)

export interface Finding {
  id: string;
  riskLevel: "GREEN" | "YELLOW" | "RED";
  matchedRuleTitle: string;
  summary: string;
  fallbackText: string;
  whyTriggered: string;
  excerpt: string;
  triageDecision: string | null;
  triageNote: string | null;
  triagedBy: string | null;
  triagedAt: Date | null;
  // 🆕 NEW FIELDS
  contextBefore?: string | null;
  contextAfter?: string | null;
  locationPage?: number | null;
  locationPosition?: string | null;
}

export interface Clause {
  id: string;
  clauseNumber: string;
  clauseName: string;
  clauseText: string;          // May be empty for v2
  clauseTextFormatted: string | null;
  position: number;
  findings: Finding[];
}
```

---

## State Transitions

No changes to analysis state lifecycle:

```
Contract.status:
  pending → analyzing → completed | error
```

The formatVersion is determined at analysis creation time and never changes:
- Old analyses: `formatVersion = 1` (set by migration default)
- New analyses: `formatVersion = 2` (set by API at creation)

---

## Migration Notes

### Database Migration

**File**: `prisma/migrations/20260213000000_deviation_focused_analysis/migration.sql`

```sql
-- Add formatVersion and totalClauses to ContractAnalysis
ALTER TABLE ContractAnalysis ADD COLUMN formatVersion INTEGER NOT NULL DEFAULT 1;
ALTER TABLE ContractAnalysis ADD COLUMN totalClauses INTEGER NOT NULL DEFAULT 0;

-- Add context and location fields to AnalysisFinding
ALTER TABLE AnalysisFinding ADD COLUMN contextBefore TEXT;
ALTER TABLE AnalysisFinding ADD COLUMN contextAfter TEXT;
ALTER TABLE AnalysisFinding ADD COLUMN locationPage INTEGER;
ALTER TABLE AnalysisFinding ADD COLUMN locationPosition TEXT;

-- Note: AnalysisClause.clauseText and clauseTextFormatted already exist as TEXT
-- SQLite doesn't enforce nullability, so no ALTER needed for making them optional
```

**Backward Compatibility**:
- All existing analyses automatically get `formatVersion=1`
- New fields are nullable (existing data unaffected)
- No data transformation required

### Prisma Schema Updates

After migration, run:
```bash
npx prisma generate
```

This regenerates the Prisma client with updated types.

---

## Validation Rules

### At Analysis Creation (API Layer)

```typescript
// src/app/api/contracts/[id]/analyze/route.ts

if (formatVersion === 2) {
  // Validate v2 fields are populated
  if (!parsedResult.totalClauses) {
    throw new Error("totalClauses required for formatVersion 2");
  }
  
  // Validate findings structure
  for (const finding of parsedResult.findings) {
    if (!finding.excerpt || finding.excerpt.length < 10) {
      throw new Error("excerpt required and must be at least 10 characters");
    }
    // Context and location are optional (nullable)
  }
}
```

### At Database Layer (Prisma)

No additional validation beyond schema constraints. Nullability is enforced by TypeScript, not database.

---

## Indexes

No new indexes required. Existing indexes are sufficient:
- `ContractAnalysis.contractId` (unique index already exists)
- `AnalysisClause.analysisId + position` (unique index already exists)
- `AnalysisFinding.clauseId` (foreign key index already exists)

---

## Storage Impact

**Before (v1)**:
- Average analysis: ~50 KB (full clause text stored)
- 1000 analyses: ~50 MB

**After (v2)**:
- Average analysis: ~15 KB (excerpts only)
- 1000 analyses: ~15 MB
- **Savings**: 70% storage reduction

**Note**: Old analyses (v1) remain unchanged, so total storage reduction realized gradually as new analyses are created.

---

## Summary

| Model | Changes | Migration Required |
|-------|---------|-------------------|
| ContractAnalysis | +2 fields (formatVersion, totalClauses) | Yes (ALTER TABLE) |
| AnalysisClause | Made 2 fields optional (clauseText, clauseTextFormatted) | No (code-level only) |
| AnalysisFinding | +4 fields (contextBefore, contextAfter, locationPage, locationPosition) | Yes (ALTER TABLE) |

**Total new columns**: 6  
**Breaking changes**: 0  
**Data loss**: None  
**Rollback**: Safe (all new fields nullable, defaults provided)
