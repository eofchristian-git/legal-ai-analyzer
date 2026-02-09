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

Claude responses are parsed with regex in `src/lib/analysis-parser.ts` to extract structured data (clause severities, risk scores, compliance findings). Contract clauses follow the pattern `### [Clause Name] -- [GREEN|YELLOW|RED]`.

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
