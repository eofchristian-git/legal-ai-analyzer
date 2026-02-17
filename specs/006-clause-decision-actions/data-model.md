# Data Model: Clause Decision Actions & Undo System

**Feature**: 006-clause-decision-actions  
**Date**: 2026-02-16  
**Purpose**: Define database schema, projection algorithm, and caching strategy

---

## Overview

This feature extends the database schema with a new `ClauseDecision` entity for append-only decision history. The projection engine computes effective clause state (text, status, tracked changes) by replaying the decision history chronologically, with special handling for UNDO and REVERT markers. Projection results are cached per-clause in memory for performance.

**Key Principles**:
- **Append-only history**: Never delete or modify `ClauseDecision` records (Constitution Principle I: Data Integrity)
- **Single source of truth**: Effective clause state is computed from decision history, not stored
- **Cache coherence**: Projection cache invalidated on any decision write

---

## New Entity: ClauseDecision

**Purpose**: Store a single decision action applied to a clause by a reviewer.

### Prisma Schema

```prisma
model ClauseDecision {
  id        String   @id @default(cuid())
  clauseId  String   // FK to AnalysisClause
  userId    String   // FK to User (who made the decision)
  actionType DecisionActionType
  timestamp DateTime @default(now())
  payload   Json     // Action-specific data (see payload schema below)
  
  // Relations
  clause    AnalysisClause @relation(fields: [clauseId], references: [id], onDelete: Cascade)
  user      User           @relation(fields: [userId], references: [id])
  
  @@index([clauseId, timestamp]) // For chronological replay
  @@index([clauseId]) // For cache invalidation
}

enum DecisionActionType {
  ACCEPT_DEVIATION    // Accept counterparty language (no text change)
  APPLY_FALLBACK      // Replace with playbook fallback language
  EDIT_MANUAL         // Manual edit of clause text
  ESCALATE            // Escalate to senior reviewer
  ADD_NOTE            // Internal team note
  UNDO                // Undo a previous decision
  REVERT              // Revert to original (ignore all prior decisions)
}
```

### Payload Schema (JSON)

**Payload is a JSON object with action-specific fields. TypeScript interfaces:**

```typescript
type ClauseDecisionPayload =
  | AcceptDeviationPayload
  | ApplyFallbackPayload
  | EditManualPayload
  | EscalatePayload
  | AddNotePayload
  | UndoPayload
  | RevertPayload;

interface AcceptDeviationPayload {
  comment?: string;                 // Optional explanation
  isAdminOverride?: boolean;        // True if admin resolves escalated clause
}

interface ApplyFallbackPayload {
  replacementText: string;           // Fallback language from playbook
  source: 'fallback' | 'preferred';  // Which variant was used
  playbookRuleId: string;            // Reference to PlaybookRule
  isAdminOverride?: boolean;
}

interface EditManualPayload {
  replacementText: string;           // Custom edited text
  isAdminOverride?: boolean;
}

interface EscalatePayload {
  reason: 'Exceeds tolerance' | 'Commercial impact' | 'Regulatory' | 'Other';
  comment: string;                   // Context for escalation
  assigneeId: string;                // User ID of assigned approver
  reassignedByAdminId?: string;      // If admin reassigned
}

interface AddNotePayload {
  noteText: string;                  // Internal note content
}

interface UndoPayload {
  undoneDecisionId: string;          // Reference to the decision being undone
}

interface RevertPayload {
  // Empty - no payload needed (revert marker)
}
```

**Validation Rules**:
- `userId` MUST exist in `User` table (FK constraint)
- `clauseId` MUST exist in `AnalysisClause` table (FK constraint)
- `timestamp` MUST be set by database (not client-provided)
- `payload` MUST conform to schema for `actionType`
- `undoneDecisionId` (for UNDO) MUST reference an existing `ClauseDecision.id`

---

## Modified Entity: AnalysisClause

**Purpose**: Extend with cache invalidation timestamp for conflict detection.

### Prisma Schema Changes

```prisma
model AnalysisClause {
  // ... existing fields from Feature 005 ...
  id        String   @id @default(cuid())
  position  Int      // Existing: order in contract
  clauseNumber       String?  // Existing: from document (e.g. "3.1")
  clauseName         String?  // Existing: title
  originalText       String   // NEW: store original counterparty text
  // NOTE: clauseText field from Feature 005 is deprecated for this feature
  //       (use originalText + projection for effective text)
  
  updatedAt DateTime @updatedAt  // NEW: auto-updated by Prisma for conflict detection
  
  // Relations
  analysis   ContractAnalysis @relation(fields: [analysisId], references: [id])
  findings   AnalysisFinding[]
  decisions  ClauseDecision[]     // NEW: decision history
  
  @@index([analysisId, position])
  @@index([id, updatedAt]) // For conflict detection
}
```

**Migration Notes**:
1. Add `updatedAt` field with `@updatedAt` directive (Prisma auto-maintains).
2. Add `originalText` field: For existing clauses, copy `clauseText` → `originalText` (one-time migration).
3. Add `decisions` relation (one-to-many with `ClauseDecision`).

**Computed Fields** (not stored in DB):
- `effectiveText: string` - Computed by projection engine
- `effectiveStatus: string` - Computed by projection engine (e.g., "ACCEPTED", "ESCALATED", "RESOLVED_APPLIED_FALLBACK")
- `trackedChanges: TrackedChange[]` - Computed diff for UI rendering

---

## Modified Entity: User

**Purpose**: Add relation to `ClauseDecision` for tracking decision history.

### Prisma Schema Changes

```prisma
model User {
  id       String   @id @default(cuid())
  email    String   @unique
  name     String
  password String
  role     String   @default("legal")  // EXISTING: "admin", "compliance", "legal"
  
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  
  // Relations
  decisions ClauseDecision[]  // NEW: decisions made by this user
  
  // ... existing relations ...
}
```

**Migration Notes**:
1. Add `decisions` relation (one-to-many with `ClauseDecision`).
2. No schema changes to User table itself (permissions managed via RolePermission table).

---

## New Entity: RolePermission

**Purpose**: Maps roles to permissions for granular access control (proper RBAC).

### Prisma Schema

```prisma
enum Permission {
  REVIEW_CONTRACTS        // Access to contract analysis and clause decisions
  APPROVE_ESCALATIONS     // Resolve escalated clauses when assigned
  MANAGE_USERS           // Admin: user management (future)
  MANAGE_PLAYBOOK        // Admin: playbook management (future)
}

model RolePermission {
  id         String     @id @default(cuid())
  role       String     // "admin", "legal", "compliance"
  permission Permission
  createdAt  DateTime   @default(now())
  
  @@unique([role, permission])  // One permission record per role-permission pair
  @@index([role])               // Fast lookup by role
}
```

**Migration SQL**:
```sql
-- Create Permission enum
CREATE TYPE Permission AS ENUM (
  'REVIEW_CONTRACTS',
  'APPROVE_ESCALATIONS',
  'MANAGE_USERS',
  'MANAGE_PLAYBOOK'
);

-- Create RolePermission table
CREATE TABLE RolePermission (
  id         TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  role       TEXT NOT NULL,
  permission TEXT NOT NULL,  -- Maps to Permission enum
  createdAt  DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(role, permission)
);

CREATE INDEX idx_role_permission_role ON RolePermission(role);

-- Seed default permissions
INSERT INTO RolePermission (id, role, permission) VALUES
  ('perm_legal_review', 'legal', 'REVIEW_CONTRACTS'),
  ('perm_legal_approve', 'legal', 'APPROVE_ESCALATIONS');
  
-- Compliance role: NO permissions (explicitly excluded from contract review)
-- Admin role: NO records (code fallback grants all permissions)
```

**Permission Matrix**:
| Role | REVIEW_CONTRACTS | APPROVE_ESCALATIONS | Access Contract Review | Can Resolve Escalations |
|------|-----------------|---------------------|----------------------|------------------------|
| `legal` | ✅ (DB) | ✅ (DB) | Yes | Yes (when assigned) |
| `compliance` | ❌ (not in DB) | ❌ (not in DB) | No | No |
| `admin` | ✅ (code fallback) | ✅ (code fallback) | Yes (always) | Yes (override) |

---

## Projection Engine Algorithm

**Purpose**: Compute effective clause state (text, status, tracked changes) from decision history.

### Input

- `clauseId: string` - Which clause to project
- `decisions: ClauseDecision[]` - All decisions for this clause, sorted chronologically by `timestamp`

### Output

```typescript
interface ProjectionResult {
  clauseId: string;
  effectiveText: string;              // Final text after applying decisions
  effectiveStatus: ClauseStatus;      // Final status (e.g., ACCEPTED, ESCALATED)
  trackedChanges: TrackedChange[];    // Diffs for UI rendering
  lastDecisionTimestamp: Date | null; // When last decision was made
  decisionCount: number;              // Number of active (not undone) decisions
  escalatedTo: string | null;         // User ID if escalated, null otherwise
  hasConflict: boolean;               // True if conflicting decisions detected
}

interface TrackedChange {
  type: 'insert' | 'delete' | 'equal';
  text: string;
  position: number;
}

type ClauseStatus = 
  | 'DEVIATION_DETECTED'           // Initial state (from analysis)
  | 'ACCEPTED'                     // After ACCEPT_DEVIATION
  | 'RESOLVED_APPLIED_FALLBACK'   // After APPLY_FALLBACK
  | 'RESOLVED_MANUAL_EDIT'        // After EDIT_MANUAL
  | 'ESCALATED';                   // After ESCALATE
```

### Algorithm Pseudocode

```typescript
function computeProjection(clause: AnalysisClause, decisions: ClauseDecision[]): ProjectionResult {
  // Initialize with original state
  let currentText = clause.originalText;
  let currentStatus: ClauseStatus = 'DEVIATION_DETECTED';
  let escalatedTo: string | null = null;
  let activeDecisions: ClauseDecision[] = [];
  let undoneDecisionIds = new Set<string>();
  
  // Replay decisions chronologically
  for (const decision of decisions.sort((a, b) => a.timestamp - b.timestamp)) {
    // Handle UNDO: mark target decision as undone, skip processing
    if (decision.actionType === 'UNDO') {
      const { undoneDecisionId } = decision.payload as UndoPayload;
      undoneDecisionIds.add(undoneDecisionId);
      continue;
    }
    
    // Handle REVERT: clear all prior decisions, reset to original
    if (decision.actionType === 'REVERT') {
      currentText = clause.originalText;
      currentStatus = 'DEVIATION_DETECTED';
      escalatedTo = null;
      activeDecisions = [];
      undoneDecisionIds.clear();
      continue;
    }
    
    // Skip if this decision was undone
    if (undoneDecisionIds.has(decision.id)) {
      continue;
    }
    
    // Apply decision based on actionType
    switch (decision.actionType) {
      case 'ACCEPT_DEVIATION':
        currentStatus = 'ACCEPTED';
        escalatedTo = null; // Accepting resolves escalation
        break;
        
      case 'APPLY_FALLBACK':
        const { replacementText: fallbackText } = decision.payload as ApplyFallbackPayload;
        currentText = fallbackText;
        currentStatus = 'RESOLVED_APPLIED_FALLBACK';
        escalatedTo = null;
        break;
        
      case 'EDIT_MANUAL':
        const { replacementText: editedText } = decision.payload as EditManualPayload;
        currentText = editedText;
        currentStatus = 'RESOLVED_MANUAL_EDIT';
        escalatedTo = null;
        break;
        
      case 'ESCALATE':
        const { assigneeId } = decision.payload as EscalatePayload;
        currentStatus = 'ESCALATED';
        escalatedTo = assigneeId;
        break;
        
      case 'ADD_NOTE':
        // Notes don't affect effective text or status
        break;
    }
    
    activeDecisions.push(decision);
  }
  
  // Compute tracked changes (diff from original to current)
  const trackedChanges = computeTrackedChanges(clause.originalText, currentText);
  
  return {
    clauseId: clause.id,
    effectiveText: currentText,
    effectiveStatus: currentStatus,
    trackedChanges,
    lastDecisionTimestamp: activeDecisions[activeDecisions.length - 1]?.timestamp || null,
    decisionCount: activeDecisions.length,
    escalatedTo,
    hasConflict: false, // TODO: Detect conflicting decisions by timestamp gaps
  };
}
```

**Key Algorithm Properties**:
1. **Chronological replay**: Decisions applied in timestamp order (database index ensures efficient sort).
2. **UNDO handling**: Marks target decision as inactive, doesn't affect projection. Supports multiple levels of undo (undo, then undo again).
3. **REVERT handling**: Clears all prior decisions, resets to original state. New decisions after REVERT start fresh.
4. **Idempotent**: Same input always produces same output (deterministic projection).
5. **Performance**: O(n) where n = decision count. Cached result makes subsequent reads O(1).

---

## Caching Strategy

**Purpose**: Avoid recomputing projection on every clause read (performance requirement: < 500ms response time).

### Cache Schema

**Storage**: In-memory `Map<string, CachedProjection>` (per research Decision #2)

```typescript
interface CachedProjection {
  result: ProjectionResult;  // Computed projection result
  timestamp: number;         // Cache entry creation time (for TTL)
}

const projectionCache = new Map<string, CachedProjection>();
```

**Cache Key**: `clauseId` (UUID from database)

**Cache TTL**: 5 minutes (backup for cache invalidation bugs, per Risk #6 mitigation)

### Cache Operations

**1. Read (GET /api/clauses/[id]/projection)**:
```typescript
function getCachedProjection(clauseId: string): ProjectionResult | null {
  const cached = projectionCache.get(clauseId);
  if (!cached) return null;
  
  // TTL check (backup for invalidation failures)
  if (Date.now() - cached.timestamp > 5 * 60 * 1000) {
    projectionCache.delete(clauseId);
    return null;
  }
  
  return cached.result;
}
```

**2. Write (after computing projection)**:
```typescript
function setCachedProjection(clauseId: string, result: ProjectionResult) {
  projectionCache.set(clauseId, {
    result,
    timestamp: Date.now(),
  });
}
```

**3. Invalidate (on decision write)**:
```typescript
function invalidateCachedProjection(clauseId: string) {
  projectionCache.delete(clauseId);
}
```

**Invalidation Triggers** (FR-041):
- POST /api/clauses/[id]/decisions → Invalidate `clauseId`
- POST /api/clauses/[id]/decisions/[decisionId]/undo → Invalidate `clauseId`
- Any write to `ClauseDecision` table → Invalidate affected `clauseId`

**Cache Metrics** (for monitoring):
- Hit rate: Track hits/(hits+misses), target 80%+ (NFR-013)
- Cache size: Track entry count, cap at 10,000 (prevent memory leaks)
- Invalidation rate: Track invalidations/second (detect excessive writes)

---

## Database Migration Script

**File**: `prisma/migrations/YYYYMMDDHHMMSS_add_clause_decisions/migration.sql`

```sql
-- Create Permission enum
CREATE TYPE "Permission" AS ENUM (
  'REVIEW_CONTRACTS',
  'APPROVE_ESCALATIONS',
  'MANAGE_USERS',
  'MANAGE_PLAYBOOK'
);

-- Create RolePermission table
CREATE TABLE "RolePermission" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "role" TEXT NOT NULL,
    "permission" "Permission" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Create unique constraint and index
CREATE UNIQUE INDEX "RolePermission_role_permission_key" ON "RolePermission"("role", "permission");
CREATE INDEX "RolePermission_role_idx" ON "RolePermission"("role");

-- Seed default permissions for legal role
INSERT INTO "RolePermission" ("id", "role", "permission", "createdAt") VALUES
  ('perm_legal_review', 'legal', 'REVIEW_CONTRACTS', CURRENT_TIMESTAMP),
  ('perm_legal_approve', 'legal', 'APPROVE_ESCALATIONS', CURRENT_TIMESTAMP);

-- Add updatedAt to AnalysisClause
ALTER TABLE "AnalysisClause" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Add originalText to AnalysisClause (copy from clauseText)
ALTER TABLE "AnalysisClause" ADD COLUMN "originalText" TEXT NOT NULL DEFAULT '';
UPDATE "AnalysisClause" SET "originalText" = "clauseText";

-- Create DecisionActionType enum
CREATE TYPE "DecisionActionType" AS ENUM (
  'ACCEPT_DEVIATION',
  'APPLY_FALLBACK',
  'EDIT_MANUAL',
  'ESCALATE',
  'ADD_NOTE',
  'UNDO',
  'REVERT'
);

-- Create ClauseDecision table
CREATE TABLE "ClauseDecision" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clauseId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "actionType" "DecisionActionType" NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "payload" JSONB NOT NULL,
    CONSTRAINT "ClauseDecision_clauseId_fkey" FOREIGN KEY ("clauseId") REFERENCES "AnalysisClause" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ClauseDecision_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- Create indexes
CREATE INDEX "ClauseDecision_clauseId_timestamp_idx" ON "ClauseDecision"("clauseId", "timestamp");
CREATE INDEX "ClauseDecision_clauseId_idx" ON "ClauseDecision"("clauseId");
CREATE INDEX "AnalysisClause_id_updatedAt_idx" ON "AnalysisClause"("id", "updatedAt");

-- Note: For SQLite, replace JSONB with TEXT and enums with TEXT CHECK constraints
```

---

## TypeScript Interfaces

**File**: `src/types/decisions.ts`

```typescript
export type DecisionActionType =
  | 'ACCEPT_DEVIATION'
  | 'APPLY_FALLBACK'
  | 'EDIT_MANUAL'
  | 'ESCALATE'
  | 'ADD_NOTE'
  | 'UNDO'
  | 'REVERT';

// User roles (existing in app): "admin" | "compliance" | "legal"

export type ClauseStatus =
  | 'DEVIATION_DETECTED'
  | 'ACCEPTED'
  | 'RESOLVED_APPLIED_FALLBACK'
  | 'RESOLVED_MANUAL_EDIT'
  | 'ESCALATED';

export interface ClauseDecision {
  id: string;
  clauseId: string;
  userId: string;
  actionType: DecisionActionType;
  timestamp: Date;
  payload: ClauseDecisionPayload;
  clause?: AnalysisClause;
  user?: User;
}

export type ClauseDecisionPayload =
  | AcceptDeviationPayload
  | ApplyFallbackPayload
  | EditManualPayload
  | EscalatePayload
  | AddNotePayload
  | UndoPayload
  | RevertPayload;

// ... (payload interfaces as defined earlier)

export interface ProjectionResult {
  clauseId: string;
  effectiveText: string;
  effectiveStatus: ClauseStatus;
  trackedChanges: TrackedChange[];
  lastDecisionTimestamp: Date | null;
  decisionCount: number;
  escalatedTo: string | null;
  hasConflict: boolean;
}

export interface TrackedChange {
  type: 'insert' | 'delete' | 'equal';
  text: string;
  position: number;
}
```

---

## State Transitions

**Clause Effective Status State Machine**:

```
                         ┌─────────────────────┐
                         │  DEVIATION_DETECTED │ (initial)
                         └─────────────────────┘
                                    │
         ┌──────────────────────────┼──────────────────────────┐
         │                          │                          │
         │ ACCEPT_DEVIATION         │ APPLY_FALLBACK          │ EDIT_MANUAL
         │                          │ or EDIT_MANUAL          │
         ▼                          ▼                          ▼
    ┌──────────┐        ┌─────────────────────────┐  ┌────────────────────────┐
    │ ACCEPTED │        │ RESOLVED_APPLIED_FALLBACK│  │ RESOLVED_MANUAL_EDIT   │
    └──────────┘        │ or RESOLVED_MANUAL_EDIT  │  └────────────────────────┘
         │              └─────────────────────────┘            │
         │                          │                          │
         │ ESCALATE ┌───────────────┼──────────────────────────┘
         └──────────►│   ESCALATED  │◄─────────────────────────┘
                     └──────────────┘
                            │
                            │ Any decision by assigned approver/admin
                            │ (ACCEPT, APPLY_FALLBACK, EDIT_MANUAL)
                            ▼
                  ┌──────────────────┐
                  │ [Resolution state]│
                  │ (ACCEPTED, etc.)  │
                  └──────────────────┘

Special transitions:
- UNDO: Revert to previous state (walk backward in decision chain)
- REVERT: Jump back to DEVIATION_DETECTED (ignore all prior decisions)
- Any state → ESCALATED (escalate action available in all states)
```

---

## Performance Characteristics

| Operation | Complexity | Target Time | Notes |
|-----------|------------|-------------|-------|
| **Compute projection (uncached)** | O(n) | < 100ms for n=100 decisions | Chronological replay + diff computation |
| **Compute projection (cached)** | O(1) | < 1ms | In-memory Map lookup |
| **Write decision** | O(1) | < 50ms | Database insert + cache invalidation |
| **Load decision history** | O(n log n) | < 200ms for n=50 | Database query with index |
| **Contract load (500 clauses)** | O(m) | < 2s for m=500 clauses | Projection for each clause (cached after first load) |

**Cache Hit Rate Target**: 80%+ (NFR-013)  
**Memory Usage**: ~10MB for 10,000 cached clauses (1KB per ProjectionResult)

---

## Data Integrity Guarantees

1. **Append-only history**: `ClauseDecision` records never deleted or modified (CASCADE delete only if parent clause deleted).
2. **Foreign key constraints**: `clauseId` and `userId` must exist (referential integrity).
3. **Timestamp immutability**: `timestamp` set by database, not client (prevents tampering).
4. **Payload validation**: Application-level validation ensures payload matches actionType schema (Prisma JSON type allows flexible payloads).
5. **Cache coherence**: Cache invalidated on every write (defensive TTL as backup).

**Audit Trail**: Every decision records who (`userId`), what (`actionType`), when (`timestamp`), and why (`payload.comment`/`payload.reason`).

---

**Phase 1 Complete**: Data model defined. Next: Generate API contracts.

