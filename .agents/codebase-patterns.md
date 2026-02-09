# Codebase Patterns Reference

## API Route Pattern

All API routes use named exports (`GET`, `POST`, `PUT`, `DELETE`). Consistent error handling:

```typescript
try {
  // logic
} catch (error) {
  console.error("Failed to ...", error);
  return NextResponse.json({ error: "Failed to ..." }, { status: 500 });
}
```

Status codes: 201 (created), 400 (bad request), 404 (not found), 500 (server error).

## Dynamic Route Params (Next.js 16)

```typescript
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
}
```

Reference: `src/app/api/contracts/[id]/route.ts:5-9`

## Page Component Pattern

All pages are `"use client"` components. `useState` + `useEffect` for data fetching. No server components for pages.

- `PageHeader` at top with title/description/actions
- Content in `<div className="p-8">`
- Cards for sections, Tables for lists
- Toast via `sonner` for feedback
- `Loader2` spinner on buttons during async ops
- `useRouter()` for navigation after mutations

Reference: `src/app/contracts/page.tsx`, `src/app/playbook/page.tsx`

## Sidebar

`src/components/layout/sidebar.tsx` — client component, `usePathname()` for active route. Nav defined as `{ href, label, icon }[]`. Active state: exact match or prefix (except `/`). Footer shows version text.

## Form Pattern

Direct `useState` per field (no form library). Validation via toast errors. Async submit in try/catch with loading state. Reference: `src/app/contracts/upload/page.tsx`

## Dialog Form Pattern

Dialog with controlled `open` state, form inside `DialogContent`, close on success. Reference: `src/app/nda-triage/page.tsx:116-164`

## Prisma Client

Imported as `db` from `@/lib/db`. Singleton via `globalThis`. Common: `findMany` (with `orderBy`, `include`), `findUnique`, `create`, `update`, `delete`.

## Available shadcn/ui Components

`src/components/ui/`: badge, button, card, dialog, dropdown-menu, input, label, progress, scroll-area, select, separator, sheet, skeleton, table, tabs, textarea, tooltip.

## Shared Components

- `src/components/shared/`: FileDropzone, MarkdownViewer, DisclaimerBanner, SeverityBadge
- `src/components/layout/`: Sidebar, PageHeader

## Lib Modules

| File | Purpose |
|------|---------|
| `src/lib/db.ts` | Prisma client singleton |
| `src/lib/claude.ts` | Anthropic SDK wrapper (streaming + non-streaming) |
| `src/lib/prompts.ts` | Dynamic prompt builders per analysis type |
| `src/lib/analysis-parser.ts` | Regex parser for Claude responses |
| `src/lib/file-parser.ts` | PDF/DOCX/TXT extraction |
| `src/lib/skills.ts` | Load skill markdown templates from `skills/*.md` |
| `src/lib/utils.ts` | Tailwind merge/clsx utility |

## Styling

Tailwind v4 + shadcn/ui (New York style). CSS variables in `src/app/globals.css` using oklch color space. Light + dark mode via `.dark` class. Fonts: Geist + Geist Mono via `next/font/google`.

## Config

- `next.config.ts`: `output: "standalone"`, `serverExternalPackages: ["pdf-parse"]`
- `tsconfig.json`: `@/*` → `./src/*`, strict mode, ES2017 target
- `components.json`: shadcn/ui New York style, lucide icons, neutral base color

## Assets

`src/assets/emagine-logo.svg` — Emagine brand logo (SVG, viewBox 364x62). Not currently used in any component.

## Database Models

7 models in `prisma/schema.prisma`: Document (base entity), Contract, ContractAnalysis, NdaTriage, ComplianceCheck, RiskAssessment, Playbook. All use `cuid()` IDs, `createdAt`/`updatedAt` timestamps. Status fields are Strings (not enums) due to SQLite.
