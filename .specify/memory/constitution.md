<!--
  Sync Impact Report
  ──────────────────
  Version change: N/A → 1.0.0 (initial adoption)
  Added sections:
    - Principle 1: Data Integrity
    - Principle 2: Simplicity
    - Principle 3: AI-Assisted, Human-Controlled
    - Section: Technology Constraints
    - Section: Development Workflow
    - Governance
  Removed sections: (none — initial version)
  Templates requiring updates:
    ✅ plan-template.md — Constitution Check section compatible; no changes needed
    ✅ spec-template.md — Requirements section compatible; no changes needed
    ✅ tasks-template.md — Phase structure compatible; no changes needed
  Follow-up TODOs: none
-->

# Legal AI Analyzer Constitution

## Core Principles

### I. Data Integrity

All legal data (contracts, analyses, playbook rules, snapshots) MUST be
versioned and traceable. Every mutation to user-facing data MUST record
who made the change and when. Soft-delete MUST be preferred over hard-delete
for audit trail purposes. Database migrations MUST be reviewed before
application to production.

### II. Simplicity

Start with the simplest implementation that satisfies requirements. YAGNI
applies — no speculative abstractions, no premature optimization. New
dependencies MUST justify their addition. Complexity MUST be documented
and justified when unavoidable. Prefer convention over configuration.

### III. AI-Assisted, Human-Controlled

AI (Claude) provides analysis, suggestions, and risk assessments. AI output
MUST never be persisted as a final decision without explicit user action.
Users MUST always be able to override, edit, or discard AI-generated content.
Prompts and parsing logic MUST be maintainable and auditable.

**AI Reliability Requirements:**
- Prompts MUST request structured JSON output for reliable parsing
- Prompts SHOULD minimize token usage by avoiding duplicate data
- Parsers MUST handle truncated/incomplete responses gracefully
- Parsers MUST provide fallback values for optional fields
- Token limits and timeouts MUST accommodate large documents
- UI MUST handle missing or incomplete AI data without breaking

## Technology Constraints

- **Runtime**: Next.js (App Router) with TypeScript — all code MUST be
  type-safe; `any` usage MUST be justified.
- **Database**: Prisma ORM with SQLite — schema changes require a migration.
- **UI**: shadcn/ui (New York style) primitives — custom components MUST
  follow existing patterns in `src/components/`.
- **AI Provider**: Anthropic Claude via `@anthropic-ai/sdk` — prompts
  composed in `src/lib/prompts.ts`, skills in `skills/*.md`.
  - Model: `claude-sonnet-4-20250514`
  - Max tokens: **32,000** (default for contract analysis)
  - API timeout: **180 seconds** (3 minutes for contract analysis)
- **Path alias**: `@/*` maps to `./src/*`.

## Data Design Patterns

- **Optional Fields**: When AI-extracted data may be missing (e.g. clause
  numbers), use empty string `""` or `null`, never omit the field. UI MUST
  provide fallbacks.
- **Position Fields**: Every sequential item (clauses, etc.) MUST have a
  `position: number` field starting at 1 for UI fallback when identifiers
  are missing.
- **Status Lifecycle**: Analysis records follow `pending` → `analyzing` →
  `completed` | `error`. Status transitions MUST be atomic.

## Development Workflow

- Feature work SHOULD follow the speckit flow: spec → plan → tasks.
- Commits SHOULD be atomic and descriptive.
- Linting (`npm run lint`) MUST pass before merge.
- No test framework is currently configured; when tests are added, they
  MUST follow the project's chosen runner and live alongside the code
  they exercise.

## Governance

This constitution is the authoritative source of project principles.
Amendments require:
1. A description of the change and its rationale.
2. Version bump following semver (MAJOR for principle removal/redefinition,
   MINOR for new principle/section, PATCH for clarifications).
3. Update of the `Last Amended` date.

All code changes SHOULD be checked for alignment with these principles
during review.

**Version**: 1.1.0 | **Ratified**: 2026-02-11 | **Last Amended**: 2026-02-13

### Amendment Log

**1.1.0 (2026-02-13)**: Added AI reliability requirements to Principle III,
expanded Technology Constraints with AI-specific limits (32K tokens, 180s timeout),
added Data Design Patterns section covering optional fields, position fields,
and status lifecycle. Rationale: Codify reliability improvements made to handle
large contracts and unreliable AI responses.
