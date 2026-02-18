# API Contract: ONLYOFFICE Callback Endpoint

**Feature**: 009-onlyoffice-viewer  
**Endpoint**: `POST /api/onlyoffice/callback/[contractId]`  
**Purpose**: Receive document save events from ONLYOFFICE Document Server  
**Authentication**: JWT token in request body

## Overview

This endpoint receives callbacks from ONLYOFFICE Document Server when document state changes (editing, saving, closing, errors). ONLYOFFICE sends status codes indicating the document lifecycle stage. When status is `2` (ready for saving) or `6` (force save), the endpoint downloads the edited document from ONLYOFFICE and persists it to storage.

**ONLYOFFICE Callback Reference**: https://api.onlyoffice.com/editors/callback

## Request

### HTTP Method
```
POST /api/onlyoffice/callback/[contractId]
```

### Path Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `contractId` | string | Yes | Contract ID (CUID format) |

### Headers

| Header | Value | Required | Description |
|--------|-------|----------|-------------|
| `Content-Type` | `application/json` | Yes | Request body format |

### Request Body

```typescript
interface CallbackRequest {
  key: string;              // Document key (format: contract-{contractId}-{timestamp})
  status: number;           // Document status code (see below)
  url?: string;             // Download URL for edited document (status 2, 6, 7)
  changesurl?: string;      // Changes history URL (optional)
  history?: object;         // Document history (optional)
  users?: string[];         // List of user IDs currently editing (status 1)
  actions?: object[];       // User actions (optional)
  lastsave?: string;        // Last save time (ISO 8601)
  notmodified?: boolean;    // True if document unchanged (status 4)
  token?: string;           // JWT token (if JWT enabled)
  forcesavetype?: number;   // Force save type (status 6, 7)
}
```

### Status Codes (ONLYOFFICE)

| Status | Name | Description | Action Required |
|--------|------|-------------|-----------------|
| `0` | NotFound | Document not found (error state) | Return error |
| `1` | Editing | Document is being edited by user(s) | Return success, no action |
| `2` | MustSave | Document ready for saving | Download and save document |
| `3` | Corrupted | Document saving error occurred | Return error |
| `4` | Closed | Document closed with no changes | Return success, no action |
| `6` | MustForceSave | Editing but force save requested | Download and save document |
| `7` | CorruptedForceSave | Error force saving | Return error |

### Example Request (Status 2 - Ready to Save)

```http
POST /api/onlyoffice/callback/cm3abc123xyz HTTP/1.1
Host: localhost:3000
Content-Type: application/json

{
  "key": "contract-cm3abc123xyz-1708268400000",
  "status": 2,
  "url": "https://onlyoffice-server/url-to-edited-document?token=...",
  "lastsave": "2026-02-18T14:30:00Z",
  "notmodified": false,
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

### Example Request (Status 1 - Editing)

```http
POST /api/onlyoffice/callback/cm3abc123xyz HTTP/1.1
Host: localhost:3000
Content-Type: application/json

{
  "key": "contract-cm3abc123xyz-1708268400000",
  "status": 1,
  "users": ["user123", "user456"],
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

## Response

### Success Response

**Status Code**: `200 OK`

**Body**:
```json
{
  "error": 0
}
```

**Meaning**: ONLYOFFICE interprets `{ "error": 0 }` as success. Any other response (including missing error field) is treated as failure.

---

### Error Response (Callback Handling Failed)

**Status Code**: `200 OK` (still return 200, but with error code)

**Body**:
```json
{
  "error": 1
}
```

**Meaning**: ONLYOFFICE interprets `{ "error": 1 }` as callback processing failed. ONLYOFFICE may retry the callback.

**Use Cases**:
- Document download from `url` failed
- File system save failed
- Database update failed
- Invalid contract ID

---

## Callback Processing Logic

### Status Handling Flow

```typescript
switch (status) {
  case 0: // NotFound
    console.error('Document not found');
    return { error: 1 };

  case 1: // Editing
    // Document being edited; no action needed
    return { error: 0 };

  case 2: // MustSave
    // Download document from url and save
    await downloadAndSave(url, contractId);
    return { error: 0 };

  case 3: // Corrupted
    console.error('Document saving error');
    return { error: 1 };

  case 4: // Closed
    // Document closed with no changes; no action needed
    return { error: 0 };

  case 6: // MustForceSave
    // Force save requested; download and save
    await downloadAndSave(url, contractId);
    return { error: 0 };

  case 7: // CorruptedForceSave
    console.error('Force save error');
    return { error: 1 };

  default:
    console.warn(`Unknown status: ${status}`);
    return { error: 0 }; // Don't block ONLYOFFICE
}
```

---

## Implementation

### Callback Handler

```typescript
// src/app/api/onlyoffice/callback/[contractId]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';
import fs from 'fs/promises';
import path from 'path';
import { prisma } from '@/lib/prisma';

interface CallbackRequest {
  key: string;
  status: number;
  url?: string;
  users?: string[];
  lastsave?: string;
  notmodified?: boolean;
  token?: string;
}

export async function POST(
  request: NextRequest,
  { params }: { params: { contractId: string } }
) {
  try {
    const body: CallbackRequest = await request.json();
    const { key, status, url, token } = body;

    console.log(`ONLYOFFICE callback - Contract: ${params.contractId}, Status: ${status}`);

    // Verify JWT token if JWT enabled
    if (token && process.env.ONLYOFFICE_JWT_ENABLED === 'true') {
      try {
        const secret = process.env.ONLYOFFICE_JWT_SECRET!;
        jwt.verify(token, secret);
      } catch (error) {
        console.error('Invalid ONLYOFFICE callback token:', error);
        return NextResponse.json({ error: 1 }, { status: 200 });
      }
    }

    // Validate document key format
    if (!key.startsWith(`contract-${params.contractId}-`)) {
      console.error('Document key mismatch');
      return NextResponse.json({ error: 1 }, { status: 200 });
    }

    // Handle different status codes
    switch (status) {
      case 1: // Editing
        console.log('Document is being edited');
        return NextResponse.json({ error: 0 }, { status: 200 });

      case 2: // MustSave
      case 6: // MustForceSave
        if (!url) {
          console.error('Missing download URL for save');
          return NextResponse.json({ error: 1 }, { status: 200 });
        }

        // Download edited document from ONLYOFFICE
        const response = await fetch(url);
        if (!response.ok) {
          console.error('Failed to download edited document');
          return NextResponse.json({ error: 1 }, { status: 200 });
        }

        const fileBuffer = Buffer.from(await response.arrayBuffer());

        // Find contract and document
        const contract = await prisma.contract.findUnique({
          where: { id: params.contractId },
          include: { document: true },
        });

        if (!contract || !contract.document) {
          console.error('Contract not found');
          return NextResponse.json({ error: 1 }, { status: 200 });
        }

        // Generate new filename with timestamp
        const uploadDir = path.dirname(contract.document.filePath);
        const ext = path.extname(contract.document.filename);
        const baseName = path.basename(contract.document.filename, ext);
        const timestamp = Date.now();
        const newFilename = `${baseName}-edited-${timestamp}${ext}`;
        const newFilePath = path.join(uploadDir, newFilename);

        // Save edited document
        await fs.writeFile(newFilePath, fileBuffer);

        // Update contract document path to point to new version
        await prisma.document.update({
          where: { id: contract.document.id },
          data: {
            filePath: newFilePath,
            filename: newFilename,
            updatedAt: new Date(),
          },
        });

        console.log(`Document saved: ${newFilePath}`);
        return NextResponse.json({ error: 0 }, { status: 200 });

      case 4: // Closed
        console.log('Document closed with no changes');
        return NextResponse.json({ error: 0 }, { status: 200 });

      case 0: // NotFound
      case 3: // Corrupted
      case 7: // CorruptedForceSave
        console.error(`Document error (status ${status})`);
        return NextResponse.json({ error: 1 }, { status: 200 });

      default:
        console.warn(`Unknown status: ${status}`);
        return NextResponse.json({ error: 0 }, { status: 200 });
    }

  } catch (error) {
    console.error('ONLYOFFICE callback error:', error);
    return NextResponse.json({ error: 1 }, { status: 200 });
  }
}
```

---

## Security Considerations

### JWT Validation

- **Always validate token**: If `JWT_ENABLED=true`, verify `token` in request body
- **Reject unsigned requests**: If JWT enabled but token missing/invalid, return `{ error: 1 }`
- **Use shared secret**: Same `ONLYOFFICE_JWT_SECRET` used for access tokens

### Document Key Validation

- **Verify key format**: Must match `contract-{contractId}-{timestamp}` pattern
- **Prevent path traversal**: Never use `key` directly in file paths
- **Match contract ID**: Ensure `key` contains correct contract ID from path

### File System Security

- **Sanitize filenames**: Remove any special characters or path separators
- **Restrict upload directory**: Only save to designated upload directories
- **Prevent overwrites**: Use timestamps in filenames to avoid collisions
- **Validate file types**: Ensure downloaded file is valid .docx or .pdf

---

## Error Handling

### Network Failures

If downloading edited document from ONLYOFFICE fails:
- Return `{ error: 1 }` to signal failure
- ONLYOFFICE may retry callback after delay
- Log error details for debugging

### File System Failures

If saving edited document to disk fails:
- Return `{ error: 1 }` to signal failure
- Keep original document intact (don't delete)
- Alert administrators (disk space, permissions)

### Database Failures

If updating document record fails:
- Return `{ error: 1 }` to signal failure
- Orphaned file may exist (cleanup job needed)
- Log error for manual recovery

---

## Testing

### Manual Testing

```bash
# Simulate ONLYOFFICE callback - Status 1 (Editing)
curl -X POST http://localhost:3000/api/onlyoffice/callback/cm3abc123xyz \
  -H "Content-Type: application/json" \
  -d '{
    "key": "contract-cm3abc123xyz-1708268400000",
    "status": 1,
    "users": ["user123"]
  }'

# Expected response: { "error": 0 }

# Simulate ONLYOFFICE callback - Status 2 (MustSave)
curl -X POST http://localhost:3000/api/onlyoffice/callback/cm3abc123xyz \
  -H "Content-Type: application/json" \
  -d '{
    "key": "contract-cm3abc123xyz-1708268400000",
    "status": 2,
    "url": "https://onlyoffice-server/download?id=abc123"
  }'

# Expected response: { "error": 0 }
# Expected side effect: Document downloaded and saved to file system
```

### Integration Testing Scenarios

1. **Status 1 (Editing)**: Returns success, no side effects
2. **Status 2 (MustSave) with valid URL**: Downloads and saves document
3. **Status 2 (MustSave) with missing URL**: Returns error
4. **Status 2 (MustSave) with invalid URL**: Returns error
5. **Status 4 (Closed)**: Returns success, no side effects
6. **Status 6 (MustForceSave)**: Downloads and saves document
7. **Invalid JWT token**: Returns error (if JWT enabled)
8. **Document key mismatch**: Returns error
9. **Non-existent contract**: Returns error

---

## Monitoring & Observability

### Logging

Log every callback with details:
```typescript
console.log({
  timestamp: new Date().toISOString(),
  contractId: params.contractId,
  documentKey: key,
  status: status,
  statusName: getStatusName(status),
  url: url,
  users: users,
  success: true/false,
});
```

### Metrics to Track

- Callback frequency per contract
- Status code distribution (1, 2, 4, 6 most common)
- Save success rate (status 2, 6)
- Error rate (status 0, 3, 7)
- Average time to process save callbacks

### Alerts

- **High error rate** (>10% of callbacks return error 1)
- **Failed downloads** (status 2/6 but download fails)
- **File system errors** (disk full, permission denied)
- **Missing JWT tokens** (if JWT enabled)

---

## Related Endpoints

- `POST /api/onlyoffice/token` — Generates access and download tokens
- `GET /api/contracts/[id]/download` — Serves document files to ONLYOFFICE
- `GET /api/contracts/[id]` — Fetches contract metadata

---

## ONLYOFFICE Documentation References

- [Callback Handler](https://api.onlyoffice.com/editors/callback)
- [Document Status Codes](https://api.onlyoffice.com/editors/callback#status)
- [Force Save](https://api.onlyoffice.com/editors/methods#forcesave)
