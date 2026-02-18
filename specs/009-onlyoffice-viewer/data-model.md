# Data Model: ONLYOFFICE Document Viewer Integration

**Feature**: 009-onlyoffice-viewer  
**Date**: 2026-02-18  
**Purpose**: Define database schema and entity relationships for ONLYOFFICE integration

## Overview

This feature introduces a new `OnlyOfficeSession` entity to track active document viewing sessions with JWT tokens. It reuses existing entities (`Contract`, `Document`, `AnalysisFinding`, `ClauseDecision`) without modifications. The deprecated `ContractDocument` entity from Feature 008 will be removed after migration completes.

## Entity Definitions

### New Entity: OnlyOfficeSession

Represents an active ONLYOFFICE document viewing/editing session.

**Fields**:

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| `id` | String | Primary key, CUID | Unique session identifier |
| `contractId` | String | Foreign key, indexed | Reference to Contract being viewed |
| `userId` | String | Foreign key, indexed | User who created the session |
| `documentKey` | String | Unique, indexed | ONLYOFFICE document key (format: `contract-{contractId}-{timestamp}`) |
| `accessToken` | String | Not null | JWT token for ONLYOFFICE authentication (4-hour expiration) |
| `downloadToken` | String | Not null | JWT token for document download endpoint (1-hour expiration) |
| `mode` | String | Not null, enum | Session mode: `view` or `edit` |
| `status` | String | Not null, enum, default: `active` | Session status: `active`, `expired`, `revoked` |
| `expiresAt` | DateTime | Not null, indexed | Token expiration time (4 hours from creation) |
| `lastRefreshedAt` | DateTime | Nullable | Last token refresh timestamp |
| `createdAt` | DateTime | Not null, default: now() | Session creation timestamp |
| `updatedAt` | DateTime | Not null, auto-update | Last update timestamp |

**Relationships**:
- `contract` → `Contract` (many-to-one)
- `user` → `User` (many-to-one)

**Indexes**:
- Primary: `id`
- Unique: `documentKey`
- Foreign keys: `contractId`, `userId`
- Query optimization: `status`, `expiresAt` (for cleanup queries)

**Validation Rules**:
- `mode` must be either `'view'` or `'edit'`
- `status` must be one of: `'active'`, `'expired'`, `'revoked'`
- `expiresAt` must be in the future when status is `'active'`
- `documentKey` format: `contract-{contractId}-{timestamp}` (enforced at application level)
- `accessToken` and `downloadToken` must be valid JWT strings (enforced at application level)

**Lifecycle**:
1. **Creation**: Session created when user opens contract in ONLYOFFICE viewer
2. **Active**: Session remains active while user viewing/editing document
3. **Refresh**: `accessToken` refreshed every 3.5 hours; `lastRefreshedAt` updated
4. **Expiration**: After 4 hours without refresh, status → `expired`
5. **Revocation**: Admin or user can manually revoke session; status → `revoked`
6. **Cleanup**: Expired/revoked sessions deleted after 7 days (scheduled job)

---

### Existing Entity: Contract (No Changes)

Used to link sessions to contracts. No schema changes required.

**Relevant Fields**:
- `id`: Used as `contractId` foreign key in `OnlyOfficeSession`
- `documentId`: Used to retrieve file path for serving to ONLYOFFICE
- `status`: Used to determine session mode (`edit` if draft, `view` if finalized)

**Relationships**:
- `onlyOfficeSessions` → `OnlyOfficeSession[]` (one-to-many, new relationship)

---

### Existing Entity: Document (No Changes)

Used to retrieve contract file path for serving to ONLYOFFICE. No schema changes required.

**Relevant Fields**:
- `id`: Linked via `Contract.documentId`
- `filePath`: Used in download endpoint to serve file to ONLYOFFICE
- `filename`: Used in download response headers
- `fileType`: Used to validate supported formats (`.docx`, `.pdf`)

---

### Existing Entity: AnalysisFinding (No Changes)

Used to inject findings as ONLYOFFICE comments. No schema changes required.

**Relevant Fields**:
- `id`: Used as `findingId` in comment metadata
- `clauseId`: Used to group findings by clause
- `excerpt`: Used to search for text position in document
- `description`: Used as comment text content
- `riskLevel`: Mapped to comment color (RED/YELLOW/GREEN)
- `ruleId`: Included in comment metadata for traceability

---

### Existing Entity: ClauseDecision (No Changes)

Used to generate tracked changes from decision event log. No schema changes required.

**Relevant Fields**:
- `id`: Used as change identifier
- `clauseId`: Used to locate text in document
- `actionType`: Determines change type (fallback, edit)
- `fallbackTextId`: Used to retrieve replacement text
- `fallbackText.text`: Replacement text for tracked change
- `manualEdit`: User-edited text (if manual action)
- `createdBy`: Mapped to tracked change author
- `createdAt`: Mapped to tracked change timestamp

---

### Deprecated Entity: ContractDocument (Feature 008)

**Status**: Will be removed after ONLYOFFICE migration completes

This entity stored HTML-converted content and position mappings for the Feature 008 HTML viewer. No longer needed with ONLYOFFICE (handles rendering and positioning internally).

**Migration Plan**:
1. Keep table until all contracts migrated to ONLYOFFICE
2. Add deprecation notice in code comments
3. Create migration guide for existing contracts
4. After 100% migration, drop table via Prisma migration

---

## Prisma Schema Updates

```prisma
// New model for ONLYOFFICE sessions
model OnlyOfficeSession {
  id                String   @id @default(cuid())
  contractId        String
  contract          Contract @relation(fields: [contractId], references: [id], onDelete: Cascade)
  userId            String
  user              User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  
  // ONLYOFFICE identifiers
  documentKey       String   @unique
  
  // Authentication tokens
  accessToken       String   // JWT token for ONLYOFFICE authentication (4h expiry)
  downloadToken     String   // JWT token for document download (1h expiry)
  
  // Session configuration
  mode              String   // 'view' | 'edit'
  status            String   @default("active")  // 'active' | 'expired' | 'revoked'
  
  // Timestamps
  expiresAt         DateTime
  lastRefreshedAt   DateTime?
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt
  
  @@index([contractId])
  @@index([userId])
  @@index([status])
  @@index([expiresAt])
  @@index([createdAt])
}

// Update Contract model to add relationship
model Contract {
  // ... existing fields ...
  
  onlyOfficeSessions  OnlyOfficeSession[]  // NEW: Relationship to sessions
  
  // DEPRECATED: Will be removed after migration
  contractDocument    ContractDocument?    // Feature 008 viewer data
}

// Update User model to add relationship
model User {
  // ... existing fields ...
  
  onlyOfficeSessions  OnlyOfficeSession[]  // NEW: Relationship to sessions
}
```

---

## Database Migration

**Migration File**: `prisma/migrations/YYYYMMDDHHMMSS_add_onlyoffice_session/migration.sql`

```sql
-- CreateTable: OnlyOfficeSession
CREATE TABLE "OnlyOfficeSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "contractId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "documentKey" TEXT NOT NULL,
    "accessToken" TEXT NOT NULL,
    "downloadToken" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "expiresAt" DATETIME NOT NULL,
    "lastRefreshedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "OnlyOfficeSession_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "OnlyOfficeSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "OnlyOfficeSession_documentKey_key" ON "OnlyOfficeSession"("documentKey");
CREATE INDEX "OnlyOfficeSession_contractId_idx" ON "OnlyOfficeSession"("contractId");
CREATE INDEX "OnlyOfficeSession_userId_idx" ON "OnlyOfficeSession"("userId");
CREATE INDEX "OnlyOfficeSession_status_idx" ON "OnlyOfficeSession"("status");
CREATE INDEX "OnlyOfficeSession_expiresAt_idx" ON "OnlyOfficeSession"("expiresAt");
CREATE INDEX "OnlyOfficeSession_createdAt_idx" ON "OnlyOfficeSession"("createdAt");
```

---

## Data Access Patterns

### Create Session

```typescript
const session = await prisma.onlyOfficeSession.create({
  data: {
    contractId: contract.id,
    userId: user.id,
    documentKey: `contract-${contract.id}-${Date.now()}`,
    accessToken: generateAccessToken(contract.id, user.id, 'edit'),
    downloadToken: generateDownloadToken(contract.id),
    mode: contract.status === 'finalized' ? 'view' : 'edit',
    status: 'active',
    expiresAt: new Date(Date.now() + 4 * 60 * 60 * 1000), // 4 hours
  },
  include: {
    contract: {
      include: {
        document: true,
      },
    },
  },
});
```

### Refresh Token

```typescript
const session = await prisma.onlyOfficeSession.update({
  where: { id: sessionId },
  data: {
    accessToken: newAccessToken,
    lastRefreshedAt: new Date(),
    expiresAt: new Date(Date.now() + 4 * 60 * 60 * 1000), // Reset to 4 hours
    updatedAt: new Date(),
  },
});
```

### Find Active Sessions

```typescript
const activeSessions = await prisma.onlyOfficeSession.findMany({
  where: {
    contractId: contract.id,
    status: 'active',
    expiresAt: {
      gt: new Date(), // Not expired
    },
  },
  include: {
    user: {
      select: {
        id: true,
        name: true,
        email: true,
      },
    },
  },
  orderBy: {
    createdAt: 'desc',
  },
});
```

### Cleanup Expired Sessions

```typescript
// Scheduled job (runs daily)
const expiredSessions = await prisma.onlyOfficeSession.deleteMany({
  where: {
    OR: [
      {
        status: 'expired',
        createdAt: {
          lt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // 7 days old
        },
      },
      {
        status: 'revoked',
        createdAt: {
          lt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
        },
      },
    ],
  },
});
```

---

## Storage Considerations

### Estimated Storage Usage

**OnlyOfficeSession records**:
- Average record size: ~500 bytes (tokens are large)
- Expected concurrent sessions: 20 (Community Edition limit)
- Historical records (7-day retention): ~140 sessions (20 users × 1 session/day × 7 days)
- **Total storage**: ~70 KB (negligible)

**No impact on existing Document storage** — ONLYOFFICE serves files directly from existing file system storage.

### Cleanup Strategy

- **Expired sessions**: Deleted after 7 days
- **Revoked sessions**: Deleted after 7 days
- **Active sessions**: Never auto-deleted (user or admin must revoke)

**Scheduled Cleanup Job** (runs daily at 2 AM):
```typescript
// src/app/api/cron/cleanup-sessions/route.ts
export async function GET() {
  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  
  const deleted = await prisma.onlyOfficeSession.deleteMany({
    where: {
      status: { in: ['expired', 'revoked'] },
      createdAt: { lt: cutoff },
    },
  });
  
  return Response.json({ deleted: deleted.count });
}
```

---

## Validation & Constraints

### Application-Level Validation

```typescript
// src/lib/onlyoffice/validation.ts

export function validateSessionMode(mode: string): mode is 'view' | 'edit' {
  return mode === 'view' || mode === 'edit';
}

export function validateSessionStatus(status: string): boolean {
  return ['active', 'expired', 'revoked'].includes(status);
}

export function validateDocumentKey(key: string, contractId: string): boolean {
  const pattern = new RegExp(`^contract-${contractId}-\\d+$`);
  return pattern.test(key);
}

export function validateTokenExpiration(expiresAt: Date): boolean {
  return expiresAt > new Date();
}
```

### Database Constraints

- Foreign key cascading delete: If `Contract` or `User` deleted, associated sessions automatically deleted
- Unique constraint on `documentKey`: Prevents duplicate sessions for same document key
- Not-null constraints on required fields: Ensures data integrity

---

## Rollback Plan

If ONLYOFFICE integration needs to be rolled back:

1. **Keep OnlyOfficeSession table**: Don't drop immediately; may need for debugging
2. **Re-enable Feature 008 HTML viewer**: Revert contract page to use `DocumentViewer` component
3. **Keep ContractDocument table**: Already exists; no migration needed
4. **After 30 days**: If ONLYOFFICE not re-enabled, drop `OnlyOfficeSession` table via migration

---

## Related Entities (No Changes)

These existing entities are used by ONLYOFFICE integration but require no schema changes:

- **User**: Session ownership, tracked change attribution
- **FallbackText**: Replacement text for tracked changes
- **PlaybookRule**: Finding rule metadata (included in comments)
- **Client**: Contract ownership (used for permission checks)

---

## Performance Optimization

### Indexes

All critical query patterns are covered by indexes:
- Lookup by `contractId` → Fast retrieval of contract sessions
- Lookup by `userId` → Fast retrieval of user sessions
- Filter by `status` → Fast cleanup queries
- Filter by `expiresAt` → Fast expiration queries

### Query Optimization

- Use `select` to limit returned fields when full session not needed
- Use `include` sparingly (only when related data required)
- Batch session creation/updates when possible (collaborative scenarios)

### Caching Strategy

- Cache active sessions in memory (Redis or in-process cache) for 5 minutes
- Invalidate cache on token refresh or status change
- Reduces database queries for repeated session lookups

---

## Future Considerations

- **Multi-instance deployments**: Add `serverId` field to track which server hosts session
- **Audit trail**: Add `SessionActivity` model to track all session events (open, close, edit, export)
- **Usage analytics**: Track session duration, document load times, export frequency
- **Collaborative presence**: Add `activeUsers` JSON field with real-time user list
