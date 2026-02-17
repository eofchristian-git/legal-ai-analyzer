# Implementation Plan: Clause Decision Actions & Undo System

**Branch**: `006-clause-decision-actions` | **Date**: 2026-02-16 | **Spec**: [spec.md](./spec.md)  
**Input**: Feature specification from `/specs/006-clause-decision-actions/spec.md`

## Summary

Implement a comprehensive clause decision workflow for contract reviewers with five core actions (accept deviation, replace with fallback, edit manually, escalate, add internal note) and two safety actions (undo, revert to original). Uses append-only event sourcing with projection logic to compute effective clause state from decision history. Includes conflict detection for concurrent edits, per-clause projection caching, role-based escalation permissions (assigned approver + admin), and full decision history transparency for all team members.

**Technical Approach**: Extend Prisma schema with `ClauseDecision` entity for append-only history. Build projection engine to compute effective clause text/status from decision chain. Implement tracked changes UI using text diff library. Cache projections per-clause with invalidation on write. Enforce escalation locks at API level with role-based access control.

## Technical Context

**Language/Version**: TypeScript 5.x with Next.js 14 (App Router)  
**Primary Dependencies**: 
- Next.js 14 (App Router)
- Prisma ORM 5.x (SQLite)
- shadcn/ui (New York style)
- NextAuth.js (authentication)
- Text diff library: `diff-match-patch` or `fast-diff` (TBD in research)
- Lucide-react (icons)
- Sonner (toast notifications)

**Storage**: SQLite via Prisma ORM with append-only `ClauseDecision` table  
**Testing**: Manual testing (no test framework configured per constitution)  
**Target Platform**: Web application (Next.js server-side rendering + client components)  
**Project Type**: Web (Next.js full-stack)  
**Performance Goals**: 
- Decision actions: < 500ms response time
- Projection computation: < 2 seconds for 500-clause contract
- Projection cache hit rate: ≥ 80%
- Decision history load: < 1 second for 50 decisions

**Constraints**: 
- Append-only history (no deletes/updates to `ClauseDecision`)
- Indefinite retention (as long as contract exists)
- API-level enforcement of escalation locks
- Per-clause projection caching with invalidation on write
- Full transparency (no role-based filtering of decision history)

**Scale/Scope**: 
- 500 clauses per contract
- 100 decisions per clause
- Indefinite retention (10+ years for long-lived contracts)
- Role-permission mapping system: `RolePermission` table maps roles to permissions (`REVIEW_CONTRACTS`, `APPROVE_ESCALATIONS`). Legal role has both permissions; compliance excluded from contract review.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

### ✅ Principle I: Data Integrity

- **Versioned and traceable**: ✅ All `ClauseDecision` records include `userId`, `timestamp`, and are append-only (never deleted/modified). Satisfies audit trail requirement.
- **Soft-delete preferred**: ✅ Not applicable to this feature (decision history is append-only, no delete operation). Contract-level soft-delete handled by existing Feature 004.
- **Database migrations reviewed**: ✅ New `ClauseDecision` table and `AnalysisClause` extensions will be migrated via Prisma migrations and reviewed.

**Status**: ✅ **PASS** - Append-only event sourcing aligns perfectly with data integrity principle.

### ✅ Principle II: Simplicity

- **Simplest implementation**: ⚠️ **REQUIRES JUSTIFICATION** - Projection logic (event sourcing pattern) is more complex than direct mutation. See Complexity Tracking section.
- **YAGNI applied**: ✅ No speculative abstractions. Redo capability explicitly deferred as "low ROI for complexity" (per spec Open Question #2).
- **New dependencies justified**: ✅ Text diff library (`diff-match-patch` or `fast-diff`) is necessary for tracked changes computation (FR-026, FR-027). No other external dependencies added.
- **Complexity documented**: ✅ Projection logic complexity documented in spec (Risks #1, #2). Mitigation: comprehensive unit tests, cache strategy.

**Status**: ⚠️ **CONDITIONAL PASS** - Projection complexity justified by audit compliance requirement (see Complexity Tracking).

### ✅ Principle III: AI-Assisted, Human-Controlled

- **User action required**: ✅ Not applicable - this feature is about human decision-making on clauses, not AI generation.
- **Override/edit/discard**: ✅ Undo and revert capabilities allow users to reverse any decision.
- **Prompts maintainable**: ✅ Not applicable - no new AI prompts introduced.

**Status**: ✅ **PASS** - Feature focuses on human control over clause decisions.

### ✅ Technology Constraints

- **Next.js App Router**: ✅ All new API routes use Next.js App Router conventions (`route.ts`, async params).
- **TypeScript type-safe**: ✅ `any` usage only for JSON payload parsing (justified for dynamic decision payloads). Prisma generates strict types for models.
- **Prisma ORM with SQLite**: ✅ New `ClauseDecision` table will be defined in `prisma/schema.prisma` with migration.
- **shadcn/ui patterns**: ✅ All UI components (decision buttons, modals, history log) will follow existing shadcn/ui patterns from Features 004/005.
- **Path alias `@/*`**: ✅ All imports use `@/` alias.

**Status**: ✅ **PASS** - All technology choices align with project standards.

### ✅ Data Design Patterns

- **Optional fields**: ✅ `ClauseDecision.payload` is JSON (Prisma `Json` type) to accommodate optional fields per action type. UI provides fallbacks for missing data.
- **Position fields**: ✅ `AnalysisClause` already has `position` field (from Feature 005). Decision history ordered by `timestamp`.
- **Status lifecycle**: ✅ Clause effective status computed by projection (e.g., `DEVIATION_DETECTED` → `ACCEPTED` → `ESCALATED`). Status transitions are atomic (projection is computed, not stored).

**Status**: ✅ **PASS** - Data patterns follow constitution guidelines.

### 🔄 Re-check After Phase 1 Design

**Data Model Re-check**: ✅ **PASS**
- `ClauseDecision` schema follows append-only pattern (never delete/update records)
- All mutations recorded with userId/timestamp (audit trail requirement met)
- Projection logic documented in data-model.md (see algorithm pseudocode)
- Cache invalidation strategy specified (per-clause, TTL backup)
- Migration script provided for production deployment
- TypeScript types defined in `src/types/decisions.ts`

**API Contracts Re-check**: ✅ **PASS**
- All endpoints enforce authentication (NextAuth session check in every route)
- Escalation locks enforced at API level (permission check before decision write)
- No role-based filtering of decision history (full transparency per FR-046, NFR-015)
- Concurrent edit warnings implemented (timestamp comparison + conflict warning)
- Performance targets documented (< 500ms response time, < 100ms projection)
- Security considerations documented (API-level enforcement, CSRF protection, SQL injection prevention)

**Implementation Re-check**: ✅ **PASS**
- Quickstart guide provides step-by-step instructions (4 phases, estimated 3-5 days)
- Research decisions justify all technology choices (diff-match-patch, in-memory cache, RBAC approach)
- Testing scenarios cover happy path + error cases + edge cases
- Deployment checklist included (migration, monitoring, rollback plan)

**Final Verdict**: ✅ **READY FOR PHASE 2 (TASKS BREAKDOWN)**

All constitution checks pass. No violations unresolved. Projection complexity justified by audit compliance requirement. No simpler approach satisfies data integrity + performance constraints simultaneously.

## Project Structure

### Documentation (this feature)

```text
specs/006-clause-decision-actions/
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output (text diff library, caching strategy, auth checks)
├── data-model.md        # Phase 1 output (ClauseDecision entity, projection logic)
├── quickstart.md        # Phase 1 output (step-by-step implementation guide)
├── contracts/           # Phase 1 output (API contracts for decision endpoints)
│   ├── api-decisions.md         # POST /api/clauses/[id]/decisions (core actions)
│   ├── api-decision-history.md  # GET /api/clauses/[id]/decisions (history log)
│   └── api-projection.md        # GET /api/clauses/[id]/projection (cached result)
├── checklists/          # Created by /speckit.specify (requirements validation)
│   └── requirements.md
└── tasks.md             # Phase 2 output (/speckit.tasks command - NOT created by /speckit.plan)
```

### Source Code (repository root)

```text
# Next.js App Router structure (existing)
src/
├── app/
│   ├── (app)/                             # Authenticated app layout
│   │   └── contracts/
│   │       └── [id]/
│   │           ├── _components/
│   │           │   ├── clause-list.tsx           # MODIFY: Add decision action buttons
│   │           │   ├── clause-text.tsx           # MODIFY: Show tracked changes
│   │           │   ├── decision-buttons.tsx      # NEW: 5 core + 2 safety buttons
│   │           │   ├── decision-history-log.tsx  # NEW: Decision history view
│   │           │   ├── escalate-modal.tsx        # NEW: Escalation form
│   │           │   ├── note-input.tsx            # NEW: Internal note input
│   │           │   └── tracked-changes.tsx       # NEW: Diff rendering component
│   │           └── page.tsx                      # MODIFY: Add decision UI
│   └── api/
│       └── clauses/
│           └── [id]/
│               ├── decisions/
│               │   ├── route.ts              # NEW: POST (apply decision), GET (history)
│               │   └── [decisionId]/
│               │       └── undo/
│               │           └── route.ts      # NEW: POST (undo decision)
│               └── projection/
│                   └── route.ts              # NEW: GET (cached projection result)
├── components/
│   └── shared/                               # Existing shared components
├── lib/
│   ├── projection.ts                         # NEW: Projection engine logic
│   ├── tracked-changes.ts                    # NEW: Text diff computation
│   └── cache.ts                              # NEW: Per-clause cache abstraction
└── types/
    └── decisions.ts                          # NEW: TypeScript interfaces

prisma/
└── schema.prisma                             # MODIFY: Add ClauseDecision model

```

**Structure Decision**: Next.js App Router with server-side API routes and client components for UI. Follows existing project structure from Features 004/005. New decision-related components will be co-located in `src/app/(app)/contracts/[id]/_components/`. Projection and caching logic abstracted into `src/lib/` for testability.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| **Projection Logic (Event Sourcing)** | Legal audit compliance requires append-only history. Projection computes effective clause state from decision chain (undo, revert, re-apply patterns). | **Direct mutation** (update clause status/text on each decision) would violate audit trail requirement (Constitution Principle I). Cannot see decision history or support undo/revert. **Snapshot model** (store effective text + history separately) creates data duplication and consistency risks (violates single source of truth). |
| **Per-Clause Projection Caching** | Performance requirement (SC-001: < 500ms response time) cannot be met with naive projection replay for 500-clause contracts with 100 decisions each. | **No caching** (compute on every read) would require O(n*m) computation (n=clauses, m=decisions per clause) on every page load, violating performance constraints (NFR-001, NFR-002). **Contract-level cache** (invalidate all clauses on any decision) wastes cache on 499 unchanged clauses. Per-clause cache is minimal complexity needed. |

**Justification**: Both complexities are necessary for meeting constitutional requirements (data integrity + simplicity + performance constraints). No simpler approach satisfies all three simultaneously. Mitigation: Comprehensive documentation, unit tests for projection logic, monitoring for cache coherence bugs.

---

## Phase 0: Research

**Goal**: Resolve all technical unknowns from Technical Context and spec assumptions.

**Research Tasks**:

1. **Text Diff Library Selection** (Assumption #4, FR-026, FR-027)
   - Evaluate `diff-match-patch` vs `fast-diff` vs custom implementation
   - Criteria: Performance (500+ word clauses), output format (delete/insert operations), browser compatibility
   - Document: Decision, benchmark results, integration approach

2. **Caching Strategy** (Clarification #3, NFR-001, NFR-002, NFR-013)
   - Options: In-memory cache (Node.js Map), Redis, Next.js unstable_cache, database materialized view
   - Criteria: Sub-100ms read latency, cache invalidation by key, deployment simplicity (SQLite constraint)
   - Document: Decision, cache key strategy (clauseId), invalidation triggers, TTL backup (5 min)

3. **Role-Based Access Control Implementation** (Assumption #3, FR-044, FR-045, NFR-009)
   - How to store user roles: NextAuth session, database User.role field, separate roles table
   - How to check permissions in API: Middleware, per-route checks, utility function
   - Document: Decision, role hierarchy (Reviewer < Approver < Admin), permission matrix

4. **Conflict Detection Mechanism** (Clarification #1, FR-035 through FR-038)
   - Options: Optimistic locking (version field), timestamp comparison, database transactions
   - Criteria: Detect stale state reliably, minimal overhead, handle clock skew
   - Document: Decision, implementation approach (AnalysisClause.updatedAt comparison)

5. **Tracked Changes Rendering Strategy** (FR-026, NFR-005, NFR-006)
   - Options: Inline HTML (span with styles), rich text editor (Quill/ProseMirror/TipTap), custom React component
   - Criteria: Accessibility (colorblind support), export compatibility (Word/PDF), maintenance burden
   - Document: Decision, CSS approach (strikethrough + underline + semantic colors), export format

**Output**: `research.md` with 5 decision records

---

## Phase 1: Design & Contracts

**Prerequisites**: research.md complete

### 1. Data Model Design

**Goal**: Define `ClauseDecision` schema, projection algorithm, and database changes.

**Tasks**:
- Extract `ClauseDecision` entity from spec Key Entities section
- Document projection algorithm (chronological replay with UNDO/REVERT markers)
- Document cache schema (key: clauseId, value: ProjectionResult JSON, TTL: 5 min)
- Define Prisma schema changes (new model + relations)

**Output**: `data-model.md`

### 2. API Contracts

**Goal**: Define RESTful endpoints for decision actions, history retrieval, and projection caching.

**Endpoints from Functional Requirements**:

1. **POST /api/clauses/[id]/decisions** - Apply decision action (FR-001 through FR-017)
   - Request body: `{ actionType, payload, clauseVersionForConflictDetection }`
   - Response: `{ decision, updatedProjection, conflictWarning? }`

2. **GET /api/clauses/[id]/decisions** - Get decision history (FR-031, FR-034)
   - Query params: `?actionType=, userId=, startDate=, endDate=` (optional filters)
   - Response: `{ decisions: [...], clauseInfo }`

3. **POST /api/clauses/[id]/decisions/[decisionId]/undo** - Undo specific decision (FR-018 through FR-020)
   - Request body: `{}` (no payload needed)
   - Response: `{ undoDecision, updatedProjection }`

4. **GET /api/clauses/[id]/projection** - Get cached projection result (FR-040 through FR-043)
   - Response: `{ effectiveText, effectiveStatus, trackedChanges, decisionCount, cacheHit: boolean }`

**Output**: `contracts/api-decisions.md`, `contracts/api-decision-history.md`, `contracts/api-projection.md`

### 3. Quickstart Guide

**Goal**: Step-by-step implementation guide for developers.

**Structure**:
1. Overview (feature summary, technical approach)
2. Prerequisites (dependencies, environment setup)
3. Phase-by-phase implementation steps (data model → API → UI → testing)
4. Testing scenarios (from spec acceptance scenarios)
5. Deployment checklist

**Output**: `quickstart.md`

### 4. Agent Context Update

**Goal**: Update Cursor agent context with new technologies/patterns from this feature.

**Command**: `.specify/scripts/powershell/update-agent-context.ps1 -AgentType cursor-agent`

**New Technologies to Add**:
- Text diff library (from research decision)
- Projection/event sourcing pattern
- Per-clause caching strategy

**Output**: Updated agent-specific context file (`.cursor/` or similar)

---

## Execution Status

- [x] **Phase 0 Setup**: plan.md template created and populated
- [x] **Phase 0 Research**: research.md (COMPLETE - 5 research decisions documented)
- [x] **Phase 1 Data Model**: data-model.md (COMPLETE - ClauseDecision schema, projection algorithm)
- [x] **Phase 1 API Contracts**: contracts/*.md (COMPLETE - 3 API contracts specified)
- [x] **Phase 1 Quickstart**: quickstart.md (COMPLETE - step-by-step implementation guide)
- [x] **Phase 1 Agent Context**: Update agent files (COMPLETE - Cursor rules updated)
- [x] **Phase 1 Re-check**: Constitution Check post-design (COMPLETE - see below)

**Next Command**: `/speckit.tasks` to break the plan into actionable tasks.

