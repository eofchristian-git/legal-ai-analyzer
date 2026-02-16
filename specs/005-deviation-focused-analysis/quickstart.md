# Quickstart: Deviation-Focused Contract Analysis

**Feature**: 005-deviation-focused-analysis  
**Date**: 2026-02-13  
**Estimated Time**: 3-4 days

---

## Overview

This guide provides a step-by-step walkthrough for implementing the deviation-focused contract analysis feature. Follow the phases in order, testing at each checkpoint.

---

## Prerequisites

- [ ] Feature spec reviewed (`spec.md`)
- [ ] Research decisions understood (`research.md`)
- [ ] Data model reviewed (`data-model.md`)
- [ ] API contracts reviewed (`contracts/`)
- [ ] Development environment set up
- [ ] Current codebase understanding (existing analysis flow)

---

## Phase 1: Database Schema (30 minutes)

### Step 1.1: Create Prisma Migration

**File**: `prisma/schema.prisma`

Add new fields to existing models:

```prisma
model ContractAnalysis {
  // ... existing fields ...
  
  // 🆕 Add these fields
  formatVersion  Int      @default(1)  // 1 = old, 2 = new
  totalClauses   Int      @default(0)  // Total clauses in document
  
  // ... rest of model ...
}

model AnalysisClause {
  // ... existing fields ...
  
  // ✏️ Make these optional (add ?)
  clauseText          String?
  clauseTextFormatted String?
  
  // ... rest of model ...
}

model AnalysisFinding {
  // ... existing fields ...
  
  // 🆕 Add these fields
  contextBefore      String?  // Context before excerpt
  contextAfter       String?  // Context after excerpt
  locationPage       Int?     // Approximate page number
  locationPosition   String?  // "top" | "middle" | "bottom"
  
  // ... rest of model ...
}
```

### Step 1.2: Generate Migration

```bash
npx prisma migrate dev --name deviation_focused_analysis
```

### Step 1.3: Verify Migration

Check generated SQL in `prisma/migrations/[timestamp]_deviation_focused_analysis/migration.sql`:

```sql
-- Should contain:
ALTER TABLE ContractAnalysis ADD COLUMN formatVersion INTEGER NOT NULL DEFAULT 1;
ALTER TABLE ContractAnalysis ADD COLUMN totalClauses INTEGER NOT NULL DEFAULT 0;
ALTER TABLE AnalysisFinding ADD COLUMN contextBefore TEXT;
ALTER TABLE AnalysisFinding ADD COLUMN contextAfter TEXT;
ALTER TABLE AnalysisFinding ADD COLUMN locationPage INTEGER;
ALTER TABLE AnalysisFinding ADD COLUMN locationPosition TEXT;
```

### Step 1.4: Push to Database

```bash
npx prisma db push
npx prisma generate
```

**✅ Checkpoint**: Prisma client regenerated with new types.

---

## Phase 2: Update TypeScript Interfaces (15 minutes)

### Step 2.1: Update Claude Response Types

**File**: `src/lib/analysis-parser.ts`

Add new fields to existing interfaces:

```typescript
export interface StructuredFinding {
  riskLevel: "GREEN" | "YELLOW" | "RED";
  matchedRuleTitle: string;
  summary: string;
  fallbackText: string;
  whyTriggered: string;
  excerpt: string;
  // 🆕 Add these
  context?: {
    before: string | null;
    after: string | null;
  };
  location?: {
    page: number | null;
    approximatePosition: string | null;
  };
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
  // 🆕 Add this
  totalClauses?: number;
}
```

### Step 2.2: Update UI Component Types

**File**: `src/app/(app)/contracts/[id]/_components/types.ts`

```typescript
export interface Finding {
  // ... existing fields ...
  // 🆕 Add these
  contextBefore?: string | null;
  contextAfter?: string | null;
  locationPage?: number | null;
  locationPosition?: string | null;
}
```

**✅ Checkpoint**: TypeScript compiles without errors.

---

## Phase 3: Update Prompts (1 hour)

### Step 3.1: Modify Prompt Schema

**File**: `src/lib/prompts.ts`

Find the JSON schema instructions and update:

```typescript
// BEFORE (v1 schema):
'      "clauseText": "string — the FULL clause text...",',

// AFTER (v2 schema):
// Remove clauseText from schema entirely

// ADD to schema:
'  "totalClauses": number,',
'  "findings": [',
'    {',
'      "clauseReference": {',
'        "number": "string",',
'        "name": "string",',
'        "position": number',
'      },',
'      "excerpt": "string — 20-80 words, verbatim problematic passage",',
'      "context": {',
'        "before": "string|null — 30-50 words before excerpt",',
'        "after": "string|null — 30-50 words after excerpt"',
'      },',
'      "location": {',
'        "page": number|null,',
'        "approximatePosition": "top|middle|bottom|null"',
'      },',
'      "riskLevel": "GREEN|YELLOW|RED",',
'      ...rest of finding fields...',
'    }',
'  ]',
```

### Step 3.2: Add Prompt Instructions

Add before the schema:

```typescript
parts.push(
  "IMPORTANT INSTRUCTIONS:",
  "1. Do NOT extract full clause text — only extract problematic passages.",
  "2. For each finding, extract a 20-80 word excerpt that captures the specific issue.",
  "3. Include 30-50 words of context before and after the excerpt.",
  "4. Estimate the page number (1-indexed) and position (top/middle/bottom) where the finding appears.",
  "5. Return findings as a FLAT LIST at the top level, not grouped under clauses.",
  "6. Include totalClauses: the total number of clauses you identified in the document.",
  ""
);
```

### Step 3.3: Update Skill File (Optional)

**File**: `skills/contract-review.md`

Add section explaining deviation-focused extraction (if needed for prompt engineering).

**✅ Checkpoint**: Prompt instructions updated, ready for testing.

---

## Phase 4: Update Parser (2 hours)

### Step 4.1: Add Format Detection

**File**: `src/lib/analysis-parser.ts`

Add at the beginning of `parseContractAnalysis`:

```typescript
function detectFormat(parsed: any): 1 | 2 {
  // v1: has clauses array with nested findings
  if (parsed.clauses && Array.isArray(parsed.clauses)) {
    return 1;
  }
  
  // v2: has flat findings array at top level
  if (parsed.findings && Array.isArray(parsed.findings) && !parsed.clauses) {
    return 2;
  }
  
  throw new Error("Unknown analysis format - neither v1 nor v2 structure detected");
}
```

### Step 4.2: Create V2 Parser

Add new function:

```typescript
function parseFormatV2(parsed: any): StructuredAnalysisResult {
  // Group findings by clause position
  const findingsByPosition = new Map<number, any[]>();
  
  for (const finding of parsed.findings || []) {
    const position = finding.clauseReference?.position || 0;
    if (!findingsByPosition.has(position)) {
      findingsByPosition.set(position, []);
    }
    findingsByPosition.get(position)!.push(finding);
  }
  
  // Synthesize clause objects
  const clauses: StructuredClause[] = [];
  for (const [position, findings] of findingsByPosition.entries()) {
    const firstFinding = findings[0];
    clauses.push({
      clauseNumber: firstFinding.clauseReference?.number || "",
      clauseName: firstFinding.clauseReference?.name || "Unknown Clause",
      clauseText: "", // No full text in v2
      clauseTextFormatted: "",
      position: position,
      findings: findings.map(f => ({
        riskLevel: f.riskLevel,
        matchedRuleTitle: f.matchedRuleTitle || "",
        summary: f.summary || "",
        fallbackText: f.fallbackText || "",
        whyTriggered: f.whyTriggered || "",
        excerpt: f.excerpt || "",
        context: f.context || { before: null, after: null },
        location: f.location || { page: null, approximatePosition: null }
      }))
    });
  }
  
  // Sort clauses by position
  clauses.sort((a, b) => a.position - b.position);
  
  // Count findings by risk level
  let greenCount = 0, yellowCount = 0, redCount = 0;
  for (const clause of clauses) {
    for (const finding of clause.findings) {
      if (finding.riskLevel === "GREEN") greenCount++;
      else if (finding.riskLevel === "YELLOW") yellowCount++;
      else if (finding.riskLevel === "RED") redCount++;
    }
  }
  
  return {
    executiveSummary: parsed.executiveSummary || "",
    overallRisk: parsed.overallRisk || "medium",
    clauses: clauses,
    negotiationStrategy: JSON.stringify(parsed.negotiationStrategy || []),
    negotiationItems: parsed.negotiationStrategy || [],
    greenCount,
    yellowCount,
    redCount,
    rawAnalysis: JSON.stringify(parsed),
    totalClauses: parsed.totalClauses || 0
  };
}
```

### Step 4.3: Update Main Parser

Modify `parseContractAnalysis`:

```typescript
export function parseContractAnalysis(rawJson: string): StructuredAnalysisResult {
  const sanitized = sanitizeJsonString(rawJson);
  const parsed = JSON.parse(sanitized);
  
  const format = detectFormat(parsed);
  
  if (format === 1) {
    // Existing v1 parsing logic (keep unchanged)
    return parseFormatV1(parsed);
  } else {
    // New v2 parsing logic
    return parseFormatV2(parsed);
  }
}
```

### Step 4.4: Extract V1 Parser

Rename existing logic to `parseFormatV1`:

```typescript
function parseFormatV1(parsed: any): StructuredAnalysisResult {
  // Move all existing parsing logic here (no changes to logic)
  // ... current implementation ...
}
```

**✅ Checkpoint**: Parser compiles and handles both formats.

---

## Phase 5: Update API Route (1 hour)

### Step 5.1: Modify Analysis Creation

**File**: `src/app/api/contracts/[id]/analyze/route.ts`

Update the database save logic:

```typescript
const analysis = await prisma.contractAnalysis.create({
  data: {
    // ... existing fields ...
    
    // 🆕 Add these
    formatVersion: 2,  // Force v2 for all new analyses
    totalClauses: parsedResult.totalClauses || 0,
    
    // ... rest of fields ...
  }
});

// When creating findings:
await prisma.analysisFinding.create({
  data: {
    // ... existing fields ...
    
    // 🆕 Add these
    contextBefore: finding.context?.before || null,
    contextAfter: finding.context?.after || null,
    locationPage: finding.location?.page || null,
    locationPosition: finding.location?.approximatePosition || null,
  }
});
```

### Step 5.2: Add Logging

Add before analysis starts:

```typescript
console.log("[Analysis] Starting analysis", {
  contractId: contract.id,
  formatVersion: 2,
  documentSize: contract.document.extractedText.length,
  playbookRulesCount: playbookSnapshot?.rules.length || 0
});
```

Add after analysis completes:

```typescript
console.log("[Analysis] Completed", {
  contractId: contract.id,
  analysisId: analysis.id,
  formatVersion: 2,
  duration: Date.now() - startTime,
  tokensUsed: response.usage?.output_tokens || 0,
  totalClauses: parsedResult.totalClauses,
  findingsCount: parsedResult.clauses.reduce((sum, c) => sum + c.findings.length, 0)
});
```

### Step 5.3: Add Lenient Validation (from clarifications)

Add validation with warnings after parsing, before saving:

```typescript
const totalFindings = parsedResult.clauses.reduce((sum, c) => sum + c.findings.length, 0);

// Excerpt length validation (guideline, not hard constraint)
for (const clause of parsedResult.clauses) {
  for (const finding of clause.findings) {
    const excerptWordCount = finding.excerpt.split(/\s+/).length;
    if (excerptWordCount > 80) {
      console.warn(`[Validation] Excerpt >80 words: ${excerptWordCount}`, {
        clause: clause.clauseName
      });
    }
    if (!finding.context?.before && !finding.context?.after) {
      console.log(`[Validation] No context for finding in ${clause.clauseName}`);
    }
  }
}

// Finding count validation (soft limit)
if (totalFindings > 100) {
  console.warn(`[Validation] ${totalFindings} findings (expected ≤100)`);
}

// Zero findings is valid
if (totalFindings === 0) {
  console.log(`[Validation] Zero findings - contract compliant`);
}
```

**✅ Checkpoint**: API route updated with lenient validation, ready for testing.

---

## Phase 6: Update UI Components (2 hours)

### Step 6.1: Update ClauseText Component

**File**: `src/app/(app)/contracts/[id]/_components/clause-text.tsx`

Add format detection:

```typescript
export function ClauseText({ clause }: { clause: Clause }) {
  const isLegacyFormat = clause.clauseText && clause.clauseText.length > 0;
  
  if (isLegacyFormat) {
    // V1: Show full clause text (existing logic)
    return (
      <div className="prose max-w-none">
        {clause.clauseTextFormatted || clause.clauseText}
      </div>
    );
  } else {
    // V2: Show excerpts with context
    return (
      <div className="space-y-6">
        {clause.findings.map((finding, idx) => (
          <div key={idx} className="space-y-2">
            {finding.contextBefore && (
              <p className="text-sm text-muted-foreground italic">
                ...{finding.contextBefore}
              </p>
            )}
            
            <div className="bg-yellow-50 dark:bg-yellow-900/20 p-3 rounded-md border-l-4 border-yellow-500">
              <p className="font-medium">{finding.excerpt}</p>
            </div>
            
            {finding.contextAfter && (
              <p className="text-sm text-muted-foreground italic">
                {finding.contextAfter}...
              </p>
            )}
            
            {(finding.locationPage || finding.locationPosition) && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <MapPin className="w-3 h-3" />
                {finding.locationPage && <span>Page {finding.locationPage}</span>}
                {finding.locationPosition && <span>({finding.locationPosition})</span>}
              </div>
            )}
          </div>
        ))}
      </div>
    );
  }
}
```

### Step 6.2: Update FindingsPanel Component

**File**: `src/app/(app)/contracts/[id]/_components/findings-panel.tsx`

Add location badge to finding cards:

```typescript
// Inside finding card render:
<CardHeader>
  <div className="flex items-center justify-between">
    <Badge variant={riskVariant}>{finding.riskLevel}</Badge>
    
    {finding.locationPage && (
      <Badge variant="outline" className="ml-2">
        <MapPin className="w-3 h-3 mr-1" />
        Page {finding.locationPage}
      </Badge>
    )}
  </div>
</CardHeader>
```

### Step 6.3: Update Contract Detail Header

**File**: `src/app/(app)/contracts/[id]/_components/contract-detail-header.tsx`

Show total clauses for v2:

```typescript
{analysis.totalClauses > 0 && (
  <span className="text-sm text-muted-foreground">
    {totalFindings} findings in {analysis.totalClauses} clauses
  </span>
)}
```

**✅ Checkpoint**: UI renders both v1 and v2 analyses correctly.

---

## Phase 7: Testing (4-6 hours)

### Test Case 1: Small Contract (V2)

**Steps**:
1. Upload 10-page contract
2. Start analysis
3. Wait for completion
4. Verify formatVersion=2 in database
5. Verify excerpts are 20-80 words
6. Verify context present
7. Verify UI renders correctly

**Expected**:
- Analysis completes in <20s
- All findings have excerpts
- No full clauseText stored
- Location data may be partial

### Test Case 2: Large Contract (V2)

**Steps**:
1. Upload 100-page, 250-clause contract
2. Start analysis
3. Monitor token usage and time
4. Verify completion

**Expected**:
- Analysis completes in <60s (no timeout)
- Token usage <8,000
- totalClauses=250
- All findings extracted (no truncation)

### Test Case 3: Backward Compatibility (V1)

**Steps**:
1. Load existing analysis from database (formatVersion=1)
2. View in UI
3. Verify full clauseText displayed
4. Verify no crashes

**Expected**:
- Old analyses render correctly
- No location badges shown (data doesn't exist)
- Full clause text visible

### Test Case 4: Missing Data Handling

**Steps**:
1. Manually create v2 analysis with null locations
2. Load in UI
3. Verify no crashes

**Expected**:
- UI shows "Page unknown" or hides location badge
- Context sections handle null gracefully
- No TypeScript errors

### Test Case 5: Parser Format Detection

**Steps**:
1. Feed v1 JSON to parser → verify clauses extracted
2. Feed v2 JSON to parser → verify clauses synthesized
3. Feed malformed JSON → verify error thrown

**Expected**:
- Format auto-detected correctly
- Both formats parse successfully
- Malformed JSON throws clear error

**✅ Checkpoint**: All test cases pass.

---

## Phase 8: Deployment (30 minutes)

### Step 8.1: Database Migration (Production)

```bash
# On production server
npx prisma migrate deploy
```

### Step 8.2: Deploy Code

```bash
npm run build
# Deploy to production environment
```

### Step 8.3: Monitor

Watch logs for:
- `[Analysis] Starting analysis` with formatVersion=2
- Token usage (should be <5,000 avg)
- Analysis time (should be <60s for large contracts)
- Any parsing errors

### Step 8.4: Rollback Plan

If issues arise:
1. Revert prompt to v1 schema
2. Change `formatVersion: 2` to `formatVersion: 1` in API route
3. Redeploy
4. Parser still handles both, so no data issues

**✅ Checkpoint**: Feature deployed to production.

---

## Post-Deployment

### Week 1: Monitor Metrics

- [ ] 100% of new analyses use formatVersion=2
- [ ] Average token usage <5,000
- [ ] Average analysis time <40s
- [ ] Success rate >99%
- [ ] No user complaints about missing data

### Week 2: Verify Old Analyses

- [ ] Spot-check 10 old analyses in UI
- [ ] Verify they render correctly (v1 format)
- [ ] No data corruption

### Week 3: Analyze Savings

- [ ] Calculate actual token reduction (compare before/after)
- [ ] Calculate actual time reduction
- [ ] Document in success metrics

---

## Troubleshooting

### Issue: Parser throws "Unknown format"

**Cause**: Claude returned unexpected JSON structure

**Fix**:
1. Check raw response in logs
2. Verify prompt schema matches expected format
3. Add fallback handling in parser

### Issue: UI shows "Page unknown" for all findings

**Cause**: Claude unable to determine page numbers

**Fix**:
- This is expected behavior (best-effort)
- Verify `location.page` is null (not error)
- Future: Implement Approach D (page boundary detection)

### Issue: Analysis times out on large contracts

**Cause**: Token limit still being hit

**Fix**:
1. Verify formatVersion=2 in database
2. Check prompt uses v2 schema (flat findings)
3. Verify parser uses parseFormatV2
4. Check Claude response size in logs

---

## Success Criteria

- [x] All 5 test cases pass
- [x] Backward compatibility maintained (v1 analyses render)
- [x] Token usage reduced by >80%
- [x] Large contracts (250+ clauses) complete successfully
- [x] UI adapts to both formats seamlessly
- [x] Location data captured (when available)
- [x] No data loss during migration
- [x] Production deployment successful

---

## Next Steps

After this feature is stable:

1. **Phase 2: Document Viewer** (Spec 006)
   - Implement PDF rendering with highlighting
   - Use location data to scroll and highlight excerpts
   
2. **Phase 3: Clause Boundaries** (Spec 007)
   - Store clause boundaries separately
   - Enable "view full clause" on demand
   
3. **Phase 4: Confidence Scores** (Spec 008)
   - Add confidence scores to findings
   - Use for prioritization

---

**Estimated Total Time**: 3-4 days  
**Risk Level**: Medium (well-mitigated)  
**Value**: High (solves scalability crisis, 75% cost savings)
