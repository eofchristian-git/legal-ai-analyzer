# Tasks: Contract Review — Clause List & Findings

**Input**: Design documents from `/specs/001-contract-review-findings/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/

**Tests**: No test framework configured. Tests not included per constitution.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Setup

**Purpose**: Install dependencies and extend the database schema for structured clause/finding storage.

- [X] T001 Install jspdf and jspdf-autotable dependencies via `npm install jspdf jspdf-autotable`
- [X] T002 Add AnalysisClause and AnalysisFinding models to `prisma/schema.prisma` per data-model.md — include @@unique([analysisId, position]) on AnalysisClause. AnalysisFinding must include `triagedBy String?` field per constitution (record who made each triage decision)
- [X] T003 Add playbookSnapshotId (FK to PlaybookSnapshot), finalized (Boolean default false), and finalizedAt (DateTime?) fields to ContractAnalysis model in `prisma/schema.prisma`. Also add reverse relation `analyses ContractAnalysis[]` on PlaybookSnapshot model
- [X] T004 Run `npx prisma migrate dev` to generate and apply migration for new models and fields

**Checkpoint**: Database schema extended. New tables `AnalysisClause` and `AnalysisFinding` exist. `ContractAnalysis` has `playbookSnapshotId`, `finalized`, `finalizedAt` fields.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Update the analysis pipeline to produce structured JSON output and persist clauses/findings as separate records. All user stories depend on this.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [X] T005 Update contract review prompt in `src/lib/prompts.ts` — replace markdown-based output instructions with JSON schema request per research.md R6. Instruct Claude to return `{ executiveSummary, overallRisk, clauses: [{ clauseName, clauseText, position, findings: [{ riskLevel, matchedRuleTitle, summary, fallbackText, whyTriggered }] }], negotiationStrategy }`
- [X] T006 Rewrite `parseContractAnalysis` in `src/lib/analysis-parser.ts` — parse JSON response instead of regex-based markdown parsing. Extract clauses array with nested findings. Keep existing interface exports (`ContractAnalysisResult`, `ClauseAnalysis`) but add new structured types: `StructuredClause`, `StructuredFinding`, `StructuredAnalysisResult`
- [X] T007 Modify analysis route `src/app/api/contracts/[id]/analyze/route.ts` — after stream completion and JSON parsing, persist AnalysisClause and AnalysisFinding records via Prisma. Delete previous analysis (cascade) before creating new one. Look up the PlaybookSnapshot record for the current playbook version and store its `id` as `playbookSnapshotId` (FK, not version string). If no snapshot exists, store null and set reviewBasis to "standard". Add `clauseCount` and `findingCount` to the SSE `done` event
- [X] T008 Update GET contract endpoint `src/app/api/contracts/[id]/route.ts` — include nested `analysis.clauses[].findings[]` in the response using Prisma includes. Add `playbookVersion` (from snapshot) and `currentPlaybookVersion` (from playbook) to the response

**Checkpoint**: Analysis pipeline produces structured clauses and findings stored as separate DB records. GET contract returns nested clause/finding data. Foundation ready for UI and triage.

---

## Phase 3: User Story 1 — Run Analysis & Triage Clause Findings (Priority: P1) 🎯 MVP

**Goal**: Three-panel review layout with clause navigation and per-finding triage (Accept / Needs Review / Reject).

**Independent Test**: Upload a contract PDF, run analysis, verify structured clause list appears in left panel. Click a clause — center shows text, right shows findings with triage buttons. Set triage decisions and confirm persistence on reload.

### Implementation for User Story 1

- [X] T009 [US1] Add TypeScript types for structured analysis response in `src/app/(app)/contracts/[id]/_components/types.ts` — shared interfaces for Clause, Finding, TriageDecision, AnalysisWithClauses used across all US1/US2/US3 components
- [X] T010 [P] [US1] Create ClauseList component in `src/app/(app)/contracts/[id]/_components/clause-list.tsx` — scrollable list of clauses showing clauseName, finding count badge, and highest risk level indicator. Highlight selected clause. Click handler fires `onSelectClause(clauseId)`
- [X] T011 [P] [US1] Create ClauseText component in `src/app/(app)/contracts/[id]/_components/clause-text.tsx` — displays clauseText for the selected clause with the clause name as heading. Show "Select a clause" empty state when none selected
- [X] T012 [P] [US1] Create FindingsPanel component in `src/app/(app)/contracts/[id]/_components/findings-panel.tsx` — lists findings for selected clause. Each finding card shows: SeverityBadge (risk level), matchedRuleTitle, summary, whyTriggered rationale, fallbackText in a collapsible section, and triage action buttons
- [X] T013 [P] [US1] Create TriageControls component in `src/app/(app)/contracts/[id]/_components/triage-controls.tsx` — three buttons (Accept / Needs Review / Reject) with visual states: unselected (outline), selected (filled with color: green/yellow/red). Optional note input. Calls `onDecision(findingId, decision, note?)`. Disabled state when analysis is finalized
- [X] T014 [US1] Rework contract detail page `src/app/(app)/contracts/[id]/page.tsx` — replace current single-column layout with three-panel grid (25% clause list / 40% clause text / 35% findings panel) when analysis exists. Keep existing upload/pending/analyzing states. Add `selectedClauseId` state. Wire clause selection to update center and right panels
- [X] T015 [US1] Create PATCH findings API route `src/app/api/contracts/[id]/findings/route.ts` — accept `{ decisions: [{ findingId, triageDecision, triageNote? }] }`. Validate triageDecision is ACCEPT|NEEDS_REVIEW|REJECT. Check analysis is not finalized (403). Extract user ID from session and persist as `triagedBy`. Update each finding's triageDecision, triageNote, triagedBy, triagedAt fields. Return updated findings
- [X] T016 [US1] Create POST finalize API route `src/app/api/contracts/[id]/finalize/route.ts` — check analysis exists and is not already finalized. Check all findings have a triageDecision (no nulls). Set `finalized: true` and `finalizedAt: now()` on ContractAnalysis. Return finalized status with counts
- [X] T017 [US1] Add Finalize Triage button and status bar to contract detail page `src/app/(app)/contracts/[id]/page.tsx` — show triage progress (e.g., "15/22 findings triaged"). Finalize button enabled only when all findings triaged. After finalize, disable all triage controls and show "Finalized" badge
- [X] T018 [US1] Add re-analysis confirmation to `src/app/(app)/contracts/[id]/page.tsx` — when analysis already exists and user clicks "Re-analyze", show confirmation dialog warning that previous clauses, findings, and triage decisions will be deleted
- [X] T019 [US1] Handle edge cases in analysis route `src/app/api/contracts/[id]/analyze/route.ts` — zero playbook rules: return warning in SSE stream before analysis starts, let client show dialog to proceed with standard review or cancel. Mid-stream failure: preserve partial response, set status to error, allow retry. No extractable text: return 400 before streaming

**Checkpoint**: User Story 1 fully functional. Three-panel layout renders. Clause selection updates center/right panels. Triage decisions persist. Finalize locks decisions. Re-analysis prompts confirmation.

---

## Phase 4: User Story 2 — Playbook Version Governance (Priority: P2)

**Goal**: Every analysis displays the playbook version used. Stale-playbook warning appears when the playbook has been updated since the analysis.

**Independent Test**: Run an analysis, verify "Reviewed against Playbook vN" badge. Update playbook rules and reload — verify stale warning appears.

### Implementation for User Story 2

- [X] T020 [P] [US2] Create PlaybookVersionBadge component in `src/app/(app)/contracts/[id]/_components/playbook-version-badge.tsx` — displays "Reviewed against Playbook vN" using the analysis's snapshot version. If `currentPlaybookVersion > playbookVersion`, show amber warning: "Playbook has been updated since this review. Consider re-analyzing."
- [X] T021 [US2] Integrate PlaybookVersionBadge into contract detail page `src/app/(app)/contracts/[id]/page.tsx` — render badge in the analysis header area above the three-panel layout. Pass `playbookVersion` and `currentPlaybookVersion` from the API response

**Checkpoint**: User Story 2 functional. Playbook version badge visible. Stale warning appears when playbook updated.

---

## Phase 5: User Story 3 — Export Findings (Priority: P3)

**Goal**: Export triaged findings as CSV (issues list) or formatted PDF report.

**Independent Test**: Complete a triage, click Export CSV — verify downloaded file has correct columns and all findings. Click Export PDF — verify formatted report with cover page and findings table.

### Implementation for User Story 3

- [X] T022 [P] [US3] Create CSV export utility `src/lib/export/csv-export.ts` — function `generateFindingsCsv(clauses, contractTitle)` that produces a CSV string with columns: Clause, Position, Risk Level, Matched Rule, Summary, Fallback Text, Decision, Note. Handle special characters and quoting
- [X] T023 [P] [US3] Create PDF export utility `src/lib/export/pdf-export.ts` — function `generateFindingsPdf(clauses, contractTitle, analysisMetadata)` using jspdf + jspdf-autotable. Cover page: contract title, analysis date, playbook version, overall risk. Summary stats: GREEN/YELLOW/RED counts, triage decision counts. Findings table: clause name, risk level, matched rule, summary, decision
- [X] T024 [US3] Create GET export API route `src/app/api/contracts/[id]/export/route.ts` — accept `?format=csv|pdf` query param. Load analysis with clauses and findings. For CSV: call generateFindingsCsv, return with `text/csv` content type and disposition header. For PDF: call generateFindingsPdf, return with `application/pdf` content type and disposition header. Return 400 for invalid format, 404 if no analysis
- [X] T025 [US3] Add export buttons to contract detail page `src/app/(app)/contracts/[id]/page.tsx` — add "Export" dropdown or button group with CSV and PDF options in the analysis header area. Trigger download via `window.open` or fetch + blob URL to the export endpoint

**Checkpoint**: User Story 3 functional. CSV and PDF export download correctly with all findings and triage decisions.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories.

- [X] T026 Add loading and empty states to all three panels in `src/app/(app)/contracts/[id]/_components/` — skeleton loaders during analysis streaming, "No clauses found" state, "No findings for this clause" state
- [X] T027 Style three-panel layout for responsive behavior in `src/app/(app)/contracts/[id]/page.tsx` — ensure panels don't overflow on smaller screens. Add minimum widths and scroll behavior. Consider collapsible panels for narrower viewports
- [X] T028 Update contracts list page `src/app/(app)/contracts/page.tsx` — add triage status indicator (e.g., "3/15 triaged", "Finalized") in the contract row when analysis exists
- [X] T029 Run quickstart.md verification checklist against implemented feature

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Phase 1 (migration must exist)
- **User Stories (Phase 3+)**: All depend on Phase 2 completion
  - US1 (Phase 3): Can start after Foundational
  - US2 (Phase 4): Can start after Foundational (independent of US1, but US1 provides the page to integrate into)
  - US3 (Phase 5): Can start after Foundational (export logic is independent, but UI integration builds on US1 page)
- **Polish (Phase 6)**: Depends on all user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Depends on Phase 2 only. Core MVP.
- **User Story 2 (P2)**: Depends on Phase 2. Snapshot FK storage handled in T007 (foundational). T021 integrates into the page built by T014.
- **User Story 3 (P3)**: Depends on Phase 2. T022/T023 are independent utilities. T024/T025 integrate into the page built by T014.

### Within Each User Story

- Models/schema before API routes
- API routes before UI components
- UI components can be built in parallel (different files)
- Integration (wiring components together) after individual components

### Parallel Opportunities

```text
# Phase 1 — all sequential (schema then migration)

# Phase 2 — T005 and T006 can be parallel, T007 depends on both, T008 depends on T007
T005 ║ T006  →  T007  →  T008

# Phase 3 (US1) — types first, then components in parallel, then integration
T009  →  T010 ║ T011 ║ T012 ║ T013  →  T014  →  T015 ║ T016  →  T017  →  T018  →  T019

# Phase 4 (US2) — badge then integration
T020  →  T021

# Phase 5 (US3) — utilities in parallel, then route, then UI
T022 ║ T023  →  T024  →  T025
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (T001–T004)
2. Complete Phase 2: Foundational (T005–T008)
3. Complete Phase 3: User Story 1 (T009–T019)
4. **STOP and VALIDATE**: Upload a contract, run analysis, triage findings, finalize
5. Deploy/demo if ready — this is the core value

### Incremental Delivery

1. Setup + Foundational → pipeline produces structured data
2. Add US1 → Three-panel triage workflow (MVP!)
3. Add US2 → Playbook version governance and stale warning
4. Add US3 → CSV + PDF export
5. Polish → Loading states, responsive layout, list page updates

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story
- Each user story is independently completable and testable
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- T009 (shared types) now leads Phase 3 — all components depend on it
