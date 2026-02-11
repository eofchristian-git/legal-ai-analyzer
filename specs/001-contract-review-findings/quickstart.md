# Quickstart: Contract Review — Clause List & Findings

**Branch**: `001-contract-review-findings` | **Date**: 2026-02-11

## Prerequisites

- Node.js 20+
- SQLite (bundled via Prisma)
- `ANTHROPIC_API_KEY` environment variable set
- Playbook with at least one active rule (run `npx prisma db seed` if
  needed — seeds 44 rules across 7 groups)

## Setup

```bash
# 1. Switch to the feature branch
git checkout 001-contract-review-findings

# 2. Install dependencies (jspdf + jspdf-autotable are new)
npm install

# 3. Run database migration (adds AnalysisClause, AnalysisFinding tables)
npx prisma migrate dev

# 4. Start the dev server
npm run dev
```

## Walkthrough

### 1. Upload a Contract

1. Navigate to `/contracts` in the browser.
2. Click **Upload Contract**.
3. Upload a PDF, DOCX, or TXT file.
4. Fill in: Title, Our Side (e.g., "Customer"), and optionally
   Contract Type, Counterparty, Deadline, Focus Areas, Deal Context.
5. Submit.

### 2. Run Analysis

1. On the contract detail page (`/contracts/{id}`), click **Run
   Analysis**.
2. The system streams the analysis from Claude. A progress indicator
   shows streaming status.
3. When complete, the page transitions to the **three-panel review
   layout**.

### 3. Triage Findings

1. **Left panel — Clause List**: Shows all identified clauses with
   finding counts and risk indicators. Click a clause to navigate.
2. **Center panel — Clause Text**: Displays the extracted contract
   text for the selected clause.
3. **Right panel — Findings + Triage**: Shows findings for the
   selected clause. Each finding displays:
   - Risk level badge (GREEN / YELLOW / RED)
   - Matched playbook rule title
   - Summary
   - "Why triggered" rationale
   - Recommended fallback text
   - Triage buttons: **Accept** / **Needs Review** / **Reject**

4. Work through each clause and set a triage decision for each
   finding.

### 4. Finalize Triage

1. Once all findings have a decision, click **Finalize Triage**.
2. This locks all decisions — they become read-only.
3. The playbook version badge shows which version was used (e.g.,
   "Reviewed against Playbook v12").

### 5. Export

1. Click **Export** → choose **CSV** or **PDF**.
2. CSV: Downloads a spreadsheet with one row per finding.
3. PDF: Downloads a formatted report with cover page and findings
   table.

## Verification Checklist

- [ ] Contract uploads and text extraction works (PDF, DOCX, TXT)
- [ ] Analysis produces structured clauses with findings (not raw markdown)
- [ ] Three-panel layout renders: clause list, clause text, findings
- [ ] Clicking a clause in the left panel updates center + right panels
- [ ] Each finding shows risk level, matched rule, summary, fallback text, why triggered
- [ ] Triage decisions (Accept/Needs Review/Reject) save and persist on reload
- [ ] Finalize locks all decisions
- [ ] Playbook version badge is visible and correct
- [ ] Stale playbook warning appears when playbook version has changed
- [ ] CSV export downloads with correct columns
- [ ] PDF export downloads and is readable
- [ ] Re-analyzing a contract prompts confirmation and replaces previous analysis
- [ ] Zero-rule playbook shows warning before analysis
