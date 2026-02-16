# API Contracts: Clients

**Feature**: `004-client-management` | **Date**: 2026-02-13

All endpoints require authentication (NextAuth session). All responses use JSON.

---

## `GET /api/clients`

List all active (non-deleted) clients.

**Auth**: Any authenticated user  
**Query Parameters**: None (filtering done client-side)

**Response `200 OK`**:
```json
[
  {
    "id": "clxyz...",
    "name": "Acme Corp",
    "country": "US",
    "industry": "Technology",
    "contactPerson": "John Doe",
    "contactEmail": "john@acme.com",
    "contactPhone": "+1-555-0100",
    "notes": "Key enterprise client",
    "createdBy": "cluserid...",
    "createdByName": "Jane Smith",
    "createdAt": "2026-02-13T10:00:00.000Z",
    "updatedAt": "2026-02-13T10:00:00.000Z",
    "_count": {
      "contracts": 3
    }
  }
]
```

**Error Responses**:
- `401 Unauthorized` — No session
- `500 Internal Server Error` — Database error

---

## `POST /api/clients`

Create a new client.

**Auth**: Any authenticated user  

**Request Body**:
```json
{
  "name": "Acme Corp",
  "country": "US",
  "industry": "Technology",
  "contactPerson": "John Doe",
  "contactEmail": "john@acme.com",
  "contactPhone": "+1-555-0100",
  "notes": "Key enterprise client"
}
```

| Field | Type | Required | Validation |
|-------|------|----------|------------|
| `name` | string | Yes | Non-empty after trim |
| `country` | string | Yes | Must be valid ISO code from COUNTRIES list |
| `industry` | string | No | Must be from INDUSTRIES list if provided |
| `contactPerson` | string | No | — |
| `contactEmail` | string | No | Basic email format |
| `contactPhone` | string | No | — |
| `notes` | string | No | — |

**Response `201 Created`**:
```json
{
  "id": "clxyz...",
  "name": "Acme Corp",
  "country": "US",
  "industry": "Technology",
  "contactPerson": "John Doe",
  "contactEmail": "john@acme.com",
  "contactPhone": "+1-555-0100",
  "notes": "Key enterprise client",
  "createdBy": "cluserid...",
  "createdAt": "2026-02-13T10:00:00.000Z",
  "updatedAt": "2026-02-13T10:00:00.000Z"
}
```

**Error Responses**:
- `400 Bad Request` — Missing required fields or invalid country/industry
- `401 Unauthorized` — No session
- `500 Internal Server Error` — Database error

---

## `GET /api/clients/[id]`

Get a single client with all details and attached contracts.

**Auth**: Any authenticated user  

**Response `200 OK`**:
```json
{
  "id": "clxyz...",
  "name": "Acme Corp",
  "country": "US",
  "industry": "Technology",
  "contactPerson": "John Doe",
  "contactEmail": "john@acme.com",
  "contactPhone": "+1-555-0100",
  "notes": "Key enterprise client",
  "deleted": false,
  "deletedAt": null,
  "createdBy": "cluserid...",
  "createdByName": "Jane Smith",
  "createdAt": "2026-02-13T10:00:00.000Z",
  "updatedAt": "2026-02-13T10:00:00.000Z",
  "contracts": [
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
}
```

**Error Responses**:
- `401 Unauthorized` — No session
- `404 Not Found` — Client not found (or soft-deleted)
- `500 Internal Server Error` — Database error

---

## `PATCH /api/clients/[id]`

Update client fields.

**Auth**: Any authenticated user  

**Request Body** (all fields optional — only provided fields are updated):
```json
{
  "name": "Acme Corporation",
  "country": "GB",
  "industry": "Finance",
  "contactPerson": "Jane Doe",
  "contactEmail": "jane@acme.co.uk",
  "contactPhone": "+44-20-1234-5678",
  "notes": "Updated notes"
}
```

| Field | Type | Required | Validation |
|-------|------|----------|------------|
| `name` | string | No (if provided, non-empty) | Non-empty after trim |
| `country` | string | No (if provided, valid code) | Must be valid ISO code |
| `industry` | string | No | Must be from INDUSTRIES list or null to clear |
| `contactPerson` | string | No | — |
| `contactEmail` | string | No | — |
| `contactPhone` | string | No | — |
| `notes` | string | No | — |

**Response `200 OK`**: Updated client object (same shape as GET)

**Error Responses**:
- `400 Bad Request` — Invalid field values
- `401 Unauthorized` — No session
- `404 Not Found` — Client not found or soft-deleted
- `500 Internal Server Error` — Database error

---

## `DELETE /api/clients/[id]`

Soft-delete a client (set `deleted=true`, `deletedAt=now()`).

**Auth**: Any authenticated user  

**Response `200 OK`**:
```json
{
  "success": true,
  "message": "Client archived"
}
```

**Error Responses**:
- `401 Unauthorized` — No session
- `404 Not Found` — Client not found or already deleted
- `500 Internal Server Error` — Database error

---

## `POST /api/clients/[id]/restore`

Restore a soft-deleted client (set `deleted=false`, `deletedAt=null`).

**Auth**: Any authenticated user  

**Response `200 OK`**:
```json
{
  "success": true,
  "message": "Client restored"
}
```

**Error Responses**:
- `401 Unauthorized` — No session
- `404 Not Found` — Client not found
- `400 Bad Request` — Client is not deleted
- `500 Internal Server Error` — Database error
