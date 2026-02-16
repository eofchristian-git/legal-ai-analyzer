# Feature Spec: Deviation-Focused Contract Analysis

**Feature ID**: 005-deviation-focused-analysis  
**Status**: Draft  
**Created**: 2026-02-13  
**Last Updated**: 2026-02-16

## Overview

Transform contract analysis from extracting full clause text to extracting only problematic deviations. This reduces token usage by ~90%, eliminates truncation issues on large contracts, and creates a foundation for a future document viewer with precise highlighting.

## Clarifications

### Session 2026-02-16

- Q: If Claude returns an excerpt that exceeds 80 words (e.g., 100 words), what should the API do? → A: Accept the excerpt as-is and log a warning (lenient validation)
- Q: If Claude returns a finding where BOTH context.before and context.after are null (no context at all), what should the API do? → A: Accept the finding and display excerpt alone without context
- Q: If Claude returns 120 findings for a single contract (exceeding the 100 finding limit), what should the API do? → A: Accept all findings and log a warning about exceeding expected limit
- Q: During deployment, if an analysis is currently in progress (status="analyzing"), should it complete as formatVersion=1 or formatVersion=2? → A: Complete as formatVersion=1 (old format) - analyses in progress use old prompt/parser
- Q: If Claude returns an empty findings array (0 findings) for a contract, is this considered a successful analysis or an error condition? → A: Successful analysis - contract is compliant (0 findings is valid)

## Problem Statement

### Current Issues

1. **Token Inefficiency**: Currently extracting 500+ words per clause × 20 clauses = 10,000+ words in API responses
2. **Large Contract Failures**: 100-page contracts with 200+ clauses hit 32K token limit and fail to complete
3. **Redundant Data**: Both full `clauseText` and finding `excerpt` are extracted, duplicating content
4. **Poor UX**: Users must read entire clauses to find the 2-3 problematic sentences
5. **Scalability Wall**: Current approach cannot scale beyond ~50 clauses before truncation

### User Impact

**Legal team reviewing 80-page contract:**
- ❌ **Current**: Analysis times out, partial results, must re-run
- ✅ **Proposed**: Analysis completes in 30s, all findings extracted

**Paralegal triaging findings:**
- ❌ **Current**: Reads 300-word clause to find problematic sentence
- ✅ **Proposed**: Sees exact 25-word problematic passage immediately

## User Scenarios

### Scenario 1: Large Contract Analysis

**User**: Corporate counsel  
**Context**: Reviewing 120-page master services agreement with 250 clauses  
**Current Experience**:
1. Uploads contract, starts analysis
2. Analysis runs for 2 minutes, hits token limit
3. Gets partial results (first 40 clauses only)
4. Must manually review remaining 210 clauses

**Desired Experience**:
1. Uploads contract, starts analysis
2. Analysis completes in 45 seconds
3. Gets all 35 findings across all 250 clauses
4. Each finding shows exact problematic passage with context
5. Can click finding to see it in context (future: highlighted in PDF)

**Success Criteria**:
- ✅ Analysis completes for 250-clause contracts
- ✅ All findings extracted, none truncated
- ✅ Analysis time < 60 seconds

### Scenario 2: Rapid Triage

**User**: Paralegal  
**Context**: Triaging 15 findings from vendor contract  
**Current Experience**:
1. Opens finding #1
2. Reads 400-word clause text
3. Searches visually for the problematic part
4. Takes 2-3 minutes per finding = 30-45 minutes total

**Desired Experience**:
1. Opens finding #1
2. Immediately sees 30-word problematic passage highlighted
3. Reads context (before/after text) to understand
4. Makes triage decision in 30 seconds
5. Completes all 15 findings in 10 minutes

**Success Criteria**:
- ✅ Problematic passage is <50 words
- ✅ Context includes 2-3 sentences before/after
- ✅ No need to read full clause for triage

### Scenario 3: Future Document Viewer

**User**: Contract manager  
**Context**: Reviewing findings in PDF with highlighting  
**Desired Experience**:
1. Opens contract PDF in viewer
2. Sees 12 findings in sidebar
3. Clicks "Inadequate Liability Cap" finding
4. PDF scrolls to page 5, highlights exact problematic text in red
5. Sees summary and recommendation in overlay
6. Clicks "Accept" to mark as triaged

**Success Criteria**:
- ✅ Finding includes page number and position
- ✅ Excerpt text can be located in PDF for highlighting
- ✅ No full clause text needed for viewer

## Functional Requirements

### FR-1: Deviation-Only Extraction

**Description**: Claude extracts only problematic passages, not full clause text

**Requirements**:
- Extract 20-80 word excerpt of problematic passage
- Include 50-100 words of surrounding context (before + after)
- Include clause reference (number, name, position)
- Include approximate location (page, position on page)
- **Do NOT extract** full clause text

**Acceptance Criteria**:
- ✅ Average finding excerpt is 30-50 words
- ✅ Average context is 75-100 words
- ✅ No finding exceeds 150 words total
- ✅ `clauseText` field is no longer in response

**Validation Behavior**:
- Excerpt length 20-80 words is a guideline, not a hard constraint
- API accepts excerpts >80 words and logs warning for monitoring
- No automatic truncation or rejection of oversized excerpts
- Context fields (before/after) are optional; findings accepted even if both are null
- Excerpt alone is sufficient for display; context enhances understanding but is not required
- Finding count limits (100 per contract) are soft limits; excess findings are accepted and logged

### FR-2: Flat Finding Structure

**Description**: Findings are returned as flat list, not grouped by clause

**Requirements**:
- Findings array is top-level, not nested under clauses
- Each finding includes full clause reference
- Findings ordered by severity (RED → YELLOW → GREEN)
- Findings within same severity ordered by position
- Empty findings array (0 findings) is a valid successful outcome indicating contract compliance

**Acceptance Criteria**:
- ✅ Response has `findings: []` at top level
- ✅ No `clauses: []` array in response
- ✅ Each finding has `clauseReference` object
- ✅ Findings are properly sorted
- ✅ Analysis with 0 findings completes successfully with status="completed"

**Edge Case Handling**:
- Zero findings: Treated as successful analysis (contract is compliant with playbook rules)
- UI displays positive message: "No issues found - contract appears compliant"
- Not treated as error or suspicious condition requiring retry

### FR-3: Location Metadata

**Description**: Each finding includes location data for future highlighting

**Requirements**:
- Include approximate page number (if determinable)
- Include approximate position on page (top/middle/bottom)
- Store original document structure metadata
- Enable future exact positioning via text matching

**Acceptance Criteria**:
- ✅ Finding has `location: { page?, approximatePosition? }`
- ✅ Location data populated when available
- ✅ Null location values don't break UI

### FR-4: Backward Compatibility

**Description**: Existing analyses continue to work during migration

**Requirements**:
- Keep `clauseText` field optional in schema
- Parser handles both old (clause-grouped) and new (flat) formats
- UI displays both old and new format analyses
- Migration script available to upgrade old analyses
- In-progress analyses during deployment complete as formatVersion=1 (no mid-flight format change)

**Acceptance Criteria**:
- ✅ Old analyses display correctly in UI
- ✅ New analyses use new format
- ✅ No data loss during migration
- ✅ Users see no disruption
- ✅ In-progress analyses at deployment time complete successfully with old format

**Deployment Behavior**:
- Analyses with status="analyzing" at deployment time use old prompt/parser (formatVersion=1)
- Only new analyses started after deployment use new format (formatVersion=2)
- Clean separation prevents parser failures during rollout

### FR-5: Token Efficiency

**Description**: Response token usage is drastically reduced

**Requirements**:
- Maximum response should be <8,000 tokens (down from 32,000)
- Support contracts with 500+ clauses
- Analysis completes without truncation
- Response time improves due to smaller payloads

**Acceptance Criteria**:
- ✅ 100-clause contract uses <5,000 response tokens
- ✅ 250-clause contract completes successfully
- ✅ No truncation warnings in logs
- ✅ Average analysis time reduces by 20%

## Key Entities

### Finding (New Structure)

```typescript
interface Finding {
  id: string;                    // UUID
  contractAnalysisId: string;    // FK to ContractAnalysis
  
  // Clause reference
  clauseReference: {
    number: string;              // e.g. "3.1", "" if missing
    name: string;                // e.g. "Limitation of Liability"
    position: number;            // Sequential 1-based index
  };
  
  // The problematic passage
  excerpt: string;               // 20-80 words, VERBATIM from contract
  
  // Context for understanding
  context: {
    before: string | null;       // 30-50 words before excerpt
    after: string | null;        // 30-50 words after excerpt
  };
  
  // Location for future highlighting
  location: {
    page: number | null;         // Approximate page number
    approximatePosition: string | null; // "top" | "middle" | "bottom"
  };
  
  // Analysis
  riskLevel: "RED" | "YELLOW" | "GREEN";
  matchedRuleTitle: string;
  summary: string;
  fallbackText: string;
  whyTriggered: string;
  
  // Triage
  triageDecision: "accept" | "reject" | "negotiate" | null;
  triageNote: string | null;
  triagedBy: string | null;
  triagedAt: DateTime | null;
  
  createdAt: DateTime;
}
```

### ContractAnalysis (Modified)

```typescript
interface ContractAnalysis {
  // ... existing fields ...
  
  // NEW: Total clause count (not storing clause text anymore)
  totalClauses: number;
  
  // NEW: Format version for migration
  formatVersion: 1 | 2;  // 1 = old clause-based, 2 = new deviation-based
}
```

## Non-Functional Requirements

### Performance
- Analysis of 100-clause contract: <30 seconds
- Analysis of 250-clause contract: <60 seconds
- Token usage reduction: >85%
- UI rendering: <100ms for finding list

### Scalability
- Support contracts up to 500 clauses
- Support up to 100 findings per contract (soft limit; higher counts accepted with warning)
- No truncation on large contracts
- Graceful degradation if limits exceeded
- Findings exceeding 100 are logged but not rejected; UI should handle pagination

### Reliability
- Parser handles both old and new formats
- Missing location data doesn't break UI
- Empty context fields display gracefully (findings shown with excerpt only)
- Missing context (both before/after null) does not reject findings
- Zero findings is a valid successful outcome (contract compliant)
- Migration script is idempotent

## Future Enhancements

### Phase 2: Document Viewer with Highlighting
- PDF rendering with react-pdf
- Highlight excerpts based on finding.excerpt text match
- Click finding to scroll and highlight
- Overlay showing summary and recommendation
- Color-code by risk level (red/yellow/green)

### Phase 3: AI-Powered Clause Extraction
- Use Claude to identify clause boundaries
- Store as separate ClauseBoundary table
- Link findings to clause boundaries
- Enable "view full clause" on demand

### Phase 4: Comparative Analysis
- Compare findings across contract versions
- Show which deviations were negotiated away
- Track negotiation success rates
- Learn from historical patterns

## Open Questions

1. **Q**: Should we store original extracted text anywhere for backup?
   - **A**: Yes, keep in Document.extractedText (already exists)

2. **Q**: How to handle findings that span multiple clauses?
   - **A**: Create separate finding per clause, note relationship in summary

3. **Q**: What if Claude can't determine page numbers?
   - **A**: Location fields are nullable, UI handles gracefully

4. **Q**: Should we delete old clause-based analyses?
   - **A**: No, keep for audit trail. Mark as formatVersion=1.

5. **Q**: How to migrate 1000+ existing analyses?
   - **A**: Migration script, run in batches, mark formatVersion appropriately

## Success Metrics

### Technical Metrics
- **Token Usage**: Reduce from avg 15K to <3K per analysis (80% reduction)
- **Completion Rate**: 99% of contracts analyze successfully (up from 85%)
- **Analysis Time**: Reduce avg time from 75s to 35s (50% improvement)
- **Error Rate**: <1% parsing failures (down from ~5%)

### User Metrics
- **Triage Speed**: Reduce avg triage time from 2min to 30s per finding
- **User Satisfaction**: Survey score >4.5/5 on new format
- **Adoption Rate**: 90% of users prefer new format in A/B test

### Business Metrics
- **API Costs**: Reduce Claude API costs by 75%
- **Support Tickets**: Reduce "analysis failed" tickets by 80%
- **Contract Size**: Support 3x larger contracts than before

## Assumptions

1. Claude can reliably extract 20-80 word excerpts without including unnecessary context
2. Users prefer seeing problematic passages over full clause text
3. Future document viewer is feasible with current location metadata
4. Migration from old format is acceptable risk
5. Surrounding context (before/after) provides sufficient understanding

## Constraints

1. Must maintain backward compatibility during transition
2. Cannot break existing UI for old analyses
3. Must complete migration within 1 sprint
4. Should not require database schema changes that break prod
5. Parser must handle both formats indefinitely
6. In-progress analyses during deployment must complete without disruption (use old format)

## Dependencies

1. Current contract analysis system (001-contract-review-findings)
2. Prisma schema and migrations
3. Claude API (src/lib/claude.ts)
4. Analysis parser (src/lib/analysis-parser.ts)
5. UI components (clause-list, clause-text, findings-panel)

## Risks & Mitigation

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| Users miss full clause context | High | Medium | Provide "view in document" link, store doc text |
| Migration breaks old analyses | Critical | Low | Test thoroughly, keep formatVersion flag |
| Claude struggles with excerpts | High | Low | Prompt engineering, fallback to full clause |
| Location data unreliable | Medium | Medium | Make fields nullable, UI handles gracefully |
| Performance doesn't improve | Medium | Low | Benchmark before/after, rollback if needed |

## Alternatives Considered

### Alternative 1: Hybrid Approach
**Description**: Extract both full clause and excerpts  
**Pros**: Maximum flexibility, easy rollback  
**Cons**: Doesn't solve token problem, doubles data storage  
**Decision**: Rejected - doesn't address core problem

### Alternative 2: Clause-on-Demand
**Description**: Extract only clause references, fetch full text later  
**Pros**: Minimal initial token usage  
**Cons**: Requires second API call, original doc must be re-parseable  
**Decision**: Deferred to Phase 3

### Alternative 3: Client-Side Extraction
**Description**: Have frontend extract excerpts from full clauses  
**Pros**: No prompt changes needed  
**Cons**: Still extracts full text, doesn't solve token problem  
**Decision**: Rejected - doesn't reduce API costs

## References

- [CLAUDE.md](../../CLAUDE.md) - AI prompt system and reliability patterns
- [constitution.md](../../.specify/memory/constitution.md) - Data integrity and AI reliability principles
- [001-contract-review-findings](../001-contract-review-findings/spec.md) - Original contract analysis design
