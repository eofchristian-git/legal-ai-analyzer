# Data Model: Client Management

**Feature**: `004-client-management` | **Date**: 2026-02-13

## New Models

### Client

Represents an external party the organization does business with.

```prisma
model Client {
  id              String    @id @default(cuid())
  name            String
  country         String                          // ISO 3166-1 alpha-2 code (e.g., "US", "DE")
  industry        String?                         // Predefined: Technology, Finance, Healthcare, etc.
  contactPerson   String?
  contactEmail    String?
  contactPhone    String?
  notes           String?
  deleted         Boolean   @default(false)
  deletedAt       DateTime?
  createdBy       String?
  createdByUser   User?     @relation("ClientsCreated", fields: [createdBy], references: [id])
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt

  contracts       ClientContract[]
  reviewContracts Contract[]                      // Reviews initiated from this client's contracts
}
```

| Field | Type | Required | Validation | Notes |
|-------|------|----------|------------|-------|
| `id` | String (cuid) | Auto | — | Primary key |
| `name` | String | Yes | Non-empty, trimmed | Client display name; duplicates allowed |
| `country` | String | Yes | Must be valid ISO code from `COUNTRIES` list | Stored as 2-letter code |
| `industry` | String? | No | Must be from predefined `INDUSTRIES` list if provided | Nullable |
| `contactPerson` | String? | No | Trimmed | Contact person's full name |
| `contactEmail` | String? | No | Basic email format | Contact email |
| `contactPhone` | String? | No | Trimmed | Contact phone number |
| `notes` | String? | No | — | Free-form notes |
| `deleted` | Boolean | Auto | — | Soft-delete flag, default false |
| `deletedAt` | DateTime? | Auto | — | Timestamp of soft-delete |
| `createdBy` | String? | Auto | Valid User.id | Set from session |
| `createdAt` | DateTime | Auto | — | Prisma @default(now()) |
| `updatedAt` | DateTime | Auto | — | Prisma @updatedAt |

**Relationships**:
- `createdByUser` → `User` (many-to-one, optional)
- `contracts` → `ClientContract[]` (one-to-many)
- `reviewContracts` → `Contract[]` (one-to-many, via `Contract.clientId`)

---

### ClientContract

A contract document attached to a client's profile ("master copy").

```prisma
model ClientContract {
  id          String   @id @default(cuid())
  clientId    String
  client      Client   @relation(fields: [clientId], references: [id], onDelete: Cascade)
  documentId  String
  document    Document @relation(fields: [documentId], references: [id], onDelete: Cascade)
  title       String?                           // Optional display name (defaults to filename)
  uploadedBy  String?
  uploadedByUser User? @relation("ClientContractsUploaded", fields: [uploadedBy], references: [id])
  createdAt   DateTime @default(now())

  @@unique([clientId, documentId])              // Prevent duplicate attachments
}
```

| Field | Type | Required | Validation | Notes |
|-------|------|----------|------------|-------|
| `id` | String (cuid) | Auto | — | Primary key |
| `clientId` | String | Yes | Valid Client.id | FK to Client |
| `documentId` | String | Yes | Valid Document.id | FK to Document |
| `title` | String? | No | — | Display name override; defaults to `document.filename` |
| `uploadedBy` | String? | Auto | Valid User.id | Set from session |
| `createdAt` | DateTime | Auto | — | Upload timestamp |

**Relationships**:
- `client` → `Client` (many-to-one, cascade delete)
- `document` → `Document` (many-to-one, cascade delete)
- `uploadedByUser` → `User` (many-to-one, optional)

**Unique Constraint**: `[clientId, documentId]` — a document can only be attached once per client.

---

## Modified Models

### Contract (existing — extended)

Add optional `clientId` field for traceability from reviews back to clients (FR-017).

```prisma
model Contract {
  // ... existing fields unchanged ...
  
  clientId    String?                            // NEW: Source client (if review initiated from client contract)
  client      Client?  @relation(fields: [clientId], references: [id], onDelete: SetNull)
  
  // ... existing relations unchanged ...
}
```

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `clientId` | String? | No | Set when review is initiated from a client's contract; null for standalone reviews |

**onDelete: SetNull** — If a client is soft-deleted (or ever hard-deleted), the review retains its data but the `clientId` becomes null. This satisfies FR-015 (deleting a client must not affect reviews).

---

### Document (existing — extended relations only)

Add relation to `ClientContract`. No new fields.

```prisma
model Document {
  // ... existing fields unchanged ...
  
  clientContracts ClientContract[]               // NEW: back-relation
  
  // ... existing relations unchanged ...
}
```

---

### User (existing — extended relations only)

Add relation to `Client` and `ClientContract`. No new fields.

```prisma
model User {
  // ... existing fields unchanged ...
  
  clientsCreated          Client[]          @relation("ClientsCreated")
  clientContractsUploaded ClientContract[]  @relation("ClientContractsUploaded")
  
  // ... existing relations unchanged ...
}
```

---

## State Transitions

### Client Lifecycle

```
Created → Active → Soft-Deleted → Restored (back to Active)
```

| State | `deleted` | `deletedAt` | Visible in List | Editable |
|-------|-----------|-------------|-----------------|----------|
| Active | `false` | `null` | Yes | Yes |
| Soft-Deleted | `true` | timestamp | No | No (restore first) |

---

## Migration Notes

Single migration needed:
1. Create `Client` table with all fields + indexes.
2. Create `ClientContract` table with all fields + unique constraint.
3. Add `clientId` column (nullable) to existing `Contract` table.
4. Add foreign key from `Contract.clientId` → `Client.id` with `SET NULL` on delete.

**Migration command**: `npx prisma migrate dev --name add-client-management`

No data migration needed — new tables start empty and the new `Contract.clientId` column is nullable (existing rows get `null`).
