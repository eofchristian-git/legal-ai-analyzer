# Research: Contract Review — Clause List & Findings

**Branch**: `001-contract-review-findings` | **Date**: 2026-02-11

## R1: Structured Output from Claude for Clause Segmentation

**Decision**: Use Claude's structured JSON output within the existing
SSE streaming pipeline. The prompt instructs Claude to return a JSON
array of clauses, each with a nested findings array.

**Rationale**: The current system already streams text from Claude and
parses it with regex in `analysis-parser.ts`. For structured findings,
we need deterministic, machine-parseable output. Claude supports JSON
mode via system prompt instruction. We keep the streaming transport
(SSE) for UX responsiveness but parse the full response as JSON after
stream completion.

**Alternatives considered**:
- *Tool-use / function-calling*: More structured but adds latency and
  complexity. Not needed when the output schema is simple and stable.
- *Multiple Claude calls (one per clause)*: More granular but far
  slower and more expensive. Single-pass preferred per spec assumption.
- *Regex parsing of markdown* (current approach): Fragile. Doesn't
  support nested findings or rule-level metadata. Replaced.

## R2: PDF Generation in Next.js (Server-Side)

**Decision**: Use `jspdf` for server-side PDF generation in the export
API route.

**Rationale**: `jspdf` is lightweight (~300KB), runs in Node.js without
a browser, and supports basic table layouts via `jspdf-autotable`. The
export is a simple findings report (cover page + table), not a complex
formatted document. No headless browser needed.

**Alternatives considered**:
- *Puppeteer / Playwright*: Full browser rendering. Overkill for a
  table report; adds 100+ MB dependency; hard to run in serverless.
- *@react-pdf/renderer*: React-based PDF. Good for complex layouts but
  adds React rendering overhead for a simple table.
- *pdfkit*: Similar to jspdf but less ecosystem for tables. jspdf +
  autotable is more established for tabular reports.

## R3: Triage Decision Persistence Strategy

**Decision**: Store triage decisions as a `triageDecision` field
directly on the `AnalysisFinding` model. No separate junction table.

**Rationale**: The spec confirms single-reviewer, per-finding decisions
with three values (Accept/Needs Review/Reject) plus null for
"Pending". A simple nullable string field on Finding avoids unnecessary
joins. The "finalized" flag lives on `ContractAnalysis` since it locks
all findings at once.

**Alternatives considered**:
- *Separate TriageDecision table*: Enables audit trail per decision
  change. Deferred to Phase 2 (spec says replace-only, no history).
- *JSON blob on Analysis*: Loses queryability. Rejected per
  clarification (separate records chosen).

## R4: Playbook Version Governance — Snapshot Linkage

**Decision**: Store the `playbookSnapshotId` (the actual snapshot
record ID) on `ContractAnalysis` instead of just the version number
string. This enables direct foreign-key joins to retrieve the exact
rules used.

**Rationale**: The existing `playbookVersionId` field stores a string
version number. Linking to the actual snapshot record enables the UI to
show which specific rules were active and compare against the current
playbook to determine staleness.

**Alternatives considered**:
- *Copy rules into analysis at analysis time*: Fully self-contained but
  duplicates data already captured by PlaybookSnapshot. Rejected.
- *Keep version number only (current approach)*: Requires a lookup by
  version number to find the snapshot. Fragile if versions are reused.
  Rejected in favor of direct FK.

## R5: Three-Panel Layout Approach

**Decision**: Use a CSS grid layout with resizable panels via the
existing shadcn/ui `ResizablePanel` or a simple flex layout with fixed
proportions (25% / 40% / 35%).

**Rationale**: The three-panel layout is the primary interaction
surface. Fixed proportions work for Phase 1 (single-user desktop).
Resizable panels can be added later. The clause list panel uses
virtualization only if performance demands it (unlikely for ≤30 clauses).

**Alternatives considered**:
- *Tab-based layout* (one panel at a time): Loses context. Rejected per
  FR-005.
- *Two-panel with drawer*: Findings in a side drawer. Loses persistent
  visibility. Rejected.

## R6: Prompt Engineering for Structured Findings

**Decision**: Update the contract review prompt to request JSON output
with a specific schema. Each clause includes: clauseName, clauseText,
position, and a findings array. Each finding includes: riskLevel,
matchedRuleTitle, summary, fallbackText, whyTriggered, and the
playbook rule fields used for matching.

**Rationale**: The prompt must explicitly describe the output schema to
get reliable structured data. Including "whyTriggered" ensures
explainability per FR-009. Including the matched rule title enables the
UI to link findings back to playbook rules.

**Schema requested from Claude**:
```json
{
  "executiveSummary": "string",
  "overallRisk": "low|medium|high",
  "clauses": [
    {
      "clauseName": "string",
      "clauseText": "string (extracted from contract)",
      "position": 1,
      "findings": [
        {
          "riskLevel": "GREEN|YELLOW|RED",
          "matchedRuleTitle": "string (playbook rule title)",
          "summary": "string",
          "fallbackText": "string (recommended alternative language)",
          "whyTriggered": "string (explanation linking to rule)"
        }
      ]
    }
  ],
  "negotiationStrategy": "string"
}
```
