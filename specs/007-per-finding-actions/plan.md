# Implementation Plan: Per-Finding Decision Actions

**Branch**: `007-per-finding-actions` | **Date**: 2026-02-17 | **Spec**: `specs/007-per-finding-actions/spec.md`
**Input**: Feature specification from `specs/007-per-finding-actions/spec.md`

## Summary

Replace the clause-level decision system (Feature 006) with **finding-level-only actions**. All decisions target a specific finding. Clause status is **derived** by aggregating finding statuses — when all findings are resolved, the clause is resolved. The left panel (clause list) shows resolution progress per clause. Legacy clause-level decisions (findingId=null) are preserved as display-only historical records.

## Technical Context

**Language/Version**: TypeScript 5.x / Next.js 16 (App Router)
**Primary Dependencies**: Prisma ORM, @anthropic-ai/sdk, shadcn/ui, diff-match-patch
**Storage**: SQLite via Prisma (`dev.db`)
**Testing**: No test framework configured (manual verification)
**Target Platform**: Web (desktop + mobile responsive)
**Project Type**: Web application (Next.js monolith)
**Performance Goals**: Per-finding actions respond within 500ms; projection handles up to 10 findings per clause without degradation
**Constraints**: Append-only event sourcing pattern; last-write-wins for text modifications; no feature flags
**Scale/Scope**: Single-user to small-team usage; SQLite adequate

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Data Integrity | PASS | Append-only pattern preserved; legacy records kept (display-only); `ON DELETE SET NULL` preserves decisions if finding deleted |
| II. Simplicity | PASS | Simpler than dual-mode (clause+finding) — one decision model, derived clause status. No new dependencies, no feature flags |
| III. AI-Assisted, Human-Controlled | PASS | All finding-level decisions require explicit user action; clause resolution is automatic but reflects user decisions |
| Append-Only Event Sourcing | PASS | Same `ClauseDecision` event log; `findingId` now required for new events; projection computes per-finding + derived clause status |
| Technology Constraints | PASS | Same stack (Next.js, Prisma, shadcn/ui); no new dependencies |

**Gate Result**: PASS — no violations.

## Project Structure

### Documentation (this feature)

```text
specs/007-per-finding-actions/
├── spec.md              # Feature specification (completed, v2.0)
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   └── api-contracts.md # API endpoint specifications
└── tasks.md             # Phase 2 output (via /speckit.tasks)
```

### Source Code (repository root)

```text
src/
├── app/
│   ├── (app)/contracts/[id]/
│   │   ├── page.tsx                    # MODIFY: pass findingStatuses + resolution counts to components
│   │   └── _components/
│   │       ├── findings-panel.tsx      # MODIFY: add per-finding action buttons, "Accept All"/"Reset All" shortcuts
│   │       ├── decision-buttons.tsx    # REMOVE/REPLACE: clause-level buttons removed; replaced by finding-actions.tsx
│   │       ├── decision-history-log.tsx # MODIFY: add finding filter, finding badges, legacy label
│   │       ├── finding-actions.tsx     # NEW: per-finding action button group component
│   │       └── clause-list.tsx         # MODIFY: add resolution progress indicator, resolution status filter
│   └── api/clauses/[id]/
│       ├── decisions/route.ts          # MODIFY: require findingId, validate finding exists
│       └── projection/route.ts         # MODIFY: return findingStatuses, resolvedCount, totalFindingCount
├── lib/
│   ├── projection.ts                   # MODIFY: finding-only projection, deriveClauseStatus(), skip legacy records
│   ├── cache.ts                        # NO CHANGE: existing invalidation sufficient
│   └── permissions.ts                  # MODIFY: add canMakeDecisionOnFinding() for finding-level escalation lock
├── types/
│   └── decisions.ts                    # MODIFY: add FindingStatus, DerivedClauseStatus, extend ProjectionResult
└── components/
    └── (no new shared components needed)

prisma/
└── schema.prisma                       # MODIFY: add findingId to ClauseDecision, add relation + index
```

**Structure Decision**: Web application (Next.js monolith). Key change: `decision-buttons.tsx` (clause-level) is replaced by `finding-actions.tsx` (per-finding). `clause-list.tsx` gains resolution progress display.

## Complexity Tracking

> No constitution violations — this section is empty.

## Phase 0: Research

See `research.md` for full details.

### Key Decisions

1. **Finding-level only**: No clause-level decisions. All decisions require a `findingId`. Clause status is derived from finding statuses.
2. **Derived clause status**: RESOLVED (all findings resolved), PARTIALLY_RESOLVED (some), ESCALATED (any escalated), PENDING (none), NO_ISSUES (zero findings).
3. **Text modification strategy**: Last-write-wins across all finding-level text-modifying decisions. No merge/combine.
4. **Escalation lock granularity**: Only the escalated finding is locked; other findings remain fully actionable.
5. **Legacy handling**: Existing clause-level decisions (findingId=null) preserved as display-only historical records; ignored by projection.
6. **No feature flag**: Phased deployment (schema → API → UI) provides safe rollout.

## Phase 1: Design

### Data Model

See `data-model.md` for full entity details.

**Summary of changes:**
- `ClauseDecision`: Add nullable `findingId` column with FK to `AnalysisFinding` (nullable at schema level for legacy records; API enforces non-null for new decisions)
- `ClauseDecision`: Add composite index `[clauseId, findingId, timestamp]`
- `AnalysisFinding`: Add reverse relation `decisions ClauseDecision[]`
- No new models needed

### API Contracts

See `contracts/api-contracts.md` for full endpoint specifications.

**Summary of changes:**
- `POST /api/clauses/[id]/decisions`: **Require** `findingId` (400 if missing). Validate finding belongs to clause.
- `GET /api/clauses/[id]/projection`: Return `findingStatuses`, `resolvedCount`, `totalFindingCount`, and derived `effectiveStatus`
- `GET /api/clauses/[id]/decisions`: Include `findingId` and finding info in response. Legacy records shown with null findingId.
- No new endpoints needed

### Projection Algorithm

The rewritten projection algorithm:
1. Fetches all decisions for clause
2. **Filters out legacy records** (findingId=null) — they don't participate in projection
3. Groups remaining decisions by findingId
4. For each finding: replays its decisions chronologically (handling UNDO/REVERT) to compute `FindingStatusEntry`
5. Computes effective clause text via last-write-wins across all active text-modifying decisions
6. Calls `deriveClauseStatus()` to aggregate finding statuses into clause status
7. Returns `ProjectionResult` with `findingStatuses`, `resolvedCount`, `totalFindingCount`, and derived `effectiveStatus`

### UI Design

**Clause list (left panel) enhancement:**
- Each clause item shows `{resolved}/{total}` progress next to the risk badge
- Fully resolved clauses: green checkmark or "Resolved" badge
- Clauses with escalation: warning icon alongside progress
- Zero-finding clauses: "No issues" label
- New filter: All | Pending | Partially Resolved | Resolved | Escalated

**Finding cards — replace clause-level buttons:**
- Remove `decision-buttons.tsx` clause-level action panel entirely
- Each finding card gets its own action bar:
  - Primary: Accept | Apply Fallback (if available) | Escalate | Note
  - Secondary (if has decisions): Undo | Revert
- Status badge per finding: Accepted (green) | Escalated (yellow) | Fallback Applied (blue) | Pending (none)
- Escalated findings show lock; non-escalated remain actionable

**Clause-wide shortcuts:**
- Above findings list: "Accept All" + "Reset All" buttons
- "Accept All" creates individual ACCEPT decisions for each unresolved, non-escalated finding
- "Reset All" creates REVERT decisions for each finding, resetting all to PENDING

**Decision history enhancement:**
- Each decision shows finding badge (title + risk level)
- Filter dropdown per finding
- Legacy clause-level decisions shown with "Legacy" label (no undo available)

## Constitution Re-Check (Post-Design)

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Data Integrity | PASS | Append-only preserved; legacy records kept; no data deleted |
| II. Simplicity | PASS | Simpler than dual-mode — one path (finding-level), derived clause status |
| III. AI-Assisted, Human-Controlled | PASS | All decisions explicit user actions; auto-derived clause status just aggregates |
| Append-Only Event Sourcing | PASS | Same pattern; findingId scopes events; projection groups by finding |

**Gate Result**: PASS — design aligned with constitution.
