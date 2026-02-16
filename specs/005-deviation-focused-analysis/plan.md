# Implementation Plan: Deviation-Focused Contract Analysis

**Branch**: `005-deviation-focused-analysis` | **Date**: 2026-02-13 | **Spec**: [spec.md](./spec.md)  
**Input**: Feature specification from `/specs/005-deviation-focused-analysis/spec.md`

## Summary

Transform contract analysis from extracting full clause text to extracting only problematic deviations. This architectural change reduces Claude API token usage by ~85% (from 15K to <3K per analysis), eliminates truncation on large contracts (supports 500+ clauses instead of 50), and creates precise location metadata for a future document viewer with highlighting. Findings are returned as a flat list with embedded clause references, context windows (before/after text), and approximate page locations. The solution maintains backward compatibility through a `formatVersion` field and dual-format parser.

## Technical Context

**Language/Version**: TypeScript 5.x with Next.js 14+ (App Router)  
**Primary Dependencies**: `@anthropic-ai/sdk` (Claude API), `prisma` (ORM), `zod` (validation), `react` 18+  
**Storage**: SQLite via Prisma ORM  
**Testing**: No test framework currently configured (manual testing)  
**Target Platform**: Next.js web application (server + client components)  
**Project Type**: Web application (Next.js monolith)  
**Performance Goals**: 
- Analyze 100-clause contracts in <30s (down from 75s)
- Analyze 250-clause contracts in <60s (currently fails)
- Token usage <3K per analysis (down from 15K)
- UI render time <100ms for finding list

**Constraints**: 
- Must support both old (clause-grouped) and new (flat) formats
- Cannot break existing UI for analyses with `formatVersion=1`
- Claude API: 32K max tokens, 180s timeout
- Must remain within existing tech stack (no new major dependencies)
- Prisma migrations must be additive (no breaking schema changes)

**Scale/Scope**: 
- 5 Prisma models affected (ContractAnalysis, AnalysisClause, AnalysisFinding + read-only access)
- 4 UI components modified (clause-list, clause-text, findings-panel, contract-detail-header)
- 2 API routes modified (analyze, contract detail)
- 2 prompt files modified (prompts.ts, contract-review skill)
- 1 parser rewrite (analysis-parser.ts)
- 1 migration script (upgrade old analyses)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

**Initial Check (Pre-Phase 0)**: ✅ PASSED  
**Re-Check (Post-Phase 1 Design)**: ✅ PASSED — No violations introduced

### I. Data Integrity ✅

**Versioning & Traceability**:
- ✅ Add `formatVersion` (1 or 2) to ContractAnalysis
- ✅ Keep old analyses with `formatVersion=1` (soft migration)
- ✅ All new analyses created with `formatVersion=2`
- ✅ `createdBy`, `createdAt` already tracked on ContractAnalysis
- ✅ Migration script marks upgraded analyses appropriately

**Audit Trail**:
- ✅ No hard-delete of old analyses
- ✅ Migration script is idempotent, logs all changes
- ✅ `Document.extractedText` retained as backup of original text

**Schema Changes**:
- ✅ All new fields are nullable or have defaults
- ✅ Migrations are additive (no column drops)
- ✅ Migration reviewed before production

### II. Simplicity ✅

**Start Simple**:
- ✅ Flat finding list (no complex nested grouping)
- ✅ Location metadata is simple: `{ page?, approximatePosition? }`
- ✅ Parser uses existing sanitization logic, adds format detection

**YAGNI Applied**:
- ❌ No document viewer in this phase (future enhancement)
- ❌ No AI-powered clause boundary detection (future enhancement)
- ❌ No comparative analysis (future enhancement)
- ✅ Focus: token reduction + location metadata foundation

**Dependencies**:
- ✅ No new dependencies (uses existing Anthropic SDK, Prisma, Zod)

**Complexity**:
- Justified: Dual-format parser adds complexity but required for zero-downtime migration
- Justified: Prompt restructuring is significant but core to token savings

### III. AI-Assisted, Human-Controlled ✅

**User Control**:
- ✅ Users still triage findings (accept/reject/negotiate)
- ✅ Users can edit triage notes
- ✅ AI does not auto-finalize analyses

**Reliability**:
- ✅ Prompts request structured JSON (already implemented)
- ✅ Token usage minimized (20-80 word excerpts vs 500-word clauses)
- ✅ Parser handles truncated responses (fallback to partial data)
- ✅ Parser handles both formatVersion=1 and formatVersion=2
- ✅ UI handles missing location data (`page: null`, `approximatePosition: null`)

**Maintainability**:
- ✅ Prompts in `src/lib/prompts.ts` (existing pattern)
- ✅ Skills in `skills/*.md` (existing pattern)
- ✅ Parser logic consolidated in `src/lib/analysis-parser.ts`

### Data Design Patterns ✅

**Optional Fields**:
- ✅ `clauseNumber` already allows `""` (empty string)
- ✅ `location.page` and `location.approximatePosition` are nullable
- ✅ `context.before` and `context.after` are nullable
- ✅ UI provides fallbacks (e.g., "Unknown location")

**Position Fields**:
- ✅ `clauseReference.position` retained for UI ordering
- ✅ `position` is 1-based sequential index

**Status Lifecycle**:
- ✅ No changes to `Contract.status` lifecycle
- ✅ Analysis creation remains atomic

### Technology Constraints ✅

- ✅ Next.js App Router with TypeScript (no `any` usage)
- ✅ Prisma ORM with SQLite (migrations required, covered in plan)
- ✅ shadcn/ui components (existing patterns followed)
- ✅ Claude API via `@anthropic-ai/sdk` (prompts in prompts.ts)
- ✅ Model: `claude-sonnet-4-20250514`
- ✅ Max tokens: 32,000 (sufficient for new format, <8K expected)
- ✅ API timeout: 180s (sufficient for new format, <60s expected)

**GATE RESULT**: ✅ **PASSED** — Proceed to Phase 0 research.

## Project Structure

### Documentation (this feature)

```text
specs/005-deviation-focused-analysis/
├── spec.md                   # Feature specification (complete)
├── checklists/
│   └── requirements.md       # Requirements checklist (complete)
├── plan.md                   # This file (in progress)
├── research.md               # Phase 0 output (to be generated)
├── data-model.md             # Phase 1 output (to be generated)
├── quickstart.md             # Phase 1 output (to be generated)
├── contracts/                # Phase 1 output (to be generated)
│   ├── api-analyze.md        # Modified /api/contracts/[id]/analyze
│   └── claude-response.md    # New Claude response format
└── tasks.md                  # Phase 2 output (/speckit.tasks command)
```

### Source Code (repository root)

```text
src/
├── lib/
│   ├── prompts.ts                      # ✏️ MODIFY: New prompt schema (flat findings)
│   ├── analysis-parser.ts              # ✏️ MODIFY: Dual-format parser
│   ├── claude.ts                       # ✅ NO CHANGE (already 32K tokens, 180s)
│   └── ...
├── app/
│   ├── api/
│   │   └── contracts/
│   │       └── [id]/
│   │           └── analyze/
│   │               └── route.ts        # ✏️ MODIFY: Save formatVersion=2
│   └── (app)/
│       └── contracts/
│           └── [id]/
│               ├── page.tsx            # ✏️ MODIFY: Detect formatVersion
│               └── _components/
│                   ├── clause-list.tsx  # ✏️ MODIFY: Handle both formats
│                   ├── clause-text.tsx  # ✏️ MODIFY: Show excerpt + context
│                   ├── findings-panel.tsx # ✏️ MODIFY: Show location data
│                   └── types.ts         # ✏️ MODIFY: Add new types
├── components/
│   └── ...                             # ✅ NO CHANGE (shared components)
└── ...

prisma/
├── schema.prisma                       # ✏️ MODIFY: Add new fields
└── migrations/
    └── 20260213_deviation_focused/     # 🆕 CREATE: New migration
        └── migration.sql

skills/
└── contract-review.md                  # ✏️ MODIFY: Update instructions

scripts/
└── migrate-analyses.ts                 # 🆕 CREATE: Upgrade old analyses (optional)
```

**Structure Decision**: This is a Next.js monolith (web application). All code lives under `src/` with API routes in `src/app/api/` and UI components in `src/app/(app)/` and `src/components/`. Prisma schema and migrations are at repo root level. No new top-level directories needed.

## Complexity Tracking

**No violations identified** — all Constitution Check items passed.

---

## Execution Status

### ✅ Phase 0: Research (COMPLETE)

Generated `research.md` with 6 key research decisions:
- **R1**: Flat findings schema with excerpts (63% token reduction)
- **R2**: Dual-format parser with auto-detection
- **R3**: Soft migration (mark formatVersion only)
- **R4**: Best-effort location with null fallback
- **R5**: Adaptive UI components (format detection)
- **R6**: Manual testing plan (automated future)

All NEEDS CLARIFICATION items resolved.

### ✅ Phase 1: Design (COMPLETE)

Generated design artifacts:
- ✅ `data-model.md` — Prisma schema changes (3 models, 6 new fields)
- ✅ `contracts/api-analyze.md` — Modified POST /api/contracts/[id]/analyze
- ✅ `contracts/claude-response.md` — New Claude response format (v2 schema)
- ✅ `quickstart.md` — Step-by-step implementation guide (8 phases)
- ✅ Agent context updated (`.cursor/rules/specify-rules.mdc`)

Constitution Check re-evaluated: ✅ PASSED (no violations introduced)

### ⏭️ Phase 2: Tasks (PENDING)

Run `/speckit.tasks` to generate detailed task breakdown from this plan.

### ⏭️ Phase 3: Implementation (PENDING)

Execute tasks, test according to quickstart guide, deploy.

---

**Plan Status**: ✅ Ready for Phase 2 (Tasks) — All planning and design complete
