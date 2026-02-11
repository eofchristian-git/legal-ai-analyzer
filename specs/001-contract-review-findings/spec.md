# Feature Specification: Contract Review — Clause List & Findings

**Feature Branch**: `001-contract-review-findings`
**Created**: 2026-02-11
**Status**: Draft
**Input**: User description: "Phase 1 — Contract review changes (clause list + findings)"

## Clarifications

### Session 2026-02-11

- Q: What export formats should the system support? → A: PDF + CSV — PDF for sharing with stakeholders, CSV for spreadsheet-based triage and data manipulation.
- Q: Can triage decisions be changed after initial selection? → A: Decisions are freely changeable until the reviewer explicitly locks/finalizes the triage. Once finalized, decisions are read-only.
- Q: How are clauses stored in the data model? → A: Separate records — each clause is its own database record linked to the analysis, enabling per-clause navigation, linking, and future cross-contract comparison.
- Q: Is analysis history preserved when re-analyzing a contract? → A: Replace-only — new analysis overwrites the previous one (clauses, findings, triage decisions all deleted). No analysis history in Phase 1.
- Q: Can multiple team members triage the same contract? → A: Single reviewer — one person triages per contract. No concurrent editing or assignment in Phase 1.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Run Analysis & Triage Clause Findings (Priority: P1)

A legal reviewer uploads a contract document, triggers analysis, and
receives a clause-by-clause issue list that they can triage. Each
finding shows which playbook rule was violated, a risk level, a plain
language summary, and suggested fallback text. The reviewer works
through the list, marking each finding as "Accept", "Needs Review", or
"Reject".

**Why this priority**: This is the core workflow — without a structured
findings list legal cannot triage a contract. Everything else builds on
this.

**Independent Test**: Upload a contract PDF, run analysis, and verify
that a structured clause list with per-clause findings appears, each
finding linked to a playbook rule with risk level and fallback text.

**Acceptance Scenarios**:

1. **Given** a contract document has been uploaded and the playbook
   contains rules, **When** the user triggers analysis, **Then** the
   system produces a list of identified clauses, each with zero or more
   findings.
2. **Given** findings are displayed, **When** the user selects a clause
   in the left panel, **Then** the center panel scrolls to or highlights
   the clause text and the right panel shows its findings.
3. **Given** a finding is shown, **When** the user clicks "Accept",
   "Needs Review", or "Reject", **Then** the decision is saved and the
   finding's visual status updates immediately.
4. **Given** analysis completes, **Then** each finding includes: risk
   level, matched playbook rule title, summary sentence, and recommended
   fallback text.

---

### User Story 2 — Playbook Version Governance (Priority: P2)

When an analysis is run, the system records which playbook version was
used. The analysis results page clearly states "Analyzed with Playbook
v12" (or whichever version applies). If the playbook has been updated
since the analysis, the user sees a notice that the analysis may be
outdated.

**Why this priority**: Legal teams need auditability — they must know
the exact rule set that produced a finding so they can defend decisions
in negotiations or audits.

**Independent Test**: Run an analysis, note the playbook version shown.
Update the playbook and confirm the analysis still displays the original
version. Verify the "outdated" notice appears.

**Acceptance Scenarios**:

1. **Given** an analysis is run, **Then** the stored analysis record
   includes the playbook snapshot version used.
2. **Given** the user views a completed analysis, **Then** the playbook
   version is displayed prominently (e.g., "Reviewed against Playbook
   v12").
3. **Given** the playbook has been updated since the analysis, **When**
   the user views the analysis, **Then** a notice reads "Playbook has
   been updated since this review. Consider re-analyzing."

---

### User Story 3 — Export Findings (Priority: P3)

After triage, the reviewer exports a report summarizing the findings.
Two formats are available: a CSV "Issues List" (one row per finding)
and a simple PDF report suitable for sharing with counterparties or
management.

**Why this priority**: Export is the delivery mechanism — legal teams
share reports outside the tool. However the core value (triage) works
without export.

**Independent Test**: Complete a triage, export CSV, and verify all
findings appear with correct columns. Export PDF and verify it opens
correctly with clause names, risk levels, and decisions.

**Acceptance Scenarios**:

1. **Given** an analysis with triaged findings, **When** the user clicks
   "Export CSV", **Then** a CSV file downloads containing one row per
   finding with columns: clause name, risk level, rule violated, summary,
   decision, fallback text.
2. **Given** an analysis with triaged findings, **When** the user clicks
   "Export PDF", **Then** a PDF downloads containing a formatted report
   with cover page, summary statistics, and a findings table.
3. **Given** no findings have been triaged, **When** the user exports,
   **Then** the export still includes all findings with "Pending" as the
   decision status.

---

### Edge Cases

- What happens when a contract has no text that maps to any playbook
  rule? The system MUST still show the clause list with a "No findings"
  state per clause rather than an empty screen.
- What happens when the playbook has zero rules at the time of analysis?
  The system MUST warn the user before starting and offer to proceed
  with standard (non-playbook) review or cancel.
- What happens when the analysis stream fails mid-way? Partial results
  MUST be preserved; the user sees an error banner and can re-trigger
  analysis.
- What happens when the same contract is analyzed twice? The new analysis
  replaces the previous one entirely — all clauses, findings, and triage
  decisions are deleted (with a confirmation prompt). No analysis history
  is kept in Phase 1.
- What happens when the uploaded document contains no extractable text
  (e.g., a scanned image without OCR)? The system MUST surface a clear
  error before analysis begins.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST segment the contract text into identifiable
  clauses and present them as a navigable list.
- **FR-002**: System MUST evaluate each clause against the active
  playbook rules and produce findings with: risk level, matched rule
  title, plain-language summary, and recommended fallback text.
- **FR-003**: System MUST store the playbook snapshot version identifier
  with every analysis so results are traceable to a specific rule set.
- **FR-004**: Users MUST be able to set a per-finding triage decision:
  "Accept", "Needs Review", or "Reject". Decisions MUST persist across
  page reloads. Decisions are changeable until the reviewer explicitly
  finalizes the triage, after which they become read-only.
- **FR-004a**: The system MUST provide a "Finalize Triage" action that
  locks all decisions for the analysis. Once finalized, triage decisions
  cannot be modified unless the analysis is re-run.
- **FR-005**: The analysis results page MUST use a three-panel layout:
  clause list (left), clause text (center), findings + triage actions
  (right).
- **FR-006**: System MUST display the playbook version used for the
  analysis, and MUST show a warning if the playbook has changed since
  the analysis was run.
- **FR-007**: Users MUST be able to export findings as a CSV "Issues
  List" containing one row per finding.
- **FR-008**: Users MUST be able to export findings as a formatted PDF
  report.
- **FR-009**: The rule evaluation engine MUST produce explainable
  results — each finding MUST include a "why triggered" rationale
  linking back to the specific playbook rule.
- **FR-010**: When the playbook has zero active rules, the system MUST
  warn the user before analysis and offer to proceed with standard
  review or cancel.
- **FR-011**: If analysis fails mid-stream, partial results MUST be
  preserved and the user MUST be informed with an option to retry.

### Key Entities

- **Clause**: A segment of the contract text identified by the analysis
  engine, stored as its own record. Key attributes: clause name/title,
  extracted text, position (order in document). Belongs to one Analysis
  Record. Has zero or more Findings.
- **Finding**: A single issue found in a clause, stored as its own
  record. Key attributes: risk level, matched playbook rule reference,
  summary, recommended fallback text, "why triggered" rationale. Belongs
  to one Clause. Has one Triage Decision.
- **Triage Decision**: A reviewer's disposition on a finding. Values:
  "Accept", "Needs Review", "Reject". Belongs to one Finding. The
  parent analysis has a "finalized" flag; once set, all triage decisions
  become read-only.
- **Analysis Record**: The top-level analysis result tied to one
  contract. Key attributes: playbook version used, overall risk
  assessment, timestamp, model used.

### Assumptions

- The AI model (Claude) is responsible for clause segmentation — the
  system does not perform separate NLP-based clause splitting before
  sending to the model.
- A single analysis pass extracts both clauses and findings in one
  streaming response.
- "Recommended fallback text" is generated by the AI model based on the
  playbook rule's standard position and acceptable range fields.
- Triage decisions are per-finding, not per-clause (a clause may have
  multiple findings with different decisions).
- Export PDF is a simple formatted document, not a redlined contract
  version.
- Single-reviewer model: one person triages a contract at a time. No
  concurrent editing, locking, or finding assignment in Phase 1.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A legal reviewer can upload a contract, run analysis, and
  see a clause-by-clause findings list within 90 seconds of triggering
  analysis (for a ≤30-page document).
- **SC-002**: Every finding displays the matched playbook rule, risk
  level, summary, and fallback text — no "blank" or "unknown" findings
  in the list.
- **SC-003**: A reviewer can triage all findings for a 20-clause
  contract in under 10 minutes using the three-panel layout.
- **SC-004**: Every analysis clearly states the playbook version used,
  and a stale-playbook warning appears within 1 second of page load
  when applicable.
- **SC-005**: Exported CSV contains all findings with correct columns
  and opens correctly in common spreadsheet applications.
- **SC-006**: Exported PDF is readable, contains a summary section and
  per-clause findings, and is under 5 MB for a typical contract.
