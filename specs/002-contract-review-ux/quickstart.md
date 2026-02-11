# Quickstart: Contract Review — Professional Legal UI/UX

**Feature**: 002-contract-review-ux  
**Branch**: `002-contract-review-ux`  
**Date**: 2026-02-11

## Prerequisites

- Node.js 18+ installed
- Git on branch `002-contract-review-ux`
- SQLite database at `prisma/dev.db` (existing from 001 feature)
- `ANTHROPIC_API_KEY` set in `.env.local`

## Setup Steps

### 1. Install Dependencies

No new npm packages required for this feature. All UI components use existing shadcn/ui primitives and system fonts.

```bash
npm install
```

### 2. Apply Database Migration

The migration adds a `NegotiationItem` table and an `excerpt` column on `AnalysisFinding`.

```bash
# Stop any running dev server first (Prisma DLL lock on Windows)
# Generate migration SQL
npx prisma migrate diff --from-schema-datamodel prisma/schema.prisma --to-schema-datamodel prisma/schema.prisma --script

# Or apply directly (interactive):
npx prisma migrate dev --name ux_enhancement

# Regenerate Prisma client
npx prisma generate
```

### 3. Start Development Server

```bash
npm run dev
```

### 4. Verify

1. Open `http://localhost:3000/contracts`
2. Upload a contract and run analysis
3. Verify:
   - **Clause list**: Shows triage progress (e.g. "2/3") after triaging findings
   - **Clause text**: Displays in serif font (Georgia) with risk banner and highlighted excerpts
   - **Findings panel**: Cards sorted by severity, coloured left borders, triage decision banners
   - **Negotiation strategy**: Shows as expandable priority cards (P1/P2/P3)
   - **Header bar**: Grouped metrics with dividers
4. Check a legacy analysis (from before this feature):
   - Clause list and findings panel work as before
   - Negotiation strategy falls back to Markdown rendering
   - No excerpt highlights (empty excerpts)

## Key Files Changed

| Area | Files |
|------|-------|
| Schema | `prisma/schema.prisma` |
| AI Prompt | `src/lib/prompts.ts` |
| Parser | `src/lib/analysis-parser.ts` |
| API Routes | `src/app/api/contracts/[id]/analyze/route.ts`, `src/app/api/contracts/[id]/route.ts`, `src/app/api/contracts/[id]/export/route.ts` |
| UI Components | `clause-list.tsx`, `clause-text.tsx`, `findings-panel.tsx`, `triage-controls.tsx`, `negotiation-strategy.tsx` (new), `page.tsx` |
| Types | `src/app/(app)/contracts/[id]/_components/types.ts` |
| Shared | `src/components/shared/severity-badge.tsx` |
| Exports | `src/lib/export/csv-export.ts`, `src/lib/export/pdf-export.ts` |

## Build Verification

```bash
npm run build   # Type check + Next.js build
npm run lint    # ESLint
```

## Rollback

If needed, revert the migration:

```bash
# Drop NegotiationItem table and excerpt column
npx prisma migrate diff --from-schema-datamodel prisma/schema.prisma --to-schema-datamodel prisma/schema.prisma.bak --script | npx prisma db execute --stdin
# Then revert code changes via git
git checkout main -- prisma/schema.prisma src/
```
