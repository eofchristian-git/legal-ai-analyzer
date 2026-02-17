# Research: Clause Decision Actions & Undo System

**Feature**: 006-clause-decision-actions  
**Date**: 2026-02-16  
**Purpose**: Resolve technical unknowns from spec assumptions and Technical Context

---

## Decision 1: Text Diff Library Selection

**Context**: Need to compute tracked changes (insertions/deletions) when clause text is modified via "Replace with fallback" or "Edit manually" actions (FR-026, FR-027). Must support clauses up to 500+ words with sub-500ms performance.

### Options Evaluated

| Library | Pros | Cons | Performance |
|---------|------|------|-------------|
| **diff-match-patch** | Industry standard (Google), semantic diff algorithm, handles large texts well, browser-compatible | 74KB minified, somewhat verbose API | ~5-10ms for 500-word diff |
| **fast-diff** | Tiny (6KB), simple API, fast for short texts | Less sophisticated diff algorithm, no semantic cleanup | ~2-5ms for 500-word diff |
| **jsdiff** | Popular (npm), multiple diff modes (word/char/line), TypeScript types | 50KB minified, overkill for our use case | ~8-12ms for 500-word diff |
| **Custom (Myers algorithm)** | Minimal dependencies, tailored to our needs | High implementation complexity, testing burden | Unknown (risky) |

### Decision

**Selected**: `diff-match-patch` (Google's library)

**Rationale**:
1. **Proven reliability**: Used by Google Docs, Wikipedia, and thousands of production apps. Battle-tested for edge cases.
2. **Semantic diff**: Produces human-readable diffs by finding word/sentence boundaries rather than character-by-character changes. Crucial for legal text where "Licensee shall not" vs "Licensee may not" is semantically important.
3. **Performance sufficient**: 5-10ms diff computation for 500-word clauses is well within our 500ms budget (FR-001, NFR-001).
4. **Output format**: Returns array of `[operation, text]` tuples where operation is INSERT (1), DELETE (-1), or EQUAL (0), which maps directly to our UI requirements (strikethrough deleted, underline inserted).
5. **Browser compatibility**: Pure JavaScript, works in all modern browsers (no polyfills needed per Constraint #5).

**Alternatives Rejected**:
- `fast-diff`: While faster, its naive diff algorithm produces poor results for legal text (treats words as characters, creates noisy diffs).
- `jsdiff`: Overkill (50KB) for our needs. We only need character-level diff with semantic cleanup, not line/word/JSON modes.
- Custom implementation: High risk, testing burden, and no performance advantage.

**Integration Approach**:
- Install: `npm install diff-match-patch @types/diff-match-patch`
- Wrapper function in `src/lib/tracked-changes.ts`:
  ```typescript
  import DiffMatchPatch from 'diff-match-patch';
  
  export function computeTrackedChanges(oldText: string, newText: string) {
    const dmp = new DiffMatchPatch();
    dmp.Diff_Timeout = 1.0; // 1 second max
    dmp.Diff_EditCost = 4; // Semantic cleanup threshold
    
    const diffs = dmp.diff_main(oldText, newText);
    dmp.diff_cleanupSemantic(diffs); // Human-readable diffs
    
    return diffs.map(([op, text], index) => ({
      type: op === 1 ? 'insert' : op === -1 ? 'delete' : 'equal',
      text,
      position: index
    }));
  }
  ```

**Export Compatibility**:
- Word: Use diff-match-patch's `diff_prettyHtml()` or convert to Word XML track changes format in export logic.
- PDF: Render diffs with PDF annotations (red strikethrough, green underline).
- HTML: Use `<del>` and `<ins>` tags with CSS styling.

---

## Decision 2: Caching Strategy

**Context**: Projection logic must compute effective clause state from decision history on every read. For 500-clause contracts with 100 decisions per clause, naive computation would take 5-10 seconds (unacceptable per NFR-001, NFR-002). Need per-clause caching with < 100ms read latency and 80%+ hit rate (NFR-013).

### Options Evaluated

| Option | Pros | Cons | Latency | Deployment |
|--------|------|------|---------|------------|
| **In-memory cache (Map)** | Simple, zero dependencies, < 1ms latency | Lost on server restart, no sharing across instances | < 1ms | Easy |
| **Redis** | Persistent, shared across instances, mature | External dependency (violates SQLite simplicity), deployment complexity | 2-5ms | Complex |
| **Next.js unstable_cache** | Built-in, file-system backed, zero config | Marked "unstable" (API may change), less control over invalidation | 5-10ms | Easy |
| **Database materialized view** | Persistent, queryable | Violates single-source-of-truth (constitution), complex invalidation | 10-20ms | Medium |

### Decision

**Selected**: **In-memory cache (Map) with optional Redis upgrade path**

**Rationale**:
1. **Simplicity first** (Constitution Principle II): Start with simplest implementation (in-memory Map), add Redis only if multi-instance deployment requires it.
2. **Latency**: Sub-1ms read latency meets performance requirements (NFR-001: < 500ms total response time).
3. **Deployment compatibility**: Works with SQLite constraint (no external services required for MVP).
4. **Cache coherence**: Single Next.js process means cache invalidation is deterministic (no distributed cache invalidation complexity).
5. **Upgrade path**: If multi-instance deployment needed later, swap in Redis adapter without changing application code.

**Implementation Approach**:

```typescript
// src/lib/cache.ts
const projectionCache = new Map<string, { result: ProjectionResult, timestamp: number }>();

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes (backup TTL per Risk #6)

export function getCachedProjection(clauseId: string): ProjectionResult | null {
  const cached = projectionCache.get(clauseId);
  if (!cached) return null;
  
  // TTL check (backup for cache invalidation bugs)
  if (Date.now() - cached.timestamp > CACHE_TTL_MS) {
    projectionCache.delete(clauseId);
    return null;
  }
  
  return cached.result;
}

export function setCachedProjection(clauseId: string, result: ProjectionResult) {
  projectionCache.set(clauseId, { result, timestamp: Date.now() });
}

export function invalidateCachedProjection(clauseId: string) {
  projectionCache.delete(clauseId);
}
```

**Cache Key Strategy**: `clauseId` (UUID from database)

**Invalidation Triggers** (FR-041):
- POST /api/clauses/[id]/decisions → Invalidate cache for `clauseId`
- Any ClauseDecision write → Invalidate cache for affected clause

**Monitoring**:
- Log cache hits/misses to track hit rate (target: 80%+ per NFR-013)
- Log cache size to detect memory leaks (cap at 10,000 entries = ~100MB for 500-clause contracts × 20 active contracts)

**Alternatives Rejected**:
- **Redis**: Adds deployment complexity (violates Constitution Principle II: Simplicity). Defer until multi-instance need proven.
- **Next.js unstable_cache**: "Unstable" API risk, less control over invalidation logic (need precise clauseId-based invalidation).
- **Database materialized view**: Violates single-source-of-truth principle (Constitution Principle I).

---

## Decision 3: Role-Based Access Control Implementation

**Context**: Escalation workflow requires role-based permissions: Reviewers can make decisions on non-escalated clauses, Approvers can resolve escalations assigned to them, Admins can override all locks (FR-044, FR-045, NFR-009).

### Options Evaluated

| Option | Pros | Cons | Complexity |
|--------|------|------|------------|
| **NextAuth session + User.role field** | Simple, already using NextAuth, single-table design | Role changes require user re-login to pick up new session | Low |
| **Separate UserRole/Permission tables** | Flexible (multiple roles per user), role changes immediate | Overkill for 3 roles, adds joins to every auth check | High |
| **Middleware-based RBAC** | Centralized auth logic, DRY | Hard to customize per-route (escalation locks vary by clause state) | Medium |
| **Per-route permission checks** | Flexible, explicit, easy to test | More code duplication, easy to forget | Low |

### Decision

**Selected**: **Role-Permission mapping system (proper RBAC)**

**Rationale**:
1. **Scalable RBAC** (Constitution Principle II: Simplicity for long-term): Permissions assigned to roles, not individual users. Easier to manage as organization grows.
2. **Compliance excluded from contract review**: `compliance` role will not have `REVIEW_CONTRACTS` permission assigned.
3. **Granular permissions**: Separate permission types for different capabilities (review contracts, approve escalations, admin actions).
4. **Future role management**: Foundation for admin UI to manage role permissions (not in this iteration, but architecture supports it).
5. **Database-driven**: Permission checks query `RolePermission` table, allowing runtime permission changes without code deployment.

**Implementation Approach**:

1. **Prisma Schema** (new models):
   ```prisma
   // Permission enum
   enum Permission {
     REVIEW_CONTRACTS        // Access to contract analysis and clause decisions
     APPROVE_ESCALATIONS     // Resolve escalated clauses when assigned
     MANAGE_USERS           // Admin: user management (future)
     MANAGE_PLAYBOOK        // Admin: playbook management (future)
   }
   
   // Role-Permission mapping (many-to-many)
   model RolePermission {
     id         String     @id @default(cuid())
     role       String     // "admin", "legal", "compliance"
     permission Permission
     createdAt  DateTime   @default(now())
     
     @@unique([role, permission])  // One permission per role
     @@index([role])               // Fast lookup by role
   }
   
   // User model unchanged (role field already exists)
   model User {
     id       String   @id @default(cuid())
     email    String   @unique
     name     String?
     role     String   @default("legal")  // EXISTING: "admin", "compliance", "legal"
     // ... existing fields ...
   }
   ```

2. **Permission Utility** (`src/lib/permissions.ts`):
   ```typescript
   import { db } from '@/lib/db';
   import { User, Permission } from '@prisma/client';
   
   /**
    * Core permission check - queries RolePermission table
    */
   export async function hasPermission(user: User | null, permission: Permission): Promise<boolean> {
     if (!user) return false;
     
     // Admins have all permissions (fallback)
     if (user.role === 'admin') return true;
     
     // Query role-permission mapping
     const rolePermission = await db.rolePermission.findUnique({
       where: {
         role_permission: {
           role: user.role,
           permission: permission
         }
       }
     });
     
     return rolePermission !== null;
   }
   
   /**
    * Can user access contract review features?
    */
   export async function canAccessContractReview(user: User | null): Promise<boolean> {
     return hasPermission(user, 'REVIEW_CONTRACTS');
   }
   
   /**
    * Can user make decisions on a specific clause?
    * Considers escalation locks and assignment.
    */
   export async function canMakeDecisionOnClause(
     user: User | null,
     clause: { effectiveStatus: string; escalatedToUserId: string | null }
   ): Promise<boolean> {
     if (!user) return false;
     
     // Must have contract review access first
     const hasReviewAccess = await canAccessContractReview(user);
     if (!hasReviewAccess) return false;
     
     // Admin can always make decisions (override escalation locks)
     if (user.role === 'admin') return true;
     
     // If clause is escalated, only assigned user with approval permission can resolve
     if (clause.effectiveStatus === 'ESCALATED') {
       const isAssigned = clause.escalatedToUserId === user.id;
       const canApprove = await hasPermission(user, 'APPROVE_ESCALATIONS');
       return isAssigned && canApprove;
     }
     
     // Non-escalated: any user with review permission can make decisions
     return true;
   }
   ```

3. **API Route Check** (example: `/api/clauses/[id]/decisions/route.ts`):
   ```typescript
   const session = await getServerSession(authOptions);
   if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
   
   // Load clause and user from database (needed for permission check)
   const user = await db.user.findUnique({ where: { id: session.user.id } });
   const clause = await db.analysisClause.findUnique({ where: { id } });
   
   if (!await canMakeDecisionOnClause(user, clause)) {
     return NextResponse.json(
       { error: 'Cannot make decisions on escalated clauses unless assigned or admin' },
       { status: 403 }
     );
   }
   ```

**Permission Matrix**:

| Role | REVIEW_CONTRACTS | APPROVE_ESCALATIONS | Can Access Contract Review | Non-Escalated Clause | Escalated (Assigned to Self) | Admin Override |
|------|-----------------|---------------------|---------------------------|---------------------|----------------------------|----------------|
| **legal** | ✅ (DB) | ✅ (DB) | ✅ Yes | ✅ All actions | ✅ All actions (when assigned) | ❌ |
| **compliance** | ❌ (not in DB) | ❌ (not in DB) | ❌ No access | ❌ No access | ❌ No access | ❌ |
| **admin** | ✅ (code fallback) | ✅ (code fallback) | ✅ Yes (always) | ✅ All actions | ✅ All actions (override) | ✅ |

**Note**: 
- `compliance` role has NO entries in `RolePermission` table (excluded from contract review entirely)
- `legal` role has explicit `RolePermission` records for `REVIEW_CONTRACTS` and `APPROVE_ESCALATIONS`
- `admin` bypasses database checks via code fallback (performance optimization)
- Future: Granular permissions for junior vs senior legal roles (e.g., remove `APPROVE_ESCALATIONS` for juniors)

**Seed Data** (migration or `/api/admin/seed`):
```sql
-- Grant legal role full contract review permissions
INSERT INTO RolePermission (id, role, permission, createdAt) VALUES 
  ('perm_legal_review', 'legal', 'REVIEW_CONTRACTS', CURRENT_TIMESTAMP),
  ('perm_legal_approve', 'legal', 'APPROVE_ESCALATIONS', CURRENT_TIMESTAMP);

-- Compliance role: NO permissions (explicitly excluded from contract review)
-- Admin role: NO records (code fallback grants all permissions)
```

**Future Role Management UI** (not in this iteration):
- `/admin/roles` page to view/edit role-permission mappings
- Add/remove permissions for specific roles
- Create custom roles (e.g., "legal_junior" without `APPROVE_ESCALATIONS`)

**Alternatives Rejected**:
- **Separate UserRole table**: Overkill for 3 roles. Adds complexity for no benefit.
- **Middleware-based RBAC**: Escalation lock logic depends on clause state (ESCALATED vs not, assigneeId), which varies per request. Middleware would need to load clause anyway, defeating the purpose of centralization.

---

## Decision 4: Conflict Detection Mechanism

**Context**: When two reviewers simultaneously apply decisions to the same clause, system must detect stale state and show warning (Clarification #1, FR-035 through FR-038). Must work reliably despite network latency and clock skew.

### Options Evaluated

| Option | Pros | Cons | Reliability |
|--------|------|------|-------------|
| **Optimistic locking (version field)** | Industry standard, guaranteed consistency, handles clock skew | Requires version increment on every decision, client must track version | High |
| **Timestamp comparison (updatedAt)** | Simple, no version tracking, Prisma auto-updates | Clock skew risk (rare), requires timestamp index | Medium-High |
| **Database transactions with row locks** | Prevents concurrent writes entirely | Blocks concurrent reviewers (poor UX), not applicable to SQLite | Low (not suitable) |
| **Last-write-wins (no detection)** | Simplest, no overhead | Silent data loss, violates requirement FR-035 | N/A (rejected) |

### Decision

**Selected**: **Timestamp comparison using `AnalysisClause.updatedAt`**

**Rationale**:
1. **Simplicity** (Constitution Principle II): Simpler than version field (no client-side version tracking needed).
2. **Sufficient reliability**: Clock skew is rare in modern cloud environments. Acceptable risk for 99.9%+ detection rate (FR-035).
3. **Prisma auto-maintenance**: `updatedAt` field automatically maintained by Prisma on every update.
4. **User experience**: Last-write-wins with warning (not rejection) preserves work and lets user decide (better than blocking).

**Implementation Approach**:

1. **Prisma Schema** (extend `AnalysisClause`):
   ```prisma
   model AnalysisClause {
     // ... existing fields ...
     updatedAt  DateTime  @updatedAt  // Auto-updated by Prisma
   }
   ```

2. **Client Tracks Last-Loaded Timestamp**:
   ```typescript
   // In React component state
   const [clauseLastUpdated, setClauseLastUpdated] = useState<string>(clause.updatedAt);
   ```

3. **API Checks Timestamp on Decision POST**:
   ```typescript
   // /api/clauses/[id]/decisions/route.ts
   export async function POST(req: Request, { params }: { params: { id: string } }) {
     const { actionType, payload, clauseUpdatedAtWhenLoaded } = await req.json();
     
     // Load current clause state
     const clause = await db.analysisClause.findUnique({ where: { id: params.id } });
     if (!clause) return NextResponse.json({ error: 'Clause not found' }, { status: 404 });
     
     // Check for stale state (FR-035)
     const isStale = new Date(clauseUpdatedAtWhenLoaded) < new Date(clause.updatedAt);
     let conflictWarning = null;
     
     if (isStale) {
       // Find who updated it
       const lastDecision = await db.clauseDecision.findFirst({
         where: { clauseId: params.id },
         orderBy: { timestamp: 'desc' },
         include: { user: { select: { name: true } } },
       });
       
       conflictWarning = {
         message: `This clause was updated by ${lastDecision?.user?.name || 'another user'} while you were editing. Your change was saved but may conflict.`,
         lastUpdatedBy: lastDecision?.user?.name,
         lastUpdatedAt: clause.updatedAt,
       };
     }
     
     // Save decision anyway (last-write-wins per Clarification #1)
     const decision = await db.clauseDecision.create({ data: { ... } });
     
     return NextResponse.json({
       decision,
       conflictWarning, // null if no conflict
       updatedProjection: { ... },
     });
   }
   ```

4. **Client Shows Warning Toast**:
   ```typescript
   const response = await fetch(`/api/clauses/${clauseId}/decisions`, { ... });
   const data = await response.json();
   
   if (data.conflictWarning) {
     toast.warning(data.conflictWarning.message, {
       action: {
         label: 'Undo my change',
         onClick: () => undoLastDecision(data.decision.id),
       },
     });
   }
   ```

**Clock Skew Mitigation**:
- Use server-side timestamps only (never trust client time)
- Prisma's `@updatedAt` uses database server time (SQLite's `CURRENT_TIMESTAMP`)
- Acceptable failure mode: In rare clock skew cases, warning may not trigger, but append-only history preserves both decisions (no data loss)

**Alternatives Rejected**:
- **Optimistic locking (version field)**: More complex (client must track version on every read, increment on every write). No significant reliability improvement over timestamp approach.
- **Database row locks**: SQLite doesn't support row-level locking well. Would block concurrent reviewers (poor UX). Last-write-wins with warning is better user experience.
- **No detection**: Violates FR-035. Silent conflicts would erode user trust.

---

## Decision 5: Tracked Changes Rendering Strategy

**Context**: When clause text is modified (replace/edit), must display tracked changes with visual differentiation: strikethrough (red) for deleted text, underline (green) for inserted text (FR-026, NFR-005). Must be accessible (colorblind-friendly) and exportable (Word/PDF/HTML).

### Options Evaluated

| Option | Pros | Cons | Accessibility | Export |
|--------|------|------|---------------|--------|
| **Inline HTML (del/ins tags + CSS)** | Simple, semantic HTML, native browser support | Limited styling control, hard to customize | Good (uses semantic tags) | Easy (standard HTML) |
| **Rich text editor (Quill/ProseMirror/TipTap)** | Full control, WYSIWYG, built-in export | Heavy (100KB+), overkill for read-only display, complex integration | Excellent | Built-in |
| **Custom React component** | Full control, minimal bundle size, tailored to needs | Must handle edge cases (line breaks, word wrapping, escaping) | Depends on implementation | Custom logic needed |

### Decision

**Selected**: **Inline HTML (`<del>` and `<ins>` tags) + Custom CSS + Custom React component**

**Rationale**:
1. **Simplicity + Semantic HTML**: `<del>` and `<ins>` are semantic HTML5 tags designed for tracked changes. Screen readers announce them correctly.
2. **Accessibility** (NFR-005): Strikethrough and underline provide visual distinction independent of color (colorblind-friendly). Can add `aria-label` for extra clarity.
3. **Lightweight**: No additional libraries needed (diff-match-patch outputs plain text, we wrap in HTML tags).
4. **Export compatibility**: `<del>` and `<ins>` tags are standard HTML, easily converted to Word/PDF track changes formats.
5. **Customizable styling**: CSS allows us to match app theme (red/green + strikethrough/underline).

**Implementation Approach**:

1. **React Component** (`src/app/(app)/contracts/[id]/_components/tracked-changes.tsx`):
   ```tsx
   interface TrackedChangesProps {
     diffs: Array<{ type: 'insert' | 'delete' | 'equal'; text: string }>;
   }
   
   export function TrackedChanges({ diffs }: TrackedChangesProps) {
     return (
       <div className="tracked-changes-container">
         {diffs.map((diff, idx) => {
           if (diff.type === 'equal') {
             return <span key={idx}>{diff.text}</span>;
           }
           if (diff.type === 'delete') {
             return (
               <del
                 key={idx}
                 className="tracked-delete"
                 aria-label="Deleted text"
               >
                 {diff.text}
               </del>
             );
           }
           if (diff.type === 'insert') {
             return (
               <ins
                 key={idx}
                 className="tracked-insert"
                 aria-label="Inserted text"
               >
                 {diff.text}
               </ins>
             );
           }
         })}
       </div>
     );
   }
   ```

2. **CSS Styling** (in component or globals.css):
   ```css
   .tracked-delete {
     background-color: hsl(0 100% 97%); /* Light red background */
     color: hsl(0 70% 40%); /* Dark red text */
     text-decoration: line-through;
     text-decoration-color: hsl(0 70% 50%);
     padding: 0 2px;
     border-radius: 2px;
   }
   
   .tracked-insert {
     background-color: hsl(142 100% 97%); /* Light green background */
     color: hsl(142 70% 30%); /* Dark green text */
     text-decoration: underline;
     text-decoration-color: hsl(142 70% 40%);
     text-decoration-style: solid;
     text-decoration-thickness: 2px;
     padding: 0 2px;
     border-radius: 2px;
   }
   
   /* High contrast mode for colorblind users */
   @media (prefers-contrast: high) {
     .tracked-delete {
       text-decoration: line-through wavy;
       text-decoration-thickness: 2px;
     }
     .tracked-insert {
       text-decoration: underline double;
       text-decoration-thickness: 2px;
     }
   }
   ```

3. **Export Format Mapping**:
   - **Word**: Convert `<del>` → Word XML `<w:del>` and `<ins>` → `<w:ins>` (Word's native track changes format).
   - **PDF**: Render with PDF annotations (strikethrough annotation for deletions, underline annotation for insertions).
   - **HTML**: Export as-is (already valid HTML with inline CSS).

**Accessibility Features** (NFR-005):
- `aria-label` on `<del>` and `<ins>` for screen reader announcements
- Color-independent visual cues (strikethrough, underline, background)
- High contrast mode support (thicker decorations, wavy/double styles)
- Sufficient color contrast ratios: Red (4.5:1), Green (7:1) per WCAG AA

**Alternatives Rejected**:
- **Rich text editor**: Overkill (100KB+) for read-only tracked changes display. Adds complexity (initialization, state management, event handling) for no benefit.
- **Plain text with colored spans**: Less semantic, poor screen reader support, harder to export.
- **Custom canvas rendering**: High complexity, poor accessibility, difficult export.

---

## Summary of Research Decisions

| Decision | Selected | Key Rationale |
|----------|----------|---------------|
| **Text Diff Library** | `diff-match-patch` | Industry standard, semantic diff, proven reliability, 5-10ms performance |
| **Caching Strategy** | In-memory Map (upgrade to Redis later) | Simplest, sub-1ms latency, works with SQLite, no external dependencies |
| **RBAC Implementation** | NextAuth + User.role + per-route checks | Simple 3-role model, extends existing auth, explicit permission checks |
| **Conflict Detection** | Timestamp comparison (updatedAt) | Simpler than version field, 99.9%+ reliability, Prisma auto-maintenance |
| **Tracked Changes Rendering** | `<del>`/`<ins>` HTML + CSS + React component | Semantic, accessible, lightweight, easy export, colorblind-friendly |

**All NEEDS CLARIFICATION items resolved**. Ready for Phase 1 (Design & Contracts).

---

**Next Phase**: Phase 1 - Generate `data-model.md`, `contracts/`, and `quickstart.md`.

