# Authentication, Authorization & User Management

## Problem Statement

The Legal AI & Contract Analyzer currently has zero access control — anyone with the URL can access all features including contract analysis, compliance checks, and playbook management. For an internal team handling sensitive legal documents, this is a security and compliance risk. Without role-based access, there's no way to ensure only authorized personnel (e.g., Legal team) manage organizational playbooks, or that user activity is auditable.

## Key Hypothesis

We believe adding credential-based authentication with role-based access control will secure the application and enable appropriate feature access for the internal team (~50 users).
We'll know we're right when all users authenticate before accessing any feature, and admins can manage users/roles without engineering support.

## Users

**Primary Users**:
- **Admin** — IT/management staff who need to manage user accounts, assign roles, and monitor platform usage
- **Legal Team** — Lawyers/paralegals who use contract review, NDA triage, and manage the organizational playbook
- **Compliance Team** — Compliance officers who run compliance checks and risk assessments

**Job to Be Done**: When I open the Legal AI Analyzer, I want to log in with my credentials and see only the features relevant to my role, so I can work securely without worrying about unauthorized access to sensitive legal data.

**Non-Users**: External clients, anonymous/public users. This is internal-only.

## Solution

Add NextAuth.js credential-based authentication with a User/Role/Permission model in the existing Prisma/SQLite database. Every route and API endpoint will be protected by middleware. Three predefined roles (Admin, Legal, Compliance) will gate feature access. All roles can access all 5 analysis features, but only Admin can manage users and only Legal can manage the Playbook. The first registered user automatically becomes Admin. Sign-up and login pages will be branded with the Emagine logo (`src/assets/emagine-logo.svg`).

### MVP Scope (Phase 1)

| Priority | Capability | Rationale |
|----------|------------|-----------|
| Must | **Sign-up page** — email/password registration with Emagine logo | Entry point for all users |
| Must | **Login page** — email/password auth with Emagine logo | Required to access any feature |
| Must | **Session management** — NextAuth.js with JWT strategy | Stateless auth, no extra infra needed with SQLite |
| Must | **Three roles: Admin, Legal, Compliance** | Core requirement for access control |
| Must | **Route protection** — middleware redirects unauthenticated users to login | Secures all pages and API routes |
| Must | **Admin user management panel** — CRUD users, assign roles, activate/deactivate accounts | Admin needs to manage the team |
| Must | **Playbook management gated to Legal role** | Only Legal team should edit organizational playbook |
| Must | **First user auto-assigned Admin role** | Bootstrap problem — need an initial admin |
| Should | **Password hashing with bcrypt** | Security best practice |
| Should | **Role indicator in sidebar/header** | Users should know their current role |
| Won't | **Activity logs & usage analytics** | Deferred to Phase 2 |
| Won't | **OAuth/social login** | Not needed for internal team MVP |
| Won't | **Password reset via email** | Requires email service; admin can reset passwords manually in MVP |
| Won't | **Granular per-feature permission toggles** | Roles are sufficient for 3-role model |

### Permission Matrix

| Feature | Admin | Legal | Compliance |
|---------|-------|-------|------------|
| Contract Review | Yes | Yes | Yes |
| NDA Triage | Yes | Yes | Yes |
| Compliance Check | Yes | Yes | Yes |
| Risk Assessment | Yes | Yes | Yes |
| Playbook (view) | Yes | Yes | Yes |
| **Playbook (manage/edit)** | Yes | **Yes** | No |
| **User Management** | **Yes** | No | No |
| **Role Assignment** | **Yes** | No | No |

## Success Metrics

| Metric | Target | How Measured |
|--------|--------|--------------|
| All routes protected | 100% of pages/APIs require auth | Manual testing — no unauthenticated access |
| User management functional | Admin can CRUD users and assign roles | Manual testing |
| Role enforcement working | Non-admin cannot access user management; non-legal cannot edit playbook | Manual testing |
| Sign-up to login flow | < 30 seconds from registration to first authenticated page load | Manual testing |

## Tech Stack Additions

| Package | Purpose |
|---------|---------|
| `next-auth` (v5 / Auth.js) | Authentication framework for Next.js App Router |
| `bcryptjs` | Password hashing (pure JS, no native deps for SQLite/Docker compat) |

## Database Schema Changes

New models to add to `prisma/schema.prisma`:

```
model User {
  id            String    @id @default(cuid())
  email         String    @unique
  name          String?
  passwordHash  String
  role          String    @default("compliance")  // "admin" | "legal" | "compliance"
  isActive      Boolean   @default(true)
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt
}
```

**Note**: NextAuth.js with credentials provider and JWT strategy does not require Account/Session tables in the database. User lookup happens at sign-in time, and the session is stored in the JWT token.

## Key Implementation Details

1. **Auth Pages**: Custom sign-up (`/signup`) and login (`/login`) pages using shadcn/ui components, displaying `src/assets/emagine-logo.svg`
2. **Middleware**: `src/middleware.ts` intercepts all requests, redirects unauthenticated users to `/login`, and checks role-based route access
3. **API Protection**: All API routes validate the session token and check role permissions before processing
4. **Admin Panel**: New `/admin/users` page with user list, role assignment dropdowns, activate/deactivate toggles
5. **Sidebar Updates**: Show/hide navigation items based on user role; display current user name and role
6. **First User Bootstrap**: During sign-up, if no users exist in DB, assign "admin" role regardless of default

## Open Questions

- [ ] Should deactivated users see a specific "account disabled" message, or just "invalid credentials"?
- [ ] Is there a password complexity requirement (min length, special chars)?
- [ ] Should the admin be able to reset another user's password in MVP, or is that Phase 2?
- [ ] Do analysis records (Contract, NdaTriage, etc.) need a `userId` foreign key to track who created them? (Important for future activity logs)

## Implementation Phases

| # | Phase | Description | Status | Depends |
|---|-------|-------------|--------|---------|
| 1 | **Auth Foundation** | Install NextAuth.js + bcryptjs, add User model to Prisma schema, run migration, create auth config with credentials provider and JWT strategy | pending | - |
| 2 | **Auth Pages** | Build login and sign-up pages with Emagine logo, form validation, error handling | pending | 1 |
| 3 | **Route Protection** | Add Next.js middleware for auth checks, protect all API routes, implement first-user-is-admin logic | pending | 1 |
| 4 | **Role-Based Access** | Add role checks to middleware and API routes, gate playbook management to Legal/Admin, update sidebar to reflect role | pending | 3 |
| 5 | **Admin User Management** | Build admin panel at `/admin/users` with user list, role assignment, activate/deactivate, password reset | pending | 4 |
| 6 | **Polish & Testing** | End-to-end testing of all flows, edge cases, error states, UI polish | pending | 5 |

---

*Generated: 2026-02-09*
*Status: DRAFT - needs validation*
