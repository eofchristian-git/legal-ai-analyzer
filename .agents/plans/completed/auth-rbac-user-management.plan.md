# Plan: Authentication, Authorization & User Management

## Summary

Add NextAuth.js v5 (Credentials + JWT) authentication, role-based access control (Admin/Legal/Compliance), and admin user management to the Legal AI & Contract Analyzer. The app currently has zero access control.

## User Story

As an internal team member
I want to log in with my credentials and access features appropriate to my role
So that sensitive legal documents are protected and only authorized users manage playbooks and users

## Metadata

| Field | Value |
|-------|-------|
| Type | NEW_CAPABILITY |
| Complexity | HIGH |
| Systems Affected | Auth, Database, Layout, Sidebar, Playbook API, all page routes |

---

## Patterns to Follow

### Database Model Pattern
```prisma
// SOURCE: prisma/schema.prisma:27-43
model Contract {
  id           String    @id @default(cuid())
  // ... fields with String types for status/enum-like values
  status       String    @default("pending")
  createdAt    DateTime  @default(now())
  updatedAt    DateTime  @updatedAt
}
```

### Prisma Client Singleton
```typescript
// SOURCE: src/lib/db.ts:1-9
const globalForPrisma = globalThis as unknown as { prisma: PrismaClient | undefined };
export const db = globalForPrisma.prisma ?? new PrismaClient();
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
```

### API Route Error Handling
```typescript
// SOURCE: src/app/api/playbook/route.ts:58-64
} catch (error) {
  console.error("Failed to update playbook:", error);
  return NextResponse.json(
    { error: "Failed to update playbook" },
    { status: 500 }
  );
}
```

### Dynamic Route Params (Next.js 16)
```typescript
// SOURCE: src/app/api/contracts/[id]/route.ts:5-9
{ params }: { params: Promise<{ id: string }> }
const { id } = await params;
```

### Sidebar Navigation Pattern
```typescript
// SOURCE: src/components/layout/sidebar.tsx:16-23
const navItems = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/contracts", label: "Contract Review", icon: FileText },
  // ...
];
```

### Page Layout Pattern
```typescript
// SOURCE: src/app/contracts/page.tsx (client component pattern)
"use client";
// useState + useEffect for data fetching
// PageHeader + Card/Table content in p-8 wrapper
// Toast notifications via sonner
```

### Dialog Form Pattern
```tsx
// SOURCE: src/app/nda-triage/page.tsx:116-164
<Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
  <DialogTrigger asChild><Button>...</Button></DialogTrigger>
  <DialogContent className="max-w-lg">...</DialogContent>
</Dialog>
```

---

## Files to Change

| File | Action | Purpose |
|------|--------|---------|
| `prisma/schema.prisma` | UPDATE | Add User model |
| `src/lib/auth.ts` | CREATE | NextAuth v5 config |
| `src/lib/auth-utils.ts` | CREATE | Auth helper functions for API routes |
| `src/types/next-auth.d.ts` | CREATE | TypeScript type augmentation |
| `src/app/api/auth/[...nextauth]/route.ts` | CREATE | NextAuth route handler |
| `src/app/api/auth/register/route.ts` | CREATE | User registration endpoint |
| `src/app/(auth)/layout.tsx` | CREATE | Centered auth layout (no sidebar) |
| `src/app/(auth)/login/page.tsx` | CREATE | Login page with Emagine logo |
| `src/app/(auth)/signup/page.tsx` | CREATE | Signup page with Emagine logo |
| `src/app/(app)/layout.tsx` | CREATE | App layout with sidebar |
| `src/app/layout.tsx` | UPDATE | Remove sidebar, add SessionProvider |
| `src/middleware.ts` | CREATE | Route protection middleware |
| `src/components/layout/sidebar.tsx` | UPDATE | User info, role nav, logout |
| `src/app/api/playbook/route.ts` | UPDATE | Role gate PUT to admin/legal |
| `src/app/api/admin/users/route.ts` | CREATE | Admin users list + create |
| `src/app/api/admin/users/[id]/route.ts` | CREATE | Admin user update/delete |
| `src/app/(app)/admin/users/page.tsx` | CREATE | Admin management page |
| `docker-compose.yml` | UPDATE | Add AUTH_SECRET env var |
| `src/app/page.tsx` | MOVE | Into `(app)/` route group |
| `src/app/contracts/` | MOVE | Into `(app)/` route group |
| `src/app/nda-triage/` | MOVE | Into `(app)/` route group |
| `src/app/compliance/` | MOVE | Into `(app)/` route group |
| `src/app/risk-assessment/` | MOVE | Into `(app)/` route group |
| `src/app/playbook/` | MOVE | Into `(app)/` route group |

---

## Tasks

### Task 1: Install dependencies
- **Action**: `npm install next-auth@beta bcryptjs && npm install -D @types/bcryptjs`
- **Also**: Add `AUTH_SECRET` to `.env`
- **Validate**: `npm ls next-auth bcryptjs`

### Task 2: Add User model to Prisma
- **File**: `prisma/schema.prisma`
- **Action**: UPDATE — append User model after Playbook
- **Mirror**: `prisma/schema.prisma:27-43` (Contract model pattern)
- **Validate**: `npx prisma migrate dev --name add-user-model && npx prisma generate`

### Task 3: Create NextAuth v5 configuration
- **Files**: `src/lib/auth.ts`, `src/types/next-auth.d.ts`
- **Action**: CREATE
- **Implement**: Credentials provider with bcrypt, JWT strategy, role in session callbacks
- **Mirror**: `src/lib/db.ts` (lib module pattern)
- **Validate**: `npm run build`

### Task 4: Create NextAuth route handler
- **File**: `src/app/api/auth/[...nextauth]/route.ts`
- **Action**: CREATE
- **Mirror**: `src/app/api/playbook/route.ts` (named exports pattern)
- **Validate**: GET `/api/auth/providers`

### Task 5: Restructure into route groups + layouts
- **Files**: Move 6 page dirs into `(app)/`, create `(auth)/layout.tsx`, `(app)/layout.tsx`, update `layout.tsx`
- **Action**: MOVE + CREATE + UPDATE
- **Validate**: `npm run dev` — all routes still work

### Task 6: Create registration API
- **File**: `src/app/api/auth/register/route.ts`
- **Action**: CREATE
- **Mirror**: `src/app/api/playbook/route.ts:20-65` (POST handler pattern)
- **Validate**: POST creates user, first user = admin

### Task 7: Create login page
- **File**: `src/app/(auth)/login/page.tsx`
- **Action**: CREATE
- **Mirror**: `src/app/contracts/upload/page.tsx` (form pattern)
- **Validate**: Login flow works

### Task 8: Create signup page
- **File**: `src/app/(auth)/signup/page.tsx`
- **Action**: CREATE
- **Mirror**: Login page + `src/app/contracts/upload/page.tsx` (form validation)
- **Validate**: Signup → auto-login → redirect

### Task 9: Create route protection middleware
- **File**: `src/middleware.ts`
- **Action**: CREATE
- **Validate**: Unauth redirect, admin-only routes enforced

### Task 10: Update sidebar with auth features
- **File**: `src/components/layout/sidebar.tsx`
- **Action**: UPDATE
- **Mirror**: Existing nav pattern at lines 16-23
- **Validate**: User info displays, admin nav conditional, logout works

### Task 11: Create auth utils + gate playbook
- **Files**: `src/lib/auth-utils.ts`, `src/app/api/playbook/route.ts`
- **Action**: CREATE + UPDATE
- **Validate**: Compliance user gets 403 on playbook PUT

### Task 12: Create admin users API
- **Files**: `src/app/api/admin/users/route.ts`, `src/app/api/admin/users/[id]/route.ts`
- **Action**: CREATE
- **Mirror**: `src/app/api/contracts/[id]/route.ts` (dynamic route pattern)
- **Validate**: Admin CRUD works, non-admin gets 403

### Task 13: Create admin users page
- **File**: `src/app/(app)/admin/users/page.tsx`
- **Action**: CREATE
- **Mirror**: `src/app/contracts/page.tsx` (table) + `src/app/nda-triage/page.tsx` (dialog)
- **Validate**: Full admin user management UI works

### Task 14: Update Docker config
- **File**: `docker-compose.yml`
- **Action**: UPDATE — add AUTH_SECRET env var
- **Validate**: Docker build succeeds

---

## Validation

```bash
# Type check + build
npm run build

# Lint
npm run lint

# Manual testing (no test framework configured)
# See checklist below
```

---

## Acceptance Criteria

- [ ] `npm run build` passes
- [ ] First signup creates admin user
- [ ] Login/logout flow works with Emagine branding
- [ ] Unauthenticated access redirects to /login
- [ ] Admin sees User Management in sidebar
- [ ] Admin can CRUD users at /admin/users
- [ ] Legal/Admin can edit playbook, Compliance cannot
- [ ] Non-admin cannot access /admin/* routes
- [ ] All 5 existing features work as before
- [ ] Sidebar shows user name, role badge, logout button
