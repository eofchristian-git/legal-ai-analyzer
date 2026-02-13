# Quickstart: Client Management

**Feature**: `004-client-management` | **Date**: 2026-02-13

## Prerequisites

- Node.js 18+
- Repository cloned and on branch `004-client-management`
- Dependencies installed: `npm install`
- Environment configured: `.env` file with `DATABASE_URL` and `NEXTAUTH_SECRET`

## Implementation Order

### Step 1: Schema & Migration

1. Update `prisma/schema.prisma`:
   - Add `Client` model (see `data-model.md`)
   - Add `ClientContract` model (see `data-model.md`)
   - Add `clientId` field to existing `Contract` model
   - Add `clientContracts` relation to existing `Document` model
   - Add `clientsCreated` and `clientContractsUploaded` relations to existing `User` model

2. Run migration:
   ```bash
   npx prisma migrate dev --name add-client-management
   ```

3. Verify: `npx prisma studio` → confirm `Client` and `ClientContract` tables exist

### Step 2: Shared Utilities

1. Create `src/lib/industries.ts`:
   ```typescript
   export const INDUSTRIES = [
     "Technology", "Finance", "Healthcare", "Manufacturing",
     "Energy", "Legal", "Retail", "Other",
   ] as const;
   
   export type Industry = (typeof INDUSTRIES)[number];
   ```

### Step 3: API Routes (backend)

Build in this order (each is independently testable):

1. **`src/app/api/clients/route.ts`** — `GET` (list) + `POST` (create)
2. **`src/app/api/clients/[id]/route.ts`** — `GET` (detail) + `PATCH` (update) + `DELETE` (soft-delete)
3. **`src/app/api/clients/[id]/restore/route.ts`** — `POST` (restore)
4. **`src/app/api/clients/[id]/contracts/route.ts`** — `GET` (list) + `POST` (attach)
5. **`src/app/api/clients/[id]/contracts/[contractId]/route.ts`** — `DELETE` (remove)
6. **`src/app/api/clients/[id]/contracts/[contractId]/review/route.ts`** — `POST` (start review)

### Step 4: Sidebar Navigation

1. Edit `src/components/layout/sidebar.tsx`:
   - Import `Building2` from `lucide-react`
   - Insert `{ href: "/clients", label: "Clients", icon: Building2 }` at index 2 in `navItems`

### Step 5: Client List Page (frontend)

1. Create `src/app/(app)/clients/page.tsx`:
   - Table layout with columns: Name, Country, Industry, Contracts, Created, Actions
   - Search input (name filter) + Country dropdown filter
   - "New Client" button → opens create dialog
   - Row click → navigates to `/clients/[id]`
   - Dropdown menu per row: Edit, Delete (soft-delete with confirmation)

### Step 6: Client Detail Page (frontend)

1. Create `src/app/(app)/clients/[id]/page.tsx`:
   - Client info header (name, country flag, industry badge)
   - Edit button → inline editing or dialog
   - Attached contracts table: filename, type, size, upload date, actions
   - Upload contract button → file picker + upload flow
   - "Start Review" action per contract → calls review endpoint, navigates to contract page
   - Delete button → soft-delete with confirmation

## Verification Checklist

After implementation, verify:

- [ ] `npm run lint` passes with no errors
- [ ] Sidebar shows "Clients" after "Contract Review"
- [ ] Can create a client with name + country
- [ ] Can search/filter clients by name and country
- [ ] Can upload a contract document to a client
- [ ] Can start a review from a client's contract (creates document copy)
- [ ] Original client contract document unchanged after review
- [ ] Can soft-delete a client (disappears from list)
- [ ] Existing reviews unaffected by client deletion
- [ ] Can restore a soft-deleted client
