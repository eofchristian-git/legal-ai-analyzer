# Implementation Plan: Contract Review — Clause List & Findings

**Branch**: `001-contract-review-findings` | **Date**: 2026-02-11 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/001-contract-review-findings/spec.md`

## Summary

Rework the contract analysis pipeline to produce structured, per-clause
findings with playbook rule traceability and triage workflow. Replace
the current flat markdown analysis with a three-panel review UI (clause
list / clause text / findings + triage). Each analysis records the
playbook version used. Add CSV and PDF export of triaged findings.

## Technical Context

**Language/Version**: TypeScript 5.x (Next.js 16, App Router)
**Primary Dependencies**: Next.js, Prisma, @anthropic-ai/sdk, shadcn/ui, sonner, lucide-react
**Storage**: SQLite via Prisma ORM (`prisma/schema.prisma`)
**Testing**: No test framework configured (constitution permits deferral)
**Target Platform**: Web — single-user desktop browser
**Project Type**: Web application (Next.js full-stack, single project)
**Performance Goals**: Analysis completes within 90 seconds for ≤30-page contracts
**Constraints**: SQLite single-writer; no concurrent multi-user editing
**Scale/Scope**: Single reviewer per contract; ~44 playbook rules; typical contract ≤30 pages

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Evidence |
|-----------|--------|----------|
| **I. Data Integrity** | ✅ Pass | Clauses and findings stored as separate records with timestamps. Analysis records the playbook snapshot version. Re-analysis uses cascade hard-delete (previous analysis + clauses + findings removed before new creation) — justified by spec clarification: "no analysis history in Phase 1." Triage decisions persisted with `triagedAt` and `triagedBy`. |
| **II. Simplicity** | ✅ Pass | Reuses existing streaming pipeline (`createClaudeStream`). New models are minimal (AnalysisClause, AnalysisFinding). No new external services. PDF generation uses lightweight `jspdf` (no server-side headless browser). |
| **III. AI-Assisted, Human-Controlled** | ✅ Pass | AI produces findings; user triages each one (Accept/Needs Review/Reject). AI output never persisted as a decision — triage is explicit user action. Finalize step locks decisions. |

**Technology Constraints**:
- ✅ TypeScript, type-safe — no `any` without justification
- ✅ Prisma ORM with SQLite — new models added via migration
- ✅ shadcn/ui components — three-panel layout uses existing primitives
- ✅ Claude via `@anthropic-ai/sdk` — prompt changes in `src/lib/prompts.ts`
- ✅ `@/*` path alias used throughout

## Project Structure

### Documentation (this feature)

```text
specs/001-contract-review-findings/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output (API contracts)
└── tasks.md             # Phase 2 output (/speckit.tasks command)
```

### Source Code (repository root)

```text
prisma/
├── schema.prisma              # Add AnalysisClause, AnalysisFinding models; update ContractAnalysis
└── migrations/                # New migration for clause/finding tables

src/
├── app/
│   ├── (app)/contracts/
│   │   └── [id]/
│   │       ├── page.tsx       # REWORK: three-panel review layout
│   │       └── _components/   # NEW: ClauseList, ClauseText, FindingsPanel, TriageControls
│   └── api/contracts/
│       └── [id]/
│           ├── analyze/
│           │   └── route.ts   # MODIFY: structured output parsing, clause/finding persistence
│           ├── findings/
│           │   └── route.ts   # NEW: PATCH triage decisions
│           ├── finalize/
│           │   └── route.ts   # NEW: POST finalize triage
│           └── export/
│               └── route.ts   # NEW: GET CSV/PDF export
├── lib/
│   ├── analysis-parser.ts     # MODIFY: parse structured clause + finding JSON from Claude
│   ├── prompts.ts             # MODIFY: updated prompt for structured output
│   └── export/
│       ├── csv-export.ts      # NEW: CSV generation
│       └── pdf-export.ts      # NEW: PDF generation (jspdf)
└── components/
    └── shared/
        └── severity-badge.tsx # REUSE existing
```

**Structure Decision**: Single Next.js project. New code follows existing
conventions. Feature-specific components live under `_components/` in the
route directory. Export utilities in `src/lib/export/`.

## Complexity Tracking

> No constitution violations to justify.
