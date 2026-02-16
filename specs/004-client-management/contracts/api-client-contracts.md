# API Contracts: Client Contracts (Attachments)

**Feature**: `004-client-management` | **Date**: 2026-02-13

All endpoints require authentication (NextAuth session). All responses use JSON.

---

## `GET /api/clients/[id]/contracts`

List all contracts attached to a client.

**Auth**: Any authenticated user

**Response `200 OK`**:
```json
[
  {
    "id": "clcc...",
    "documentId": "cldoc...",
    "title": "Master Services Agreement",
    "uploadedBy": "cluserid...",
    "uploadedByName": "Jane Smith",
    "createdAt": "2026-02-13T10:30:00.000Z",
    "document": {
      "id": "cldoc...",
      "filename": "msa-acme-2026.pdf",
      "fileType": "pdf",
      "fileSize": 245000,
      "pageCount": 12,
      "createdAt": "2026-02-13T10:30:00.000Z"
    }
  }
]
```

**Error Responses**:
- `401 Unauthorized` — No session
- `404 Not Found` — Client not found or soft-deleted
- `500 Internal Server Error` — Database error

---

## `POST /api/clients/[id]/contracts`

Attach a document to a client. The document must already be uploaded via `POST /api/upload`.

**Auth**: Any authenticated user

**Request Body**:
```json
{
  "documentId": "cldoc...",
  "title": "Master Services Agreement"
}
```

| Field | Type | Required | Validation |
|-------|------|----------|------------|
| `documentId` | string | Yes | Must reference an existing Document |
| `title` | string | No | Display name override; defaults to document.filename |

**Response `201 Created`**:
```json
{
  "id": "clcc...",
  "clientId": "clxyz...",
  "documentId": "cldoc...",
  "title": "Master Services Agreement",
  "uploadedBy": "cluserid...",
  "createdAt": "2026-02-13T10:30:00.000Z",
  "document": {
    "id": "cldoc...",
    "filename": "msa-acme-2026.pdf",
    "fileType": "pdf",
    "fileSize": 245000,
    "pageCount": 12
  }
}
```

**Error Responses**:
- `400 Bad Request` — Missing `documentId` or document not found
- `401 Unauthorized` — No session
- `404 Not Found` — Client not found or soft-deleted
- `409 Conflict` — Document already attached to this client
- `500 Internal Server Error` — Database error

---

## `DELETE /api/clients/[id]/contracts/[contractId]`

Remove a contract attachment from a client. Deletes the `ClientContract` junction record. The underlying `Document` record is also deleted (cascade).

**Auth**: Any authenticated user

**Response `200 OK`**:
```json
{
  "success": true,
  "message": "Contract removed from client"
}
```

**Error Responses**:
- `401 Unauthorized` — No session
- `404 Not Found` — Client or contract attachment not found
- `500 Internal Server Error` — Database error

---

## `POST /api/clients/[id]/contracts/[contractId]/review`

Start a contract review from a client's attached contract. This endpoint:
1. Loads the source `ClientContract` and its `Document`.
2. Copies the file on disk to a new `uploads/` subdirectory.
3. Creates a new `Document` row with the copied file data.
4. Creates a new `Contract` (review) linked to the new document and the source client.
5. Returns the new contract ID for navigation.

**Auth**: Any authenticated user

**Request Body**:
```json
{
  "title": "Acme MSA Review - Feb 2026",
  "ourSide": "customer"
}
```

| Field | Type | Required | Validation |
|-------|------|----------|------------|
| `title` | string | Yes | Non-empty after trim |
| `ourSide` | string | Yes | One of: customer, vendor, licensor, licensee, partner |

**Response `201 Created`**:
```json
{
  "contractId": "clreview...",
  "documentId": "cldoccopy...",
  "message": "Review created from client contract"
}
```

**Error Responses**:
- `400 Bad Request` — Missing required fields or invalid `ourSide`
- `401 Unauthorized` — No session
- `404 Not Found` — Client or contract attachment not found
- `500 Internal Server Error` — File copy or database error

**Side Effects**:
- New file created in `uploads/` directory (copy of original)
- New `Document` row created (independent copy)
- New `Contract` row created with `clientId` set to the source client
