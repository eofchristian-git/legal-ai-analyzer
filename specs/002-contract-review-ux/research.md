# Research: Contract Review — Professional Legal UI/UX

**Feature**: 002-contract-review-ux  
**Date**: 2026-02-11

## Research Topics

All unknowns were resolved during the `/speckit.clarify` session. This document consolidates the decisions, rationale, and rejected alternatives for each.

---

### R-001: Negotiation Strategy Data Persistence

**Decision**: New `NegotiationItem` Prisma model with individual rows per priority item.

**Rationale**: Enables per-item querying, future annotation features (e.g. accepting/rejecting individual negotiation points), and consistent relational patterns with existing `AnalysisClause` / `AnalysisFinding` models.

**Alternatives Considered**:
- *JSON string in existing `negotiationStrategy` column* — Simplest, but prevents per-item operations and forces client-side parsing on every read. Rejected because the user explicitly chose structured storage.
- *Separate JSON column alongside Markdown* — Dual storage adds complexity; no clear advantage over dedicated model. Rejected.

---

### R-002: Clause Text Highlighting Mechanism

**Decision**: AI returns an explicit `excerpt` field per finding — a verbatim substring from the clause text. Frontend highlights by exact string match.

**Rationale**: Deterministic highlighting with zero client-side NLP. The AI already has the clause text in context, so returning a verbatim substring is low-cost. Exact string matching is simple, fast, and predictable.

**Alternatives Considered**:
- *Fuzzy/keyword matching against finding description* — Non-deterministic; would produce false highlights and confuse reviewers. Rejected.
- *No highlighting at all* — Misses the UX goal of visually connecting findings to their triggering text. Rejected.

**Implementation Notes**:
- The `excerpt` field is a `String` with `@default("")` on `AnalysisFinding`.
- Highlighting function: for each finding's excerpt, `text.indexOf(excerpt)` to find position, then split text at boundaries and wrap matched segments in `<mark>` with risk-coloured background.
- Overlapping excerpts: first-match-wins strategy. If two findings excerpt the same text region, only the first (by severity sort order) colours it.
- Graceful fallback: if `indexOf` returns -1, skip that finding's highlight silently.

---

### R-003: Legacy Negotiation Strategy Backward Compatibility

**Decision**: Legacy analyses (those with only a Markdown `negotiationStrategy` string and no `NegotiationItem` rows) render the Markdown as-is using the existing `MarkdownViewer` component. No data migration.

**Rationale**: Avoids risky retrospective parsing and preserves all existing analyses. New analyses automatically get structured items. Zero operational risk.

**Alternatives Considered**:
- *AI re-parsing migration* — High risk of incorrect parsing; requires API calls per existing analysis. Rejected.
- *Client-side heuristic parsing* — Unreliable; Markdown structure varies. Rejected.

---

### R-004: Colour Accessibility Strategy

**Decision**: Always pair colours with text labels and/or icons. Severity badges show "High" / "Medium" / "Low" text alongside red/amber/green colours. Triage banners show decision text ("Accepted", "Needs Review", "Rejected"). Priority badges show "Critical" / "Important" / "Nice-to-have".

**Rationale**: Meets WCAG 2.1 AA guidelines for colour-alone information. Low implementation cost — only requires updating existing label strings and ensuring new components follow the pattern.

**Alternatives Considered**:
- *Separate high-contrast mode toggle* — Over-engineered for current scale; adds settings UI complexity. Rejected for now.
- *Colours only* — Fails accessibility standards. Rejected.

---

### R-005: Clause Text Typeface Strategy

**Decision**: System serif font stack: `Georgia, 'Times New Roman', serif`.

**Rationale**: Zero external font dependencies. No network requests, no FOUT/FOIT, no layout shift. Georgia is universally available across Windows, macOS, and Linux, and is widely used in legal document rendering. `Times New Roman` as fallback is the canonical legal document typeface.

**Alternatives Considered**:
- *Google Fonts (e.g. Merriweather, Lora)* — Requires network fetch, adds 20-50KB, introduces layout shift during load. Rejected.
- *Sans-serif (keep current)* — Doesn't meet the "legal document" aesthetic goal. Rejected.

---

### R-006: Excerpt Highlighting Edge Cases

**Decision**: Best-effort highlighting with graceful fallback.

**Research Findings**:
- Claude's excerpt accuracy depends on prompt clarity. The prompt explicitly instructs: "excerpt MUST be an exact, verbatim substring of clauseText."
- In testing, Claude typically returns exact substrings when the instruction is clear.
- Edge case: Claude may occasionally include/omit whitespace or punctuation. Mitigation: `trim()` the excerpt before matching.
- Overlapping excerpts (two findings referencing the same passage): Handled by processing excerpts in severity order (RED first) and using a "consumed ranges" algorithm to prevent double-marking.

**Implementation Approach**:
1. Collect all `{ excerpt, riskLevel, summary }` triples from findings.
2. Sort by severity (RED first) for priority colouring.
3. For each excerpt, find all occurrences via `indexOf` (use first occurrence only).
4. Build a sorted list of `[start, end, riskLevel, summary]` ranges.
5. Merge overlapping ranges (higher severity wins).
6. Split original text at range boundaries and wrap matches in `<mark>` elements.

---

### R-007: NegotiationItem JSON Schema from Claude

**Research Findings**:
- Claude reliably returns JSON arrays when the schema is clearly specified in the prompt.
- The prompt must handle the transition: previously `negotiationStrategy` was a string, now it's an array.
- Parser must handle both: if Claude returns a string (fallback), treat as legacy. If array, parse as structured items.
- Default missing `priority` to `"P3"`.
- Default missing `clauseRef` to `null`.

**Prompt Schema**:
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

---

## Summary

All 7 research topics resolved. No NEEDS CLARIFICATION items remain. Ready for Phase 1 design.
