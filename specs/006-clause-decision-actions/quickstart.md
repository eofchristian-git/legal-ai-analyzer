# Quickstart: Clause Decision Actions & Undo System

**Feature**: 006-clause-decision-actions  
**Date**: 2026-02-16  
**Purpose**: Step-by-step implementation guide for developers

---

## Overview

This guide walks through implementing the clause decision workflow feature, which allows contract reviewers to:
- **Accept** deviations from playbook (with optional comment)
- **Replace** clause text with playbook fallback language (tracked changes)
- **Edit** clause text manually (tracked changes)
- **Escalate** clauses to senior reviewers with reason and assignment
- **Add notes** for internal team communication
- **Undo** last decision (multiple levels supported)
- **Revert** to original counterparty text (clear all decisions)

**Technical Approach**: Append-only event sourcing with projection logic. All decisions stored in `ClauseDecision` table. Effective clause state computed from decision history. Projection results cached in-memory for performance.

**Estimated Implementation Time**: 3-5 days (1 developer)

---

## Prerequisites

### Dependencies Already Installed
- Next.js 14 (App Router)
- Prisma ORM with SQLite
- NextAuth.js
- shadcn/ui components
- Lucide-react icons
- Sonner toast notifications

### New Dependencies to Install

```bash
npm install diff-match-patch @types/diff-match-patch
```

**Rationale**: `diff-match-patch` for computing tracked changes (see `research.md` Decision #1).

### Environment Setup

1. **Database**: Ensure SQLite database exists at `prisma/dev.db`
2. **Auth**: NextAuth configured with session support
3. **Dev Server**: `npm run dev` running on `localhost:3000`

---

## Implementation Phases

### Phase 1: Database Schema (1-2 hours)

**Goal**: Add `ClauseDecision` entity, extend `AnalysisClause` and `User` models.

#### Step 1.1: Update Prisma Schema

**File**: `prisma/schema.prisma`

Add these models and enums:

```prisma
// New enum for decision action types
enum DecisionActionType {
  ACCEPT_DEVIATION
  APPLY_FALLBACK
  EDIT_MANUAL
  ESCALATE
  ADD_NOTE
  UNDO
  REVERT
}

// Extend User model with ClauseDecision relation
model User {
  // ... existing fields ...
  // role field already exists: role String @default("legal")
  
  // New relation
  decisions ClauseDecision[]
}

// NEW: Permission enum and RolePermission model (proper RBAC)
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
  
  @@unique([role, permission])
  @@index([role])
}

// Extend AnalysisClause with conflict detection timestamp
model AnalysisClause {
  // ... existing fields ...
  updatedAt    DateTime @updatedAt
  originalText String?  // Store original counterparty text
  
  // New relation
  decisions ClauseDecision[]
  
  @@index([id, updatedAt]) // For conflict detection
}

// New ClauseDecision model
model ClauseDecision {
  id         String              @id @default(cuid())
  clauseId   String
  userId     String
  actionType DecisionActionType
  timestamp  DateTime            @default(now())
  payload    Json
  
  // Relations
  clause     AnalysisClause @relation(fields: [clauseId], references: [id], onDelete: Cascade)
  user       User           @relation(fields: [userId], references: [id])
  
  @@index([clauseId, timestamp]) // For chronological replay
  @@index([clauseId])             // For cache invalidation
}
```

#### Step 1.2: Apply Database Migration

```bash
# Push schema changes to database (development)
npx prisma db push

# Generate Prisma Client with updated types
npx prisma generate
```

**Verification**:
```bash
# Check tables were created
sqlite3 prisma/dev.db ".tables"
# Should show: ClauseDecision

# Check User.role column exists
sqlite3 prisma/dev.db "PRAGMA table_info(User);"
# Should show: role column
```

#### Step 1.3: Data Migration for Existing Clauses

**One-time script**: Copy `clauseText` → `originalText` for existing clauses.

**File**: `scripts/migrate-original-text.ts` (create manually, run once)

```typescript
import { PrismaClient } from '@prisma/client';

const db = new PrismaClient();

async function migrateOriginalText() {
  const clauses = await db.analysisClause.findMany({
    where: { originalText: null },
    select: { id: true, clauseText: true },
  });
  
  console.log(`Migrating ${clauses.length} clauses...`);
  
  for (const clause of clauses) {
    await db.analysisClause.update({
      where: { id: clause.id },
      data: { originalText: clause.clauseText || '' },
    });
  }
  
  console.log('Migration complete!');
}

migrateOriginalText()
  .catch(console.error)
  .finally(() => db.$disconnect());
```

```bash
npx ts-node scripts/migrate-original-text.ts
```

**Phase 1 Complete** ✅

---

### Phase 2: TypeScript Types & Utilities (1-2 hours)

**Goal**: Define shared types, projection engine, tracked changes computation, caching layer.

#### Step 2.1: Create TypeScript Type Definitions

**File**: `src/types/decisions.ts` (create new)

```typescript
export type DecisionActionType =
  | 'ACCEPT_DEVIATION'
  | 'APPLY_FALLBACK'
  | 'EDIT_MANUAL'
  | 'ESCALATE'
  | 'ADD_NOTE'
  | 'UNDO'
  | 'REVERT';

// User roles (existing): "admin" | "compliance" | "legal"

export type ClauseStatus =
  | 'DEVIATION_DETECTED'
  | 'ACCEPTED'
  | 'RESOLVED_APPLIED_FALLBACK'
  | 'RESOLVED_MANUAL_EDIT'
  | 'ESCALATED';

// Decision payload types
export interface AcceptDeviationPayload {
  comment?: string;
  isAdminOverride?: boolean;
}

export interface ApplyFallbackPayload {
  replacementText: string;
  source: 'fallback' | 'preferred';
  playbookRuleId: string;
  isAdminOverride?: boolean;
}

export interface EditManualPayload {
  replacementText: string;
  isAdminOverride?: boolean;
}

export interface EscalatePayload {
  reason: 'Exceeds tolerance' | 'Commercial impact' | 'Regulatory' | 'Other';
  comment: string;
  assigneeId: string;
  reassignedByAdminId?: string;
}

export interface AddNotePayload {
  noteText: string;
}

export interface UndoPayload {
  undoneDecisionId: string;
}

export interface RevertPayload {
  // Empty payload
}

export type ClauseDecisionPayload =
  | AcceptDeviationPayload
  | ApplyFallbackPayload
  | EditManualPayload
  | EscalatePayload
  | AddNotePayload
  | UndoPayload
  | RevertPayload;

// Projection result
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

#### Step 2.2: Create Tracked Changes Utility

**File**: `src/lib/tracked-changes.ts` (create new)

```typescript
import DiffMatchPatch from 'diff-match-patch';
import type { TrackedChange } from '@/types/decisions';

export function computeTrackedChanges(oldText: string, newText: string): TrackedChange[] {
  const dmp = new DiffMatchPatch();
  dmp.Diff_Timeout = 1.0; // 1 second max
  dmp.Diff_EditCost = 4;   // Semantic cleanup threshold
  
  const diffs = dmp.diff_main(oldText, newText);
  dmp.diff_cleanupSemantic(diffs); // Human-readable diffs
  
  return diffs.map(([op, text], index) => ({
    type: op === 1 ? 'insert' : op === -1 ? 'delete' : 'equal',
    text,
    position: index,
  }));
}
```

#### Step 2.3: Create Projection Engine

**File**: `src/lib/projection.ts` (create new)

```typescript
import type { ClauseDecision, AnalysisClause } from '@prisma/client';
import type {
  ProjectionResult,
  ClauseStatus,
  UndoPayload,
  ApplyFallbackPayload,
  EditManualPayload,
  EscalatePayload,
} from '@/types/decisions';
import { computeTrackedChanges } from './tracked-changes';

export function computeProjection(
  clause: Pick<AnalysisClause, 'id' | 'originalText'>,
  decisions: ClauseDecision[]
): ProjectionResult {
  // Initialize with original state
  let currentText = clause.originalText || '';
  let currentStatus: ClauseStatus = 'DEVIATION_DETECTED';
  let escalatedTo: string | null = null;
  const activeDecisions: ClauseDecision[] = [];
  const undoneDecisionIds = new Set<string>();
  
  // Sort decisions chronologically
  const sortedDecisions = [...decisions].sort(
    (a, b) => a.timestamp.getTime() - b.timestamp.getTime()
  );
  
  // Replay decisions
  for (const decision of sortedDecisions) {
    // Handle UNDO: mark target decision as undone
    if (decision.actionType === 'UNDO') {
      const { undoneDecisionId } = decision.payload as UndoPayload;
      undoneDecisionIds.add(undoneDecisionId);
      continue;
    }
    
    // Handle REVERT: clear all prior decisions
    if (decision.actionType === 'REVERT') {
      currentText = clause.originalText || '';
      currentStatus = 'DEVIATION_DETECTED';
      escalatedTo = null;
      activeDecisions.length = 0;
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
        escalatedTo = null;
        break;
        
      case 'APPLY_FALLBACK': {
        const payload = decision.payload as ApplyFallbackPayload;
        currentText = payload.replacementText;
        currentStatus = 'RESOLVED_APPLIED_FALLBACK';
        escalatedTo = null;
        break;
      }
        
      case 'EDIT_MANUAL': {
        const payload = decision.payload as EditManualPayload;
        currentText = payload.replacementText;
        currentStatus = 'RESOLVED_MANUAL_EDIT';
        escalatedTo = null;
        break;
      }
        
      case 'ESCALATE': {
        const payload = decision.payload as EscalatePayload;
        currentStatus = 'ESCALATED';
        escalatedTo = payload.assigneeId;
        break;
      }
        
      case 'ADD_NOTE':
        // Notes don't affect effective text or status
        break;
    }
    
    activeDecisions.push(decision);
  }
  
  // Compute tracked changes
  const trackedChanges = computeTrackedChanges(clause.originalText || '', currentText);
  
  return {
    clauseId: clause.id,
    effectiveText: currentText,
    effectiveStatus: currentStatus,
    trackedChanges,
    lastDecisionTimestamp: activeDecisions[activeDecisions.length - 1]?.timestamp || null,
    decisionCount: activeDecisions.length,
    escalatedTo,
    hasConflict: false, // TODO: Implement conflict detection
  };
}
```

#### Step 2.4: Create Cache Layer

**File**: `src/lib/cache.ts` (create new)

```typescript
import type { ProjectionResult } from '@/types/decisions';

interface CachedProjection {
  result: ProjectionResult;
  timestamp: number;
}

// In-memory cache (Map)
const projectionCache = new Map<string, CachedProjection>();

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

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
  projectionCache.set(clauseId, {
    result,
    timestamp: Date.now(),
  });
}

export function invalidateCachedProjection(clauseId: string) {
  projectionCache.delete(clauseId);
}

export function getCacheStats() {
  return {
    size: projectionCache.size,
    maxSize: 10000,
  };
}
```

#### Step 2.5: Create Permission Utility

**File**: `src/lib/permissions.ts` (create new)

```typescript
import { db } from '@/lib/db';
import { User, Permission } from '@prisma/client';
import type { ClauseStatus } from '@/types/decisions';

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

export async function canAccessContractReview(user: User | null): Promise<boolean> {
  return hasPermission(user, 'REVIEW_CONTRACTS');
}

export async function canMakeDecisionOnClause(
  user: User | null,
  clause: { effectiveStatus: ClauseStatus; escalatedTo: string | null }
): Promise<boolean> {
  if (!user) return false;
  
  // Must have contract review access first
  const hasReviewAccess = await canAccessContractReview(user);
  if (!hasReviewAccess) return false;
  
  // Admin can always make decisions (override escalation locks)
  if (user.role === 'admin') return true;
  
  // If clause is escalated, only assigned user with approval permission can resolve
  if (clause.effectiveStatus === 'ESCALATED') {
    const isAssigned = clause.escalatedTo === user.id;
    const canApprove = await hasPermission(user, 'APPROVE_ESCALATIONS');
    return isAssigned && canApprove;
  }
  
  // Non-escalated: any user with review permission can make decisions
  return true;
}
```

**Phase 2 Complete** ✅

---

### Phase 3: API Routes (2-3 hours)

**Goal**: Implement decision actions, history retrieval, and projection caching endpoints.

#### Step 3.1: Create Decision Actions API Route

**File**: `src/app/api/clauses/[id]/decisions/route.ts` (create new)

```typescript
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import { computeProjection } from '@/lib/projection';
import { getCachedProjection, setCachedProjection, invalidateCachedProjection } from '@/lib/cache';
import { canMakeDecisionOnClause } from '@/lib/permissions';
import type { DecisionActionType, ClauseDecisionPayload } from '@/types/decisions';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Step 1: Authentication
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const { id: clauseId } = await params;
    const { actionType, payload, clauseUpdatedAtWhenLoaded } = await request.json() as {
      actionType: DecisionActionType;
      payload: ClauseDecisionPayload;
      clauseUpdatedAtWhenLoaded: string;
    };
    
    // Step 2: Load clause
    const clause = await db.analysisClause.findUnique({
      where: { id: clauseId },
      include: { decisions: { orderBy: { timestamp: 'asc' } } },
    });
    
    if (!clause) {
      return NextResponse.json({ error: 'Clause not found' }, { status: 404 });
    }
    
    // Step 3: Authorization (check escalation lock)
    const currentProjection = computeProjection(clause, clause.decisions);
    if (!canMakeDecisionOnClause(session.user, currentProjection)) {
      return NextResponse.json(
        { error: 'Cannot make decisions on escalated clauses unless assigned or admin' },
        { status: 403 }
      );
    }
    
    // Step 4: Conflict detection
    const isStale = new Date(clauseUpdatedAtWhenLoaded) < new Date(clause.updatedAt);
    let conflictWarning = null;
    
    if (isStale) {
      const lastDecision = clause.decisions[clause.decisions.length - 1];
      if (lastDecision) {
        const lastUser = await db.user.findUnique({
          where: { id: lastDecision.userId },
          select: { name: true },
        });
        
        conflictWarning = {
          message: `This clause was updated by ${lastUser?.name || 'another user'} while you were editing. Your change was saved but may conflict.`,
          lastUpdatedBy: lastUser?.name,
          lastUpdatedAt: clause.updatedAt,
        };
      }
    }
    
    // Step 5: Save decision
    const decision = await db.clauseDecision.create({
      data: {
        clauseId,
        userId: session.user.id,
        actionType,
        payload: payload as any, // Prisma Json type
      },
    });
    
    // Step 6: Cache invalidation
    invalidateCachedProjection(clauseId);
    
    // Step 7: Compute updated projection
    const updatedDecisions = [...clause.decisions, decision];
    const updatedProjection = computeProjection(clause, updatedDecisions);
    
    // Step 8: Cache the updated projection
    setCachedProjection(clauseId, updatedProjection);
    
    return NextResponse.json(
      {
        decision,
        updatedProjection,
        conflictWarning,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Failed to apply decision:', error);
    return NextResponse.json(
      { error: 'Failed to apply decision' },
      { status: 500 }
    );
  }
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Authentication
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const { id: clauseId } = await params;
    
    // Load decisions with filters (future enhancement)
    const decisions = await db.clauseDecision.findMany({
      where: { clauseId },
      include: { user: { select: { name: true, role: true } } },
      orderBy: { timestamp: 'asc' },
    });
    
    // Load clause info
    const clause = await db.analysisClause.findUnique({
      where: { id: clauseId },
      select: {
        id: true,
        clauseNumber: true,
        clauseName: true,
        originalText: true,
      },
    });
    
    if (!clause) {
      return NextResponse.json({ error: 'Clause not found' }, { status: 404 });
    }
    
    // Compute current projection
    const projection = computeProjection(clause, decisions);
    
    // Mark undone decisions
    const undoneIds = new Set(
      decisions
        .filter(d => d.actionType === 'UNDO')
        .map(d => (d.payload as any).undoneDecisionId)
    );
    
    const decisionsWithMeta = decisions.map(d => ({
      ...d,
      isUndone: undoneIds.has(d.id),
    }));
    
    return NextResponse.json({
      decisions: decisionsWithMeta,
      clauseInfo: {
        ...clause,
        currentEffectiveText: projection.effectiveText,
        currentEffectiveStatus: projection.effectiveStatus,
      },
      totalCount: decisions.length,
    });
  } catch (error) {
    console.error('Failed to load decision history:', error);
    return NextResponse.json(
      { error: 'Failed to load decision history' },
      { status: 500 }
    );
  }
}
```

#### Step 3.2: Create Projection API Route

**File**: `src/app/api/clauses/[id]/projection/route.ts` (create new)

```typescript
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import { computeProjection } from '@/lib/projection';
import { getCachedProjection, setCachedProjection } from '@/lib/cache';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const { id: clauseId } = await params;
    const { searchParams } = new URL(request.url);
    const bypassCache = searchParams.get('bypassCache') === 'true';
    
    const startTime = Date.now();
    
    // Check cache (unless bypassed)
    if (!bypassCache) {
      const cached = getCachedProjection(clauseId);
      if (cached) {
        const computationTimeMs = Date.now() - startTime;
        return NextResponse.json({
          projection: cached,
          cacheInfo: {
            cacheHit: true,
            computedAt: new Date(),
            computationTimeMs,
          },
        });
      }
    }
    
    // Cache miss: load and compute
    const clause = await db.analysisClause.findUnique({
      where: { id: clauseId },
      select: {
        id: true,
        originalText: true,
        decisions: {
          orderBy: { timestamp: 'asc' },
        },
      },
    });
    
    if (!clause) {
      return NextResponse.json({ error: 'Clause not found' }, { status: 404 });
    }
    
    // Compute projection
    const projection = computeProjection(clause, clause.decisions);
    
    // Cache result
    setCachedProjection(clauseId, projection);
    
    const computationTimeMs = Date.now() - startTime;
    
    return NextResponse.json({
      projection,
      cacheInfo: {
        cacheHit: false,
        computedAt: new Date(),
        computationTimeMs,
      },
    });
  } catch (error) {
    console.error('Failed to compute projection:', error);
    return NextResponse.json(
      { error: 'Failed to compute projection' },
      { status: 500 }
    );
  }
}
```

**Phase 3 Complete** ✅

---

### Phase 4: UI Components (3-4 hours)

**Goal**: Build decision buttons, tracked changes display, decision history log, escalation modal.

**Note**: Due to space constraints, showing key components only. Full implementation in `src/app/(app)/contracts/[id]/_components/`.

#### Step 4.1: Decision Buttons Component

**File**: `src/app/(app)/contracts/[id]/_components/decision-buttons.tsx` (create new)

```typescript
'use client';

import { Button } from '@/components/ui/button';
import { Check, RefreshCw, Edit, ArrowUp, MessageSquare, Undo, RotateCcw } from 'lucide-react';

interface DecisionButtonsProps {
  clauseId: string;
  clauseStatus: string;
  hasDecisions: boolean;
  onAction: (action: string) => void;
}

export function DecisionButtons({
  clauseId,
  clauseStatus,
  hasDecisions,
  onAction,
}: DecisionButtonsProps) {
  return (
    <div className="flex flex-wrap gap-2 p-4 border-t">
      {/* Primary Actions */}
      <Button
        onClick={() => onAction('ACCEPT_DEVIATION')}
        variant="outline"
        size="sm"
      >
        <Check className="w-4 h-4 mr-2" />
        Accept deviation
      </Button>
      
      <Button
        onClick={() => onAction('APPLY_FALLBACK')}
        variant="outline"
        size="sm"
      >
        <RefreshCw className="w-4 h-4 mr-2" />
        Replace with fallback
      </Button>
      
      <Button
        onClick={() => onAction('EDIT_MANUAL')}
        variant="outline"
        size="sm"
      >
        <Edit className="w-4 h-4 mr-2" />
        Edit manually
      </Button>
      
      <Button
        onClick={() => onAction('ESCALATE')}
        variant="outline"
        size="sm"
      >
        <ArrowUp className="w-4 h-4 mr-2" />
        Escalate
      </Button>
      
      <Button
        onClick={() => onAction('ADD_NOTE')}
        variant="ghost"
        size="sm"
      >
        <MessageSquare className="w-4 h-4 mr-2" />
        Add note
      </Button>
      
      {/* Safety Actions */}
      {hasDecisions && (
        <>
          <div className="w-full border-t my-2" />
          <Button
            onClick={() => onAction('UNDO')}
            variant="ghost"
            size="sm"
          >
            <Undo className="w-4 h-4 mr-2" />
            Undo
          </Button>
          
          <Button
            onClick={() => onAction('REVERT')}
            variant="ghost"
            size="sm"
          >
            <RotateCcw className="w-4 h-4 mr-2" />
            Revert to original
          </Button>
        </>
      )}
    </div>
  );
}
```

#### Step 4.2: Tracked Changes Display Component

**File**: `src/app/(app)/contracts/[id]/_components/tracked-changes.tsx` (create new)

```typescript
'use client';

import type { TrackedChange } from '@/types/decisions';

interface TrackedChangesProps {
  changes: TrackedChange[];
}

export function TrackedChanges({ changes }: TrackedChangesProps) {
  return (
    <div className="tracked-changes-container">
      {changes.map((change, idx) => {
        if (change.type === 'equal') {
          return <span key={idx}>{change.text}</span>;
        }
        if (change.type === 'delete') {
          return (
            <del
              key={idx}
              className="tracked-delete bg-red-50 text-red-700 line-through px-0.5 rounded"
              aria-label="Deleted text"
            >
              {change.text}
            </del>
          );
        }
        if (change.type === 'insert') {
          return (
            <ins
              key={idx}
              className="tracked-insert bg-green-50 text-green-700 underline px-0.5 rounded"
              aria-label="Inserted text"
            >
              {change.text}
            </ins>
          );
        }
      })}
    </div>
  );
}
```

**Phase 4 Complete** ✅

---

## Testing Scenarios

### Scenario 1: Accept Deviation
1. Load contract with playbook deviations
2. Click "Accept deviation" on one finding
3. Verify clause status changes to ACCEPTED (badge + tag)
4. Verify decision persists (reload page, status still ACCEPTED)

### Scenario 2: Replace with Fallback
1. Click "Replace with fallback" on finding with fallback language
2. Verify tracked changes display (red strikethrough, green underline)
3. Verify clause status updates to RESOLVED_APPLIED_FALLBACK

### Scenario 3: Manual Edit
1. Click "Edit manually"
2. Modify text in inline editor, save
3. Verify tracked changes show diff from effective text (not original)
4. Verify status updates to RESOLVED_MANUAL_EDIT

### Scenario 4: Escalate
1. Click "Escalate"
2. Select reason, add comment, choose assignee, confirm
3. Verify status ESCALATED, viewer shows "Escalated to [name]"
4. As non-assigned user, verify actions are locked

### Scenario 5: Undo
1. Make a decision (e.g., accept)
2. Click "Undo"
3. Verify clause reverts to previous state
4. Verify decision history shows undone decision with strikethrough

---

## Deployment Checklist

- [ ] Database migration applied to production (`npx prisma migrate deploy`)
- [ ] Environment variables configured
- [ ] User roles assigned (promote approvers/admins)
- [ ] Cache monitoring enabled (hit rate, size)
- [ ] Performance testing (500-clause contract, 100 decisions per clause)
- [ ] Security audit (API-level permission checks)
- [ ] Rollback plan reviewed

---

**Quickstart Complete**: All implementation steps documented.

