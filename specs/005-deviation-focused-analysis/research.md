# Research: Deviation-Focused Contract Analysis

**Feature**: 005-deviation-focused-analysis  
**Date**: 2026-02-13

## Overview

This document captures research decisions for transitioning from clause-based extraction (with full clause text) to deviation-based extraction (with excerpts + context). Each decision addresses a "NEEDS CLARIFICATION" item from the technical context or a key implementation question.

---

## R1: Prompt Structure for Flat Findings with Excerpts

### Question
How should the new JSON schema be structured to minimize tokens while providing sufficient context?

### Research

**Current Schema (Clause-Grouped)**:
```json
{
  "clauses": [
    {
      "clauseNumber": "3.1",
      "clauseName": "Limitation of Liability",
      "clauseText": "500+ words of full clause...",
      "findings": [
        {
          "riskLevel": "RED",
          "excerpt": "duplicate of part of clauseText",
          ...
        }
      ]
    }
  ]
}
```

**Problem**: 
- Duplicates content (full `clauseText` + `excerpt`)
- Averages 500 words per clause × 20 clauses = 10,000 words
- Consumes 15K tokens on average

**Proposed Schema (Flat Findings)**:
```json
{
  "executiveSummary": "...",
  "overallRisk": "medium",
  "totalClauses": 247,
  "findings": [
    {
      "clauseReference": {
        "number": "3.1",
        "name": "Limitation of Liability",
        "position": 8
      },
      "excerpt": "20-80 words verbatim problematic passage",
      "context": {
        "before": "30-50 words before excerpt",
        "after": "30-50 words after excerpt"
      },
      "location": {
        "page": 5,
        "approximatePosition": "middle"
      },
      "riskLevel": "RED",
      "matchedRuleTitle": "...",
      "summary": "...",
      "fallbackText": "...",
      "whyTriggered": "..."
    }
  ],
  "negotiationStrategy": [...]
}
```

**Token Math**:
- Excerpt: 50 words avg = 70 tokens
- Context: 75 words avg = 105 tokens
- Metadata + analysis: ~100 tokens
- **Total per finding**: ~275 tokens
- **20 findings**: 5,500 tokens (vs. 15,000 current)
- **Savings**: 63% reduction

**Additional Savings**:
- No duplicate `clauseText` field (removes 10K words)
- Clause without findings = no entry (vs. empty findings array)
- Only problematic clauses extracted

### Decision

**Adopt flat findings schema** with the following rules:

1. **Findings Array**: Top-level, not nested under clauses
2. **Excerpt**: 20-80 words, verbatim from contract
3. **Context**: Optional `before`/`after` (null if not available)
4. **Location**: Optional `page` and `approximatePosition` (null if not determinable)
5. **Clause Reference**: Embedded in each finding
6. **Total Clauses**: Top-level `totalClauses: number` for metadata

**Prompt Instructions**:
- "Extract ONLY problematic passages, NOT full clause text"
- "Excerpt must be 20-80 words, verbatim"
- "Include 30-50 words before and after for context"
- "Estimate page number and position (top/middle/bottom) if possible"

### Alternatives Considered

**Alt 1: Keep clause grouping, remove clauseText**
- Pros: Minimal schema change
- Cons: Still nested structure, harder to sort findings by severity
- Rejected: Doesn't simplify UI rendering

**Alt 2: Hybrid (extract both)**
- Pros: Maximum flexibility
- Cons: Doesn't solve token problem
- Rejected: Core requirement is token reduction

---

## R2: Parser Strategy for Dual-Format Support

### Question
How should the parser handle both old (formatVersion=1) and new (formatVersion=2) analyses?

### Research

**Requirements**:
1. Parse old analyses (clause-grouped, full clauseText)
2. Parse new analyses (flat findings, excerpts)
3. No data loss during migration period
4. UI receives consistent data shape

**Current Parser**: `parseContractAnalysis` in `src/lib/analysis-parser.ts`
- Returns `StructuredAnalysisResult`
- Handles `StructuredClause[]` with nested `StructuredFinding[]`

**Challenges**:
- Old format has `clauses[].clauseText` (string)
- New format has `findings[].excerpt + context` (object)
- UI expects clause-grouped data for clause list sidebar
- UI needs flat findings for triage panel

### Decision

**Implement format detection + normalization strategy**:

```typescript
// Step 1: Detect format
function detectFormat(parsed: any): 1 | 2 {
  if (parsed.clauses && Array.isArray(parsed.clauses)) return 1;
  if (parsed.findings && Array.isArray(parsed.findings)) return 2;
  throw new Error("Unknown format");
}

// Step 2: Parse format-specific
function parseFormatV1(parsed: any): StructuredAnalysisResult {
  // Current logic (clause-grouped)
  return {
    executiveSummary: parsed.executiveSummary,
    overallRisk: parsed.overallRisk,
    clauses: parsed.clauses.map(c => ({
      clauseNumber: c.clauseNumber || "",
      clauseName: c.clauseName,
      clauseText: c.clauseText,
      clauseTextFormatted: c.clauseTextFormatted || c.clauseText,
      position: c.position,
      findings: c.findings
    })),
    // ... rest
  };
}

function parseFormatV2(parsed: any): StructuredAnalysisResult {
  // New logic (flat findings → synthesize clauses)
  const findingsByClause = groupBy(parsed.findings, f => f.clauseReference.position);
  
  const clauses = Array.from(findingsByClause.entries()).map(([position, findings]) => ({
    clauseNumber: findings[0].clauseReference.number,
    clauseName: findings[0].clauseReference.name,
    clauseText: "", // No full text in v2
    clauseTextFormatted: null,
    position: position,
    findings: findings.map(f => ({
      riskLevel: f.riskLevel,
      matchedRuleTitle: f.matchedRuleTitle,
      summary: f.summary,
      fallbackText: f.fallbackText,
      whyTriggered: f.whyTriggered,
      excerpt: f.excerpt,
      context: f.context, // NEW
      location: f.location // NEW
    }))
  }));

  return {
    executiveSummary: parsed.executiveSummary,
    overallRisk: parsed.overallRisk,
    clauses: clauses,
    totalClauses: parsed.totalClauses, // NEW
    // ... rest
  };
}

// Step 3: Unified parser
export function parseContractAnalysis(rawJson: string): StructuredAnalysisResult {
  const sanitized = sanitizeJsonString(rawJson);
  const parsed = JSON.parse(sanitized);
  
  const format = detectFormat(parsed);
  return format === 1 ? parseFormatV1(parsed) : parseFormatV2(parsed);
}
```

**Migration Period**:
- Both parsers coexist indefinitely (no sunset date)
- Format detection is automatic
- UI components adapt based on `clauseText` presence

### Alternatives Considered

**Alt 1: Separate parser functions (parseV1, parseV2)**
- Pros: Clean separation
- Cons: Caller must know format version
- Rejected: Format should be transparent to caller

**Alt 2: Convert all old analyses to new format**
- Pros: Single code path
- Cons: Data loss (discard clauseText), risky migration
- Rejected: Violates audit trail principle

---

## R3: Migration Strategy

### Question
Should old analyses be migrated to the new format, and if so, how?

### Research

**Current State**:
- 1000+ existing analyses in production
- All have `formatVersion=1` (implicit, field doesn't exist yet)
- All have `clauseText` stored in `AnalysisClause` table

**Options**:

**Option A: No Migration (Keep Forever)**
- Old analyses remain in formatVersion=1
- Parser handles both formats indefinitely
- Pros: Zero risk, no data loss, simple
- Cons: Technical debt, dual code path forever

**Option B: Soft Migration (Mark Only)**
- Add `formatVersion` column to `ContractAnalysis`
- Set `formatVersion=1` for all existing (default in migration)
- New analyses get `formatVersion=2`
- Pros: Explicit versioning, no data change
- Cons: Still dual code path

**Option C: Hard Migration (Rewrite Data)**
- For each old analysis, extract excerpts from clauseText
- Discard clauseText, keep excerpts
- Update database records to v2 schema
- Pros: Single code path
- Cons: Data loss, complex, error-prone

### Decision

**Adopt Option B: Soft Migration (Mark Only)**

**Rationale**:
1. **Data Integrity**: Preserves all original data
2. **Audit Trail**: Old analyses remain as-is for legal review
3. **Risk**: Minimal (just adds a column with default)
4. **Simplicity**: No data transformation, no rollback needed

**Implementation**:
1. **Migration SQL**:
   ```sql
   ALTER TABLE ContractAnalysis ADD COLUMN formatVersion INTEGER DEFAULT 1;
   ALTER TABLE ContractAnalysis ADD COLUMN totalClauses INTEGER DEFAULT 0;
   ```

2. **New Analyses**:
   ```typescript
   await prisma.contractAnalysis.create({
     data: {
       formatVersion: 2,
       totalClauses: parsedResult.totalClauses,
       // ... other fields
     }
   });
   ```

3. **Parser**:
   - Auto-detects format from JSON structure
   - No need to check `formatVersion` column (JSON is source of truth)

**Optional: Upgrade Script**
- Provide script to manually upgrade specific analyses
- Use case: User requests re-analysis of old contract
- Process: Re-run Claude API with new prompt, save as v2
- Script not required for initial launch

### Alternatives Considered

**Alt: Delete old analyses**
- Rejected: Violates audit trail principle

**Alt: Migrate in batches overnight**
- Rejected: Complex, risky, no user benefit (UI works with both)

---

## R4: Location Metadata Extraction

### Question
How can Claude reliably provide page numbers and positions for findings?

### Research

**Challenge**:
- PDF-extracted text loses page boundaries
- `pdf-parse` returns continuous text with `\n\n` separators
- Page breaks are not explicitly marked

**Approaches**:

**Approach A: Form Feed Characters**
- `pdf-parse` option: `pageBreak: '\f'`
- Insert form feed (`\f`) between pages
- Prompt: "Count \\f characters before excerpt to determine page"
- Pros: Explicit page markers
- Cons: Requires pdf-parse config change, Claude may miscount

**Approach B: Token Estimation**
- Average 500 tokens per page
- Prompt: "Estimate page based on position in document"
- Pros: No parser changes
- Cons: Inaccurate for variable-density pages

**Approach C: Best-Effort with Null Fallback**
- Prompt: "If you can determine the page, include it. Otherwise, set to null."
- Rely on Claude's heuristics (section headers, "Page X", etc.)
- Pros: Flexible, handles uncertainty
- Cons: Incomplete data

**Approach D: Post-Processing (Future)**
- Store `Document.pageStructure` JSON with page boundaries
- Match excerpt text against page boundaries
- Pros: Accurate
- Cons: Requires separate extraction pipeline

### Decision

**Adopt Approach C: Best-Effort with Null Fallback** (for Phase 1)

**Rationale**:
1. **Simplicity**: No new extraction pipeline
2. **Constitution**: Optional fields pattern (location can be null)
3. **Future-Proof**: Sets up schema for Approach D in Phase 2

**Prompt Instructions**:
```
For each finding, estimate the page number and approximate position:
- "page": Estimate the page number (1-indexed) based on the position in the document. 
          If uncertain, set to null.
- "approximatePosition": "top" (first third), "middle" (second third), or "bottom" (last third).
                          If uncertain, set to null.
```

**UI Handling**:
```typescript
{location.page ? `Page ${location.page}` : "Page unknown"}
{location.approximatePosition && ` (${location.approximatePosition})`}
```

**Future Enhancement** (Phase 2):
- Implement Approach D with proper page boundary detection
- Update existing v2 analyses with accurate locations
- Use for document viewer highlighting

### Alternatives Considered

**Alt: Don't extract location (set all to null)**
- Rejected: Location is core requirement for future viewer

**Alt: Require accurate page numbers**
- Rejected: Not feasible without parser changes

---

## R5: UI Component Refactoring

### Question
How should the UI adapt to handle both old (full clauseText) and new (excerpt + context) formats?

### Research

**Current UI Components**:
1. **ClauseList** (`clause-list.tsx`): Sidebar with clause items
2. **ClauseText** (`clause-text.tsx`): Displays full clause text
3. **FindingsPanel** (`findings-panel.tsx`): Findings for selected clause

**New Requirements**:
- **ClauseList**: Must work with both formats
- **ClauseText**: Show excerpt + context for v2, full text for v1
- **FindingsPanel**: Add location badges for v2

### Decision

**Adaptive Component Strategy**:

**1. ClauseList (Minimal Changes)**
```typescript
// Already handles clauses array (both v1 and v2 synthesize this)
// No changes needed - parser normalizes data
```

**2. ClauseText (Format Detection)**
```typescript
export function ClauseText({ clause }: { clause: Clause }) {
  const isLegacyFormat = clause.clauseText && clause.clauseText.length > 0;
  
  if (isLegacyFormat) {
    // V1: Show full clause text
    return <div>{clause.clauseTextFormatted || clause.clauseText}</div>;
  } else {
    // V2: Show all excerpts with context
    return (
      <div className="space-y-6">
        {clause.findings.map(finding => (
          <div key={finding.id}>
            {finding.context?.before && (
              <p className="text-muted-foreground text-sm">
                ...{finding.context.before}
              </p>
            )}
            <p className="font-medium bg-yellow-50 p-2 rounded">
              {finding.excerpt}
            </p>
            {finding.context?.after && (
              <p className="text-muted-foreground text-sm">
                {finding.context.after}...
              </p>
            )}
            {finding.location?.page && (
              <Badge variant="outline">
                Page {finding.location.page}
                {finding.location.approximatePosition && 
                  ` (${finding.location.approximatePosition})`
                }
              </Badge>
            )}
          </div>
        ))}
      </div>
    );
  }
}
```

**3. FindingsPanel (Add Location)**
```typescript
// Add location badge to each finding card
{finding.location?.page && (
  <Badge variant="outline" className="ml-2">
    <MapPin className="w-3 h-3 mr-1" />
    Page {finding.location.page}
  </Badge>
)}
```

**4. ContractDetailHeader (Show Total Clauses)**
```typescript
// For v2, show "X findings in Y clauses"
{analysis.totalClauses > 0 && (
  <span className="text-sm text-muted-foreground">
    {analysis.findings.length} findings in {analysis.totalClauses} clauses
  </span>
)}
```

### Alternatives Considered

**Alt: Separate components for v1 and v2**
- Rejected: Duplicates UI logic, harder to maintain

**Alt: Force upgrade UI (hide v1 analyses)**
- Rejected: Violates backward compatibility requirement

---

## R6: Testing Strategy

### Question
How to validate the parser, UI, and API changes?

### Research

**Current State**: No automated test framework configured

**Test Areas**:
1. **Parser**: Format detection, v1 parsing, v2 parsing, sanitization
2. **API**: Analysis creation with formatVersion=2
3. **UI**: Rendering both formats, location badges
4. **Integration**: End-to-end analysis flow

### Decision

**Manual Testing Plan** (for initial launch):

**Test Cases**:

1. **TC1: New Analysis (V2 Format)**
   - Upload 50-page contract
   - Verify formatVersion=2 in database
   - Verify no clauseText stored
   - Verify excerpts are 20-80 words
   - Verify context before/after present
   - Verify location data (if available)

2. **TC2: Old Analysis (V1 Format)**
   - Load existing analysis from production
   - Verify UI renders correctly
   - Verify full clauseText visible
   - Verify no location badges shown

3. **TC3: Parser Dual-Format**
   - Feed v1 JSON to parser → verify clauses extracted
   - Feed v2 JSON to parser → verify clauses synthesized
   - Feed malformed JSON → verify error handling

4. **TC4: Large Contract**
   - Upload 250-clause, 100-page contract
   - Verify analysis completes without truncation
   - Verify all findings extracted
   - Verify token count <8,000

5. **TC5: Missing Data Handling**
   - V2 analysis with null locations
   - V2 analysis with null context
   - Verify UI renders without crashes

**Future: Automated Tests**
- Add Jest + React Testing Library
- Unit tests for parser
- Integration tests for API routes
- E2E tests with Playwright

### Alternatives Considered

**Alt: Block launch until tests written**
- Rejected: No test framework configured, delays launch

---

## Summary of Decisions

| # | Decision | Rationale |
|---|----------|-----------|
| R1 | Flat findings schema with excerpts + context | 63% token reduction, sets up viewer |
| R2 | Dual-format parser with auto-detection | Zero-downtime migration, no data loss |
| R3 | Soft migration (mark formatVersion only) | Data integrity, audit trail, low risk |
| R4 | Best-effort location with null fallback | Simplicity, constitution-compliant, future-proof |
| R5 | Adaptive UI components (format detection) | Backward compatible, single codebase |
| R6 | Manual testing plan (automated future) | Pragmatic for initial launch |

**All NEEDS CLARIFICATION items resolved** — Ready for Phase 1 (Design).
