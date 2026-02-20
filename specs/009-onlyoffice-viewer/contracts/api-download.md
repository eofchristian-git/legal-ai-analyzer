# API Contract: Document Download Endpoint

**Feature**: 009-onlyoffice-viewer  
**Endpoint**: `GET /api/contracts/[id]/download`  
**Purpose**: Serve contract document files to ONLYOFFICE Document Server  
**Authentication**: Token-based (separate from user session)

## Overview

This endpoint serves the original contract document file to ONLYOFFICE Document Server. It uses token-based authentication (not browser session cookies) because ONLYOFFICE makes server-to-server requests. The download token is short-lived (1 hour) and generated alongside the ONLYOFFICE access token.

## Request

### HTTP Method
```
GET /api/contracts/[id]/download?token=<download-token>
```

### Path Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string | Yes | Contract ID (CUID format) |

### Query Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `token` | string | Yes | JWT download token (1-hour expiration) |

### Headers

| Header | Value | Required | Description |
|--------|-------|----------|-------------|
| `User-Agent` | string | No | ONLYOFFICE Document Server identifies itself |

### Example Request

```http
GET /api/contracts/cm3abc123xyz/download?token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9... HTTP/1.1
Host: localhost:3000
User-Agent: ONLYOFFICE/7.5.1
```

## Response

### Success Response (200 OK)

**Status Code**: `200 OK`

**Headers**:
```http
Content-Type: application/vnd.openxmlformats-officedocument.wordprocessingml.document
Content-Disposition: inline; filename="Contract Title.docx"
Content-Length: 524288
```

**Body**: Binary file stream (original .docx or .pdf file)

### Example Success

```http
HTTP/1.1 200 OK
Content-Type: application/vnd.openxmlformats-officedocument.wordprocessingml.document
Content-Disposition: inline; filename="ACME Corp Agreement.docx"
Content-Length: 524288

<binary file data>
```

---

### Error Responses

#### 401 Unauthorized — Missing or Invalid Token

**Status Code**: `401 Unauthorized`

**Body**:
```json
{
  "error": "Unauthorized",
  "message": "Download token is missing or invalid"
}
```

**Causes**:
- No `token` query parameter provided
- Token is malformed or not a valid JWT
- Token signature verification failed

---

#### 403 Forbidden — Token Expired or Wrong Purpose

**Status Code**: `403 Forbidden`

**Body**:
```json
{
  "error": "Forbidden",
  "message": "Download token has expired or is not valid for this operation",
  "details": "Token expired at 2026-02-18T15:30:00Z"
}
```

**Causes**:
- Token expiration time (`exp` claim) has passed (> 1 hour old)
- Token `purpose` claim is not `"onlyoffice-download"`
- Token `contractId` claim does not match path parameter

---

#### 404 Not Found — Contract or Document Not Found

**Status Code**: `404 Not Found`

**Body**:
```json
{
  "error": "Not Found",
  "message": "Contract or document file not found",
  "contractId": "cm3abc123xyz"
}
```

**Causes**:
- Contract with specified `id` does not exist in database
- Contract exists but has no associated `Document` record
- Document file path does not exist on file system

---

#### 500 Internal Server Error — File Read Failure

**Status Code**: `500 Internal Server Error`

**Body**:
```json
{
  "error": "Internal Server Error",
  "message": "Failed to read document file",
  "details": "ENOENT: no such file or directory"
}
```

**Causes**:
- File system error reading document file
- Permission issues accessing file
- Disk I/O failure

---

## Token Structure

### Download Token Claims (JWT)

```typescript
interface DownloadToken {
  contractId: string;       // Contract ID being accessed
  purpose: 'onlyoffice-download';  // Token purpose (validation)
  iat: number;              // Issued at (Unix timestamp)
  exp: number;              // Expires at (1 hour from iat)
}
```

### Example Decoded Token

```json
{
  "contractId": "cm3abc123xyz",
  "purpose": "onlyoffice-download",
  "iat": 1708268400,
  "exp": 1708272000
}
```

## Security Considerations

### Token Validation

1. **Signature Verification**: Verify JWT signature using `ONLYOFFICE_JWT_SECRET`
2. **Expiration Check**: Ensure current time < `exp` claim
3. **Purpose Check**: Verify `purpose === 'onlyoffice-download'`
4. **Contract ID Match**: Verify token `contractId` matches path parameter

### Access Control

- **No user session required**: ONLYOFFICE server cannot send browser cookies
- **Time-limited access**: 1-hour expiration prevents long-term token reuse
- **Purpose-bound**: Token only valid for download endpoint, not general API access
- **Single contract**: Token scoped to specific contract ID

### Rate Limiting

- **Not typically needed**: ONLYOFFICE makes limited requests (initial download only)
- **If implemented**: 100 requests per hour per contract ID (prevents abuse)

---

## Implementation Notes

### File Serving Strategy

```typescript
// src/app/api/contracts/[id]/download/route.ts
import { NextRequest, NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';
import fs from 'fs/promises';
import { prisma } from '@/lib/prisma';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Extract and validate token
    const token = request.nextUrl.searchParams.get('token');
    if (!token) {
      return NextResponse.json(
        { error: 'Unauthorized', message: 'Download token is missing' },
        { status: 401 }
      );
    }

    // Verify JWT
    const secret = process.env.ONLYOFFICE_JWT_SECRET!;
    const decoded = jwt.verify(token, secret) as DownloadToken;

    // Validate token purpose
    if (decoded.purpose !== 'onlyoffice-download') {
      return NextResponse.json(
        { error: 'Forbidden', message: 'Invalid token purpose' },
        { status: 403 }
      );
    }

    // Validate contract ID match
    if (decoded.contractId !== params.id) {
      return NextResponse.json(
        { error: 'Forbidden', message: 'Token contract ID mismatch' },
        { status: 403 }
      );
    }

    // Fetch contract and document
    const contract = await prisma.contract.findUnique({
      where: { id: params.id },
      include: { document: true },
    });

    if (!contract || !contract.document) {
      return NextResponse.json(
        { error: 'Not Found', message: 'Contract or document not found' },
        { status: 404 }
      );
    }

    // Read file from file system
    const fileBuffer = await fs.readFile(contract.document.filePath);

    // Determine Content-Type based on file extension
    const contentType = contract.document.fileType === 'application/pdf'
      ? 'application/pdf'
      : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

    // Return file stream
    return new NextResponse(fileBuffer, {
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `inline; filename="${contract.title}.${contract.document.fileType === 'application/pdf' ? 'pdf' : 'docx'}"`,
        'Content-Length': fileBuffer.length.toString(),
      },
    });

  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      return NextResponse.json(
        { error: 'Unauthorized', message: 'Invalid token' },
        { status: 401 }
      );
    }

    if (error instanceof jwt.TokenExpiredError) {
      return NextResponse.json(
        { error: 'Forbidden', message: 'Token expired' },
        { status: 403 }
      );
    }

    console.error('Document download error:', error);
    return NextResponse.json(
      { error: 'Internal Server Error', message: 'Failed to download document' },
      { status: 500 }
    );
  }
}
```

### Token Generation

```typescript
// src/lib/onlyoffice/jwt.ts
import jwt from 'jsonwebtoken';

export function generateDownloadToken(contractId: string): string {
  const secret = process.env.ONLYOFFICE_JWT_SECRET!;
  return jwt.sign(
    {
      contractId,
      purpose: 'onlyoffice-download',
    },
    secret,
    { expiresIn: '1h' }
  );
}
```

---

## Testing

### Manual Testing

```bash
# 1. Generate a download token (via /api/onlyoffice/token endpoint)
curl -X POST http://localhost:3000/api/onlyoffice/token \
  -H "Content-Type: application/json" \
  -d '{"contractId": "cm3abc123xyz"}'

# Response: { "accessToken": "...", "downloadToken": "eyJ..." }

# 2. Use download token to fetch document
curl -X GET "http://localhost:3000/api/contracts/cm3abc123xyz/download?token=eyJ..." \
  --output contract.docx

# 3. Verify file downloaded successfully
file contract.docx
# Expected: Microsoft Word 2007+
```

### Integration Testing Scenarios

1. **Valid token**: Returns document file with correct Content-Type
2. **Missing token**: Returns 401 Unauthorized
3. **Invalid token signature**: Returns 401 Unauthorized
4. **Expired token**: Returns 403 Forbidden
5. **Wrong purpose**: Returns 403 Forbidden
6. **Contract ID mismatch**: Returns 403 Forbidden
7. **Non-existent contract**: Returns 404 Not Found
8. **Missing file**: Returns 500 Internal Server Error

---

## Performance Considerations

- **File Size**: Supports documents up to 50 MB (adjust Node.js memory if larger)
- **Concurrent Downloads**: ONLYOFFICE typically downloads once per session (no repeated downloads)
- **Caching**: File system caching handled by OS; no application-level cache needed
- **Streaming**: Next.js automatically streams large files in chunks

---

## Related Endpoints

- `POST /api/onlyoffice/token` — Generates access and download tokens
- `POST /api/onlyoffice/callback/[contractId]` — Receives save events from ONLYOFFICE
- `GET /api/contracts/[id]` — Fetches contract metadata
