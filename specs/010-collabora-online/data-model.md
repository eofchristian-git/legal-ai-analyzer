# Data Model: Collabora Online Viewer Integration

**Feature**: 009 — Document Viewer Migration (ONLYOFFICE → Collabora)  
**Date**: 2026-02-18  
**Spec**: [plan.md](./plan.md)

---

## Overview

The migration from ONLYOFFICE to Collabora **simplifies** the data model.
ONLYOFFICE required a dedicated `OnlyOfficeSession` table for session lifecycle
management (access tokens, download tokens, document keys, editor lock state).
Collabora uses stateless WOPI access tokens (JWT), so no session table is needed.

## Schema Changes

### Entities to REMOVE

#### `OnlyOfficeSession` (DROP TABLE)

The `OnlyOfficeSession` model is no longer needed. WOPI access tokens are stateless
JWTs — token validation happens at request time without database lookups.

```prisma
// REMOVE: This entire model
model OnlyOfficeSession {
  id                String   @id @default(cuid())
  contractId        String
  contract          Contract @relation(fields: [contractId], references: [id], onDelete: Cascade)
  userId            String
  user              User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  documentKey       String   @unique
  accessToken       String
  downloadToken     String
  mode              String
  status            String   @default("active")
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
```

**Migration**: `npx prisma db push` (development) or create a migration that drops the table.

### Entities to MODIFY

#### `Contract` — Remove `onlyOfficeSessions` relation

```prisma
model Contract {
  id            String    @id @default(cuid())
  documentId    String
  document      Document  @relation(fields: [documentId], references: [id], onDelete: Cascade)
  title         String
  contractType  String?
  ourSide       String
  counterparty  String?
  deadline      DateTime?
  focusAreas    String?
  dealContext   String?
  status        String    @default("pending")
  createdBy     String?
  createdByUser User?     @relation("ContractsCreated", fields: [createdBy], references: [id])
  clientId      String?
  client        Client?   @relation(fields: [clientId], references: [id], onDelete: SetNull)
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt

  analysis         ContractAnalysis?
  activityLogs     ActivityLog[]
  contractDocument ContractDocument?  // DEPRECATED: Feature 008 viewer data
  // REMOVED: onlyOfficeSessions OnlyOfficeSession[]
}
```

#### `User` — Remove `onlyOfficeSessions` relation

```prisma
model User {
  id            String    @id @default(cuid())
  // ... existing fields ...
  
  // REMOVED: onlyOfficeSessions OnlyOfficeSession[]
}
```

### Entities UNCHANGED

| Entity | Reason |
|--------|--------|
| `Document` | Stores the DOCX file path and metadata. Collabora reads the file via WOPI GetFile. No changes. |
| `ContractAnalysis` | AI analysis data. Not related to the viewer. |
| `Clause` | Clause extraction data with text, position. Used for navigation (text search). No changes. |
| `Finding` | Analysis findings. Used for sidebar display. No changes. |
| `ClauseDecision` | Triage decisions (event sourcing). Backend mutates DOCX. Viewer just reloads. |
| `ActivityLog` | Audit trail. No changes. |
| `ContractDocument` | **Still deprecated** (Feature 008 legacy viewer). No changes needed from this migration. |

---

## WOPI Access Token (Stateless — No DB Table)

Instead of persisting sessions in the database, WOPI access tokens are
stateless JWTs containing:

```typescript
interface WopiAccessTokenPayload {
  /** The contract/file ID this token grants access to */
  fileId: string;
  /** The authenticated user ID */
  userId: string;
  /** User display name */
  userName: string;
  /** Permission level */
  permission: 'view' | 'edit';
  /** Token issued at (standard JWT claim) */
  iat: number;
  /** Token expires at (standard JWT claim) */
  exp: number;
}
```

**Expiration**: 4 hours (configurable).  
**Validation**: On every WOPI request, verify JWT signature and expiration.  
**Secret**: Uses `COLLABORA_JWT_SECRET` environment variable.

### Why No Session Table

| ONLYOFFICE Approach | Collabora/WOPI Approach |
|---------------------|------------------------|
| Store session in DB with access token, download token, document key, mode, status | Stateless JWT — no DB lookup needed |
| Session refresh via PATCH endpoint + DB update | Generate a new token (iframe URL update) |
| Session cleanup cron job to purge expired records | JWT naturally expires — nothing to clean up |
| Lock management via separate DB table/field | Not needed (read-only, no collaboration) |

### Optional: Audit-Only Session Logging

If audit logging of "who viewed what" is needed, log to the existing `ActivityLog`
table instead of maintaining a separate session table:

```typescript
// On WOPI CheckFileInfo (file access)
await db.activityLog.create({
  data: {
    contractId: fileId,
    userId: token.userId,
    action: 'DOCUMENT_VIEWED',
    details: JSON.stringify({ viewer: 'collabora', mode: 'view' }),
  },
});
```

---

## Migration Steps

1. **Remove** `OnlyOfficeSession` model from `prisma/schema.prisma`.
2. **Remove** `onlyOfficeSessions` relation from `Contract` model.
3. **Remove** `onlyOfficeSessions` relation from `User` model.
4. **Run** `npx prisma db push` (dev) or create a migration to drop the table.
5. **Verify** no code references `db.onlyOfficeSession` — all should be removed as part of the ONLYOFFICE cleanup.

---

## Entity Relationship Diagram (Post-Migration)

```
Document 1──* Contract
Contract 1──? ContractAnalysis
Contract 1──? ContractDocument (deprecated)
ContractAnalysis 1──* Clause
Clause 1──* Finding
Clause 1──* ClauseDecision
Contract 1──* ActivityLog
```

No new entities. The viewer is now a stateless integration — the DOCX file on
disk is the single source of truth, served via WOPI.
