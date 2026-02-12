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

## Technology Constraints

- **Runtime**: Next.js (App Router) with TypeScript — all code MUST be
  type-safe; `any` usage MUST be justified.
- **Database**: Prisma ORM with SQLite — schema changes require a migration.
- **UI**: shadcn/ui (New York style) primitives — custom components MUST
  follow existing patterns in `src/components/`.
- **AI Provider**: Anthropic Claude via `@anthropic-ai/sdk` — prompts
  composed in `src/lib/prompts.ts`, skills in `skills/*.md`.
- **Path alias**: `@/*` maps to `./src/*`.

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

**Version**: 1.0.0 | **Ratified**: 2026-02-11 | **Last Amended**: 2026-02-11
