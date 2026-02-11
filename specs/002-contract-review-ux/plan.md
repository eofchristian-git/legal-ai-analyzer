# Implementation Plan: Contract Review — Professional Legal UI/UX

**Branch**: `002-contract-review-ux` | **Date**: 2026-02-11 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/002-contract-review-ux/spec.md`

## Summary

Enhance the contract analysis page to deliver a professional legal-application experience. Five user stories: (1) triage-progress indicators on clause list, (2) legal-style clause text panel with serif font, risk banner, and inline excerpt highlighting, (3) refined findings panel with severity sort, coloured borders, triage decision banners, and locked-finalized styling, (4) structured negotiation strategy with `NegotiationItem` database model and expandable priority cards, (5) overall page polish with grouped header bar and consistent legal colour palette. All colour indicators paired with text labels/icons for accessibility.

## Technical Context

**Language/Version**: TypeScript 5.x (Next.js 16, App Router)  
**Primary Dependencies**: Next.js, Prisma, @anthropic-ai/sdk, shadcn/ui, sonner, lucide-react, jspdf, react-markdown  
**Storage**: SQLite via Prisma ORM (`prisma/schema.prisma`)  
**Testing**: No test framework configured (constitution permits deferral)  
**Target Platform**: Web — single-user desktop browser  
**Project Type**: Web application (Next.js full-stack, single project)  
**Performance Goals**: UI rendering instant; no new network requests for fonts (system serif stack)  
**Constraints**: SQLite single-writer; no concurrent multi-user editing; Claude prompt token budget must accommodate new `excerpt` and `negotiationStrategy` array fields  
**Scale/Scope**: Single reviewer per contract; typical contract ≤30 pages; ~10-30 clauses per analysis; ~1-5 negotiation priority items per analysis

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Evidence |
|-----------|--------|----------|
| **I. Data Integrity** | ✅ Pass | New `NegotiationItem` model stores individual rows with FK to `ContractAnalysis` (cascade delete). New `excerpt` field on `AnalysisFinding` is a non-nullable string with default `""`. All mutations go through existing session-based authentication. No data migration required for existing records — legacy analyses fallback to Markdown rendering. Schema change requires a migration (will be created). |
| **II. Simplicity** | ✅ Pass | Reuses existing UI primitives (`Card`, `Badge`, `Collapsible`, `ScrollArea`, `Separator`, `Tooltip`). No new external dependencies — system serif font stack avoids font loading. New `NegotiationItem` model is minimal (7 fields). Excerpt highlighting uses simple exact string matching — no regex or NLP. No speculative abstractions. |
| **III. AI-Assisted, Human-Controlled** | ✅ Pass | AI returns `excerpt` and `negotiationStrategy` array — both are read-only display data. AI output never persisted as a final decision. Triage decisions remain explicit user actions. Negotiation items are AI-generated suggestions displayed for human consumption, not automated actions. |

**Technology Constraints**:
- ✅ TypeScript, type-safe — no `any` without justification
- ✅ Prisma ORM with SQLite — new model via migration
- ✅ shadcn/ui components — uses existing primitives (Collapsible, Badge, Separator, Tooltip, Progress)
- ✅ Claude via `@anthropic-ai/sdk` — prompt changes in `src/lib/prompts.ts`
- ✅ `@/*` path alias used throughout
- ✅ System serif font — no new dependencies

## Project Structure

### Documentation (this feature)

```text
specs/002-contract-review-ux/
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
├── schema.prisma              # ADD NegotiationItem model; ADD excerpt field on AnalysisFinding
└── migrations/                # New migration for NegotiationItem table + excerpt column

src/
├── app/
│   ├── (app)/contracts/
│   │   └── [id]/
│   │       ├── page.tsx                       # MODIFY: wire NegotiationStrategy, pass findings to ClauseText, refine header bar
│   │       └── _components/
│   │           ├── types.ts                   # MODIFY: add excerpt, NegotiationItem, negotiationItems
│   │           ├── clause-list.tsx            # MODIFY: triage progress indicators, finalized lock style
│   │           ├── clause-text.tsx            # MODIFY: serif font, risk banner, excerpt highlighting
│   │           ├── findings-panel.tsx         # MODIFY: severity sort, risk borders, triage banners, finalized style
│   │           ├── triage-controls.tsx        # MODIFY: minor — remove controls display when finalized
│   │           └── negotiation-strategy.tsx   # NEW: priority cards with expand/collapse, legacy Markdown fallback
│   └── api/contracts/
│       └── [id]/
│           ├── analyze/
│           │   └── route.ts                   # MODIFY: persist excerpt + NegotiationItem rows
│           ├── route.ts                       # MODIFY: include NegotiationItem rows in GET response
│           └── export/
│               └── route.ts                   # MODIFY: include excerpt in export data
├── lib/
│   ├── analysis-parser.ts                     # MODIFY: parse excerpt + structured negotiationStrategy
│   ├── prompts.ts                             # MODIFY: add excerpt to finding schema; restructure negotiationStrategy as JSON array
│   └── export/
│       ├── csv-export.ts                      # MODIFY: add excerpt column
│       └── pdf-export.ts                      # MODIFY: add excerpt column
└── components/
    └── shared/
        └── severity-badge.tsx                 # MODIFY: update labels for accessibility (High/Medium/Low)
```

**Structure Decision**: Single Next.js project. Follows conventions established in 001-contract-review-findings. New negotiation strategy component lives under `_components/`. No new directories created. No new external dependencies.

## Complexity Tracking

> No constitution violations to justify.
