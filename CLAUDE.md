# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Legal AI & Contract Analyzer — a Next.js 16 application that uses Anthropic Claude to analyze legal documents (contracts, NDAs, compliance, risk). Built with TypeScript, Prisma/SQLite, and shadcn/ui.

## Commands

```bash
npm run dev          # Start dev server on port 3000
npm run build        # Production build (runs next build)
npm run start        # Start production server
npm run lint         # ESLint check
npx prisma migrate dev    # Run database migrations
npx prisma generate       # Regenerate Prisma client after schema changes
npx prisma studio         # GUI for browsing the SQLite database
```

No test framework is configured.

## Architecture

### Routing & API Layer

Next.js App Router. All pages are under `src/app/` and API routes under `src/app/api/`. The five core features each have their own page route and corresponding API routes:

| Feature | Page Route | API Route(s) |
|---------|-----------|--------------|
| Contract Review | `/contracts` | `/api/contracts`, `/api/contracts/[id]/analyze` |
| NDA Triage | `/nda-triage` | `/api/nda-triage` |
| Compliance Check | `/compliance` | `/api/compliance` |
| Risk Assessment | `/risk-assessment` | `/api/risk-assessment` |
| Playbook | `/playbook` | `/api/playbook` |

Contract analysis uses **SSE streaming** (`createClaudeStream` in `src/lib/claude.ts`) — the analyze endpoint returns a `ReadableStream` with event types `chunk`, `done`, and `error`.

### AI Prompt System

Prompts are composed dynamically in `src/lib/prompts.ts` by combining:
1. **Skill files** — markdown templates loaded from `skills/*.md` via `src/lib/skills.ts`
2. **User context** — deadline, focus areas, deal context, counterparty info
3. **Playbook** — the organization's stored contract positions (from the Playbook DB model), appended when available

**Prompt Optimization Strategy:**
- Requests structured JSON output to ensure reliable parsing
- Requests single `clauseText` field with markdown formatting (not duplicate raw+formatted text)
- Clause numbers are optional — uses empty string `""` if unavailable, UI shows position as fallback
- Max tokens: **32,000** (doubled from 16,384 to handle large contracts)
- Max duration: **180 seconds** (3 minutes, up from 2 minutes)

**Response Parsing:**
Claude responses are parsed in `src/lib/analysis-parser.ts` with **4-level fallback strategy**:
1. Direct JSON parse
2. Regex extraction of JSON object from response
3. Truncation repair (auto-closes brackets/braces)
4. Return empty analysis with error logging

Contract analysis uses structured JSON with clause schema:
```typescript
{
  clauseNumber: string,      // Original numbering (e.g. "3.1", "Article V") or "" if missing
  clauseName: string,         // e.g. "Limitation of Liability"
  clauseText: string,         // Full clause with markdown formatting
  position: number,           // Sequential 1-based index
  findings: Finding[]         // Risk findings with GREEN/YELLOW/RED levels
}
```

### Database

Prisma ORM with SQLite (`dev.db`). Schema is in `prisma/schema.prisma`.

**Document** is the base entity — every analysis type (Contract, NdaTriage, ComplianceCheck, RiskAssessment) has a foreign key to Document. The Document stores extracted text from uploaded files.

Analysis records use a status lifecycle: `pending` → `analyzing` → `completed` | `error`.

### File Upload & Parsing

`src/lib/file-parser.ts` handles PDF (pdf-parse), DOCX (mammoth), and TXT files. The `/api/upload` endpoint saves files to the `uploads/` directory and creates a Document record with extracted text.

### Component Patterns

- **Layout**: Root layout (`src/app/layout.tsx`) wraps content in a `Sidebar` + main area with `Toaster` (sonner)
- **Shared components** in `src/components/shared/`: `FileDropzone` (react-dropzone), `MarkdownViewer` (react-markdown + remark-gfm), `DisclaimerBanner`, `SeverityBadge`
- **UI primitives**: shadcn/ui (New York style) in `src/components/ui/`, configured via `components.json`

### Clause Decision Workflow (Feature 006)

**Event Sourcing & Append-Only Pattern:**
The decision system uses event sourcing—all clause decisions are stored as immutable events in the `ClauseDecision` table. The current state of a clause is computed by replaying its decision history chronologically.

**Projection Engine** (`src/lib/projection.ts`):
- `computeProjection(clauseId)` replays all `ClauseDecision` events for a clause
- Computes `effectiveText`, `effectiveStatus`, and `trackedChanges`
- Handles 7 action types: ACCEPT_DEVIATION, APPLY_FALLBACK, EDIT_MANUAL, ESCALATE, ADD_NOTE, UNDO, REVERT
- UNDO marks a decision as undone (skip during replay)
- REVERT resets clause to original state, clearing all active decisions
- Returns `ProjectionResult` with full computed state

**Caching Strategy** (`src/lib/cache.ts`):
- In-memory per-clause caching of `ProjectionResult`
- 5-minute TTL for stale entries
- Invalidated on every decision write via `invalidateCachedProjection(clauseId)`
- Cache metrics tracked: hits, misses, hit rate, invalidations, current size

**API Endpoints:**
- `POST /api/clauses/[id]/decisions` — Apply a decision action (requires REVIEW_CONTRACTS permission)
- `GET /api/clauses/[id]/decisions` — Fetch decision history (chronological)
- `GET /api/clauses/[id]/projection` — Get computed clause state (uses cache)

**Permission System:**
- Role-based access control (RBAC) via `RolePermission` mapping table
- Permissions: `REVIEW_CONTRACTS`, `APPROVE_ESCALATIONS`, `MANAGE_USERS`, `MANAGE_PLAYBOOK`
- Escalation locks: Only assigned approver or admin can make decisions on escalated clauses
- Permission checks in `src/lib/permissions.ts`: `hasPermission()`, `canAccessContractReview()`, `canMakeDecisionOnClause()`

**Conflict Detection:**
- Optimistic locking using `updatedAt` timestamps on `AnalysisClause`
- Compares `clauseUpdatedAtWhenLoaded` from client with current DB timestamp
- Returns `conflictWarning` if stale (doesn't block, warns user)

**UI Components:**
- `decision-buttons.tsx` — 7 decision action buttons with loading states, permission checks, and conflict warnings
- `decision-history-log.tsx` — Chronological timeline with undo indicators
- `tracked-changes.tsx` — Visual diff using `<del>` and `<ins>` tags with CSS styling
- `escalate-modal.tsx` — Escalation workflow with assignee selection and reason
- `note-input.tsx` — Internal note modal for team collaboration

**Performance Monitoring:**
- Projection computation time logged to console with decision count
- Cache hit/miss rates tracked with `getCacheMetrics()`

### Reliability Patterns

**Clause Number Fallbacks:**
Clause numbers (`clauseNumber`) are optional and may be empty strings. UI components handle this gracefully:
- `clause-list.tsx`: Shows `#position` when `clauseNumber` is missing
- `clause-text.tsx`: Badge always displays `§number` or `#position`
- Never assume clause numbers are present — always provide fallback to `position` field

**Token Limits & Timeouts:**
- Contract analysis: 32K max_tokens, 180s timeout
- Other analyses: 32K max_tokens (or as specified in request)
- Always check for `stop_reason === "max_tokens"` to detect truncation
- Parser handles truncated responses with auto-repair

**Error Recovery:**
- Analysis errors set contract `status: "error"` in database
- Enhanced logging includes response preview (first 300 chars) for debugging
- Parser returns empty analysis structure on complete failure (never throws)

### Path Aliases

`@/*` maps to `./src/*` (configured in tsconfig.json).

## Environment Variables

- `DATABASE_URL` — Prisma connection string (default: `file:./dev.db`)
- `ANTHROPIC_API_KEY` — Required for Claude API calls (model: `claude-sonnet-4-20250514`)

## Deployment

Docker-ready with standalone Next.js output. `Dockerfile` uses multi-stage build (Node 20 Alpine). `docker-compose.yml` mounts volumes for `/app/data` and `/app/uploads`.

## References

- `.agents/codebase-patterns.md` — Code patterns, conventions, component inventory, lib modules
- `.agents/ui-rules.md` — UI design rules: layout patterns, form conventions, error states, typography, spacing
