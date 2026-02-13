# Implementation Plan: Client Management

**Branch**: `004-client-management` | **Date**: 2026-02-13 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/004-client-management/spec.md`

## Summary

Add a "Clients" entity and UI to manage external parties (name, country, industry, contact details). Clients are accessed from a new sidebar tab. Each client can have contract documents attached (PDF/DOCX). These documents serve as master copies; contract reviews initiated from a client's contract create an independent document copy for the review workflow. The implementation uses the existing Next.js App Router / Prisma (SQLite) / shadcn/ui stack, reusing the existing file upload and document parsing flows.

## Technical Context

**Language/Version**: TypeScript 5.x (Next.js 14+ App Router)  
**Primary Dependencies**: Next.js, React 18, Prisma ORM, shadcn/ui (New York style), NextAuth.js, lucide-react, sonner (toasts)  
**Storage**: SQLite via Prisma ORM; file uploads stored in `uploads/` directory on disk  
**Testing**: No test framework currently configured (per constitution)  
**Target Platform**: Web application (server: Node.js, client: modern browsers)  
**Project Type**: Web (monorepo — single Next.js app with API routes)  
**Performance Goals**: Client list page loads within 2 seconds; search/filter responds within 10 seconds for 100+ clients  
**Constraints**: SQLite single-writer; all operations must be serializable; soft-delete required for audit trail  
**Scale/Scope**: Expected 100+ clients; ~10 new files (pages, API routes, components)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| **I. Data Integrity** — versioned, traceable, soft-delete | ✅ PASS | Client entity uses soft-delete (`deleted` + `deletedAt`). `createdBy`/`createdAt` tracked on Client and ClientContract. Document copy-on-review preserves originals. |
| **II. Simplicity** — YAGNI, no speculative abstractions | ✅ PASS | No new dependencies required. Reuses existing upload flow, Document model, auth patterns. No new abstractions introduced. |
| **III. AI-Assisted, Human-Controlled** — no auto-persist AI output | ✅ PASS | This feature has no AI component — it's pure CRUD for client management. |
| **Tech: Next.js App Router + TypeScript** | ✅ PASS | All new code follows existing patterns: `src/app/(app)/clients/`, `src/app/api/clients/` |
| **Tech: Prisma + SQLite** | ✅ PASS | Two new models (`Client`, `ClientContract`), one model extension (`Contract` gets optional `clientId`). Migration required. |
| **Tech: shadcn/ui New York style** | ✅ PASS | Reuses existing UI components (Table, Dialog, Badge, Input, Select, Button, Card). |
| **Tech: Path alias `@/*`** | ✅ PASS | All imports use `@/` prefix. |
| **Workflow: Linting must pass** | ✅ PASS | Will verify with `npm run lint` before completion. |

No violations. No complexity justifications needed.

## Project Structure

### Documentation (this feature)

```text
specs/004-client-management/
├── spec.md              # Feature specification (complete)
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output (API contracts)
└── tasks.md             # Phase 2 output (created by /speckit.tasks)
```

### Source Code (repository root)

```text
src/
├── app/
│   ├── (app)/
│   │   └── clients/
│   │       ├── page.tsx                    # Client list page (FR-001, FR-004, FR-005, FR-006)
│   │       └── [id]/
│   │           └── page.tsx                # Client detail page (FR-007, FR-008, FR-009, FR-010, FR-011)
│   └── api/
│       └── clients/
│           ├── route.ts                    # GET (list), POST (create)
│           └── [id]/
│               ├── route.ts               # GET (detail), PATCH (edit), DELETE (soft-delete)
│               ├── contracts/
│               │   ├── route.ts            # GET (list), POST (attach document)
│               │   └── [contractId]/
│               │       ├── route.ts        # DELETE (remove attachment)
│               │       └── review/
│               │           └── route.ts    # POST (start review from client contract)
│               └── restore/
│                   └── route.ts            # POST (restore soft-deleted client)
├── components/
│   └── layout/
│       └── sidebar.tsx                     # Modified: add "Clients" nav item after "Contract Review"
├── lib/
│   ├── countries.ts                        # Existing — reused for country dropdown
│   └── industries.ts                       # New: predefined industry list constant
└── prisma/
    └── schema.prisma                       # Modified: add Client, ClientContract models; extend Contract

uploads/                                    # Existing upload directory — no changes needed
```

**Structure Decision**: Follows the established Next.js App Router convention already used by `contracts/`, `compliance/`, etc. New files are placed alongside existing features. No new top-level directories.

## Constitution Re-Check (Post Phase 1 Design)

| Principle | Status | Post-Design Notes |
|-----------|--------|-------------------|
| **I. Data Integrity** | ✅ PASS | `data-model.md` confirms: soft-delete with `deleted`/`deletedAt`, `createdBy` on all new entities, document copy-on-review with independent `Document` rows, `onDelete: SetNull` for `Contract.clientId` preserving reviews. |
| **II. Simplicity** | ✅ PASS | Only 1 new utility file (`industries.ts`). No new npm dependencies. All API routes follow the existing pattern. Client-side filtering (no server-side search infrastructure). |
| **III. AI-Assisted, Human-Controlled** | ✅ PASS | No AI component in this feature. |
| **Tech Constraints** | ✅ PASS | All routes in `src/app/api/clients/`, all pages in `src/app/(app)/clients/`, Prisma migration for schema changes, shadcn/ui components reused, `@/*` imports throughout. |

No violations found. No complexity tracking entries needed.

## Generated Artifacts

| Artifact | Path | Description |
|----------|------|-------------|
| Plan | `specs/004-client-management/plan.md` | This file |
| Research | `specs/004-client-management/research.md` | 8 research decisions |
| Data Model | `specs/004-client-management/data-model.md` | 2 new models + 3 model extensions |
| API: Clients | `specs/004-client-management/contracts/api-clients.md` | 5 endpoints |
| API: Client Contracts | `specs/004-client-management/contracts/api-client-contracts.md` | 4 endpoints |
| Quickstart | `specs/004-client-management/quickstart.md` | 6-step implementation guide |
