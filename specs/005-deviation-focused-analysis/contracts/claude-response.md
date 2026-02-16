# Contract: Claude API Response Format (V2)

**Feature**: 005-deviation-focused-analysis  
**Date**: 2026-02-13  
**Format Version**: 2 (Deviation-Focused)

---

## Overview

This document defines the expected JSON response format from Claude when analyzing contracts using the new deviation-focused approach. The response contains a flat list of findings (not grouped by clause), with each finding including excerpt, context, and location metadata.

---

## Response Schema

### Top-Level Structure

```json
{
  "executiveSummary": "string",
  "overallRisk": "low" | "medium" | "high",
  "totalClauses": number,
  "findings": Finding[],
  "negotiationStrategy": NegotiationItem[]
}
```

### Field Definitions

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `executiveSummary` | string | Yes | 2-3 sentence overview of contract risk posture |
| `overallRisk` | enum | Yes | Overall risk level: "low", "medium", or "high" |
| `totalClauses` | number | Yes | Total number of clauses identified in the document |
| `findings` | array | Yes | Flat list of all findings (not grouped by clause) |
| `negotiationStrategy` | array | Yes | Prioritized negotiation recommendations |

---

## Finding Object

### Structure

```json
{
  "clauseReference": {
    "number": "string",
    "name": "string",
    "position": number
  },
  "excerpt": "string",
  "context": {
    "before": "string | null",
    "after": "string | null"
  },
  "location": {
    "page": number | null,
    "approximatePosition": "top" | "middle" | "bottom" | null
  },
  "riskLevel": "GREEN" | "YELLOW" | "RED",
  "matchedRuleTitle": "string",
  "summary": "string",
  "fallbackText": "string",
  "whyTriggered": "string"
}
```

### Field Definitions

#### clauseReference (object, required)

Identifies the clause where this finding was detected.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `number` | string | Yes | Original clause number from document (e.g., "3.1", "Article 5"). Use empty string `""` if document has no numbering. |
| `name` | string | Yes | Name/title of the clause (e.g., "Limitation of Liability") |
| `position` | number | Yes | Sequential 1-based index of the clause in the document (1, 2, 3, ...) |

**Example**:
```json
{
  "number": "7.2",
  "name": "Indemnification Obligations",
  "position": 15
}
```

#### excerpt (string, required)

The exact problematic passage from the contract, word-for-word.

**Requirements**:
- Length: 20-80 words
- Must be verbatim from the document (no paraphrasing)
- Should capture the specific problematic text, not the entire clause
- Should be a complete sentence or logical phrase

**Example**:
```json
"excerpt": "Vendor shall indemnify Client for any and all claims, including those arising from Vendor's gross negligence, with no cap on liability."
```

#### context (object, required)

Surrounding text to provide understanding of the excerpt's context.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `before` | string or null | No | 30-50 words appearing immediately before the excerpt. Null if not available. |
| `after` | string or null | No | 30-50 words appearing immediately after the excerpt. Null if not available. |

**Example**:
```json
{
  "before": "The parties agree that in the event of any dispute or claim arising from this Agreement, the following indemnification provisions shall apply.",
  "after": "This indemnification obligation shall survive termination of this Agreement for a period of three (3) years."
}
```

#### location (object, required)

Approximate location of the finding in the document for future highlighting.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `page` | number or null | No | Approximate page number (1-indexed) where the finding appears. Null if not determinable. |
| `approximatePosition` | enum or null | No | Position on the page: "top" (first third), "middle" (second third), "bottom" (last third). Null if not determinable. |

**Example**:
```json
{
  "page": 12,
  "approximatePosition": "middle"
}
```

**Note**: Location data is best-effort. Claude should attempt to determine page and position based on document structure, but null values are acceptable when uncertain.

#### riskLevel (enum, required)

Severity of the finding.

**Values**:
- `"GREEN"`: Low risk, acceptable or favorable term
- `"YELLOW"`: Medium risk, should be reviewed or negotiated
- `"RED"`: High risk, must be addressed before signing

#### matchedRuleTitle (string, required)

Title of the playbook rule that triggered this finding, or a general best practice name if no playbook is configured.

**Example**:
```json
"matchedRuleTitle": "Indemnification Cap Required"
```

#### summary (string, required)

Plain-language summary of the issue for non-legal stakeholders.

**Requirements**:
- 1-2 sentences
- No legal jargon
- Explain the business impact

**Example**:
```json
"summary": "The vendor has unlimited liability for indemnification, which could expose them to catastrophic financial risk beyond the value of the contract."
```

#### fallbackText (string, required)

Recommended alternative contract language based on the playbook rule or best practice.

**Example**:
```json
"fallbackText": "Vendor's indemnification obligations shall be capped at the greater of (i) the total fees paid under this Agreement in the twelve (12) months preceding the claim or (ii) $1,000,000."
```

#### whyTriggered (string, required)

Explanation of why this rule was triggered, linking back to the specific playbook rule or standard.

**Example**:
```json
"whyTriggered": "Playbook rule 'Indemnification Cap Required' states that vendor liability must be capped at 12 months of fees or $1M. This clause has no cap, triggering a RED risk finding."
```

---

## NegotiationItem Object

### Structure

```json
{
  "priority": "P1" | "P2" | "P3",
  "title": "string",
  "description": "string",
  "clauseRef": "string | null"
}
```

### Field Definitions

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `priority` | enum | Yes | P1 = Critical/must-address, P2 = Important/should-address, P3 = Nice-to-have/minor |
| `title` | string | Yes | Concise title for this negotiation point |
| `description` | string | Yes | Detailed negotiation guidance and reasoning |
| `clauseRef` | string or null | No | The clause name or number this point relates to, or null if general |

---

## Complete Example

```json
{
  "executiveSummary": "This vendor services agreement presents moderate risk. Key concerns include unlimited indemnification liability, weak confidentiality protections, and one-sided termination rights. These should be addressed before signing.",
  "overallRisk": "medium",
  "totalClauses": 42,
  "findings": [
    {
      "clauseReference": {
        "number": "7.2",
        "name": "Indemnification Obligations",
        "position": 15
      },
      "excerpt": "Vendor shall indemnify Client for any and all claims, including those arising from Vendor's gross negligence, with no cap on liability.",
      "context": {
        "before": "The parties agree that in the event of any dispute or claim arising from this Agreement, the following indemnification provisions shall apply.",
        "after": "This indemnification obligation shall survive termination of this Agreement for a period of three (3) years."
      },
      "location": {
        "page": 12,
        "approximatePosition": "middle"
      },
      "riskLevel": "RED",
      "matchedRuleTitle": "Indemnification Cap Required",
      "summary": "The vendor has unlimited liability for indemnification, which could expose them to catastrophic financial risk beyond the value of the contract.",
      "fallbackText": "Vendor's indemnification obligations shall be capped at the greater of (i) the total fees paid under this Agreement in the twelve (12) months preceding the claim or (ii) $1,000,000.",
      "whyTriggered": "Playbook rule 'Indemnification Cap Required' states that vendor liability must be capped at 12 months of fees or $1M. This clause has no cap, triggering a RED risk finding."
    },
    {
      "clauseReference": {
        "number": "9.1",
        "name": "Confidentiality",
        "position": 18
      },
      "excerpt": "Vendor shall maintain confidentiality of Client information for a period of two (2) years after disclosure.",
      "context": {
        "before": "Each party acknowledges that it may receive confidential information from the other party during the term of this Agreement.",
        "after": "Confidential information does not include information that is publicly available or independently developed."
      },
      "location": {
        "page": 15,
        "approximatePosition": "top"
      },
      "riskLevel": "YELLOW",
      "matchedRuleTitle": "Confidentiality Term - 5 Years Minimum",
      "summary": "The confidentiality obligation expires after only 2 years, which may not adequately protect sensitive business information.",
      "fallbackText": "Vendor shall maintain confidentiality of Client information for a period of five (5) years after disclosure, or indefinitely for trade secrets.",
      "whyTriggered": "Playbook rule 'Confidentiality Term - 5 Years Minimum' requires confidentiality obligations to last at least 5 years. This clause only provides 2 years, triggering a YELLOW risk finding."
    },
    {
      "clauseReference": {
        "number": "12.3",
        "name": "Termination for Convenience",
        "position": 25
      },
      "excerpt": "Client may terminate this Agreement at any time for any reason with thirty (30) days written notice.",
      "context": {
        "before": "Either party may terminate this Agreement for cause upon written notice if the other party breaches a material term.",
        "after": null
      },
      "location": {
        "page": null,
        "approximatePosition": null
      },
      "riskLevel": "YELLOW",
      "matchedRuleTitle": "Mutual Termination Rights",
      "summary": "Only the client has the right to terminate for convenience, creating an imbalance in termination rights.",
      "fallbackText": "Either party may terminate this Agreement for convenience with ninety (90) days written notice.",
      "whyTriggered": "Playbook rule 'Mutual Termination Rights' requires that termination for convenience rights be mutual. This clause only grants such rights to the client, triggering a YELLOW risk finding."
    }
  ],
  "negotiationStrategy": [
    {
      "priority": "P1",
      "title": "Cap Indemnification Liability",
      "description": "The unlimited indemnification liability in Section 7.2 is the highest-priority issue. Push for a cap at 12 months of fees or $1M, whichever is greater. This is a deal-breaker if not addressed. Be prepared to walk away if client refuses any cap.",
      "clauseRef": "7.2 - Indemnification Obligations"
    },
    {
      "priority": "P2",
      "title": "Extend Confidentiality Term",
      "description": "Request extending the confidentiality term from 2 years to 5 years in Section 9.1. Emphasize the sensitive nature of technical information that will be shared. Offer to agree to mutual 5-year terms to show good faith.",
      "clauseRef": "9.1 - Confidentiality"
    },
    {
      "priority": "P2",
      "title": "Mutual Termination Rights",
      "description": "Seek mutual termination for convenience rights in Section 12.3. Propose that both parties have 90-day termination rights to balance the relationship. If client resists, request at least a 90-day notice period (vs. current 30 days) to allow for project wind-down.",
      "clauseRef": "12.3 - Termination for Convenience"
    },
    {
      "priority": "P3",
      "title": "Review Force Majeure Scope",
      "description": "The force majeure clause (Section 14.5) is narrowly defined. Consider requesting expansion to include cyber attacks and supply chain disruptions, which are increasingly common. This is a nice-to-have but not critical.",
      "clauseRef": "14.5 - Force Majeure"
    }
  ]
}
```

---

## Ordering and Sorting

### Findings Array Ordering

Findings should be ordered by:
1. **Primary**: Risk level (RED → YELLOW → GREEN)
2. **Secondary**: Clause position (1, 2, 3, ...)

This ensures critical issues appear first.

**Example**:
```json
"findings": [
  { "riskLevel": "RED", "clauseReference": { "position": 15 }, ... },
  { "riskLevel": "RED", "clauseReference": { "position": 22 }, ... },
  { "riskLevel": "YELLOW", "clauseReference": { "position": 8 }, ... },
  { "riskLevel": "YELLOW", "clauseReference": { "position": 18 }, ... },
  { "riskLevel": "GREEN", "clauseReference": { "position": 3 }, ... }
]
```

### NegotiationStrategy Array Ordering

Negotiation items should be ordered by priority: P1 → P2 → P3.

---

## Validation Rules

When parsing the response, validate:

1. **Required Fields**: All required fields are present
2. **Excerpt Length**: 20 ≤ excerpt.length ≤ 80 words
3. **Context Length**: Each context field ≤ 200 characters (if present)
4. **Position**: `clauseReference.position` > 0
5. **Location Page**: `location.page` > 0 (if present)
6. **Location Position**: Must be "top", "middle", or "bottom" (if present)
7. **Risk Level**: Must be "GREEN", "YELLOW", or "RED"
8. **Priority**: Must be "P1", "P2", or "P3"

**Fallback Behavior**:
- If validation fails, log the error but continue parsing
- Use fallback values (e.g., "" for missing excerpt)
- Mark analysis with warning flag for review

---

## Comparison: V1 vs V2

### V1 (Old Format)

```json
{
  "clauses": [
    {
      "clauseNumber": "7.2",
      "clauseName": "Indemnification",
      "clauseText": "500+ words of full clause text...",
      "position": 15,
      "findings": [
        {
          "riskLevel": "RED",
          "excerpt": "Duplicate of part of clauseText",
          ...
        }
      ]
    }
  ]
}
```

**Problems**:
- 🔴 Duplicates content (clauseText + excerpt)
- 🔴 Averages 15K tokens per response
- 🔴 Fails on large contracts (>50 clauses)
- 🔴 Hard to sort findings by severity

### V2 (New Format)

```json
{
  "totalClauses": 42,
  "findings": [
    {
      "clauseReference": { "number": "7.2", "name": "Indemnification", "position": 15 },
      "excerpt": "20-80 words problematic passage",
      "context": { "before": "...", "after": "..." },
      "location": { "page": 12, "approximatePosition": "middle" },
      ...
    }
  ]
}
```

**Benefits**:
- ✅ No duplication (excerpt only, no full clauseText)
- ✅ Averages 3K tokens per response (80% reduction)
- ✅ Handles 500+ clause contracts
- ✅ Findings naturally sorted by severity
- ✅ Location data enables future highlighting

---

## Prompt Instructions (Summary)

The prompt to Claude should include these instructions:

> Analyze the contract clause by clause. For each problematic finding you identify:
> 
> 1. **Do NOT extract the full clause text** — we already have the original document
> 2. **Extract ONLY the problematic passage** (20-80 words, verbatim)
> 3. **Include surrounding context** (30-50 words before and after the excerpt)
> 4. **Estimate the location** (page number and position: top/middle/bottom)
> 5. **Return findings as a flat list**, not grouped by clause
> 6. **Include the total number of clauses** you identified in the document
> 
> Respond with ONLY valid JSON (no markdown, no code fences). Use this exact schema: [...]

See `src/lib/prompts.ts` for full prompt text.

---

## Error Handling

### Malformed JSON

If Claude returns invalid JSON:
1. Attempt sanitization (`sanitizeJsonString`)
2. If still invalid, log error and return 500
3. Save raw response to `rawAnalysis` field for debugging

### Missing Fields

If required fields are missing:
1. Log warning with field name
2. Use fallback values where possible
3. Continue processing (partial data better than none)

### Truncated Response

If response is truncated (max_tokens reached):
1. Log error with token count
2. Save partial data
3. Mark analysis with `incomplete: true` flag (future field)
4. Notify user to simplify contract or split analysis

---

## Future Enhancements

### Phase 2: Document Viewer

Location data will enable:
- Click finding → scroll to page
- Highlight exact excerpt in red/yellow/green
- Overlay showing summary and recommendation

### Phase 3: Clause Boundaries

Store clause boundaries separately:
- `ClauseBoundary` table with start/end positions
- Link findings to boundaries
- Enable "view full clause" on demand

### Phase 4: Confidence Scores

Add confidence scores to findings:
- `confidence: number` (0-1)
- Based on Claude's certainty
- Used for prioritization and review

---

## References

- Full prompt text: `src/lib/prompts.ts` → `buildContractReviewPrompt`
- Parser implementation: `src/lib/analysis-parser.ts` → `parseContractAnalysis`
- Skill definition: `skills/contract-review.md`
