# API Contract: ONLYOFFICE Session Token Generation

**Feature**: 009-onlyoffice-viewer  
**Endpoint**: `POST /api/onlyoffice/token`  
**Purpose**: Generate JWT tokens for ONLYOFFICE document viewing/editing sessions  
**Authentication**: User session (NextAuth)

## Overview

This endpoint generates two JWT tokens required for ONLYOFFICE integration:
1. **Access Token**: 4-hour token for ONLYOFFICE Document Editor authentication
2. **Download Token**: 1-hour token for document download endpoint authentication

The endpoint validates user permissions before issuing tokens and creates an `OnlyOfficeSession` database record for session tracking.

## Request

### HTTP Method
```
POST /api/onlyoffice/token
```

### Headers

| Header | Value | Required | Description |
|--------|-------|----------|-------------|
| `Content-Type` | `application/json` | Yes | Request body format |
| `Cookie` | Session cookie | Yes | NextAuth session (automatic) |

### Request Body

```typescript
interface TokenRequest {
  contractId: string;    // Contract ID to create session for
  mode?: 'view' | 'edit';  // Session mode (default: based on contract status)
}
```

### Example Request

```http
POST /api/onlyoffice/token HTTP/1.1
Host: localhost:3000
Content-Type: application/json
Cookie: next-auth.session-token=...

{
  "contractId": "cm3abc123xyz",
  "mode": "edit"
}
```

## Response

### Success Response (200 OK)

**Status Code**: `200 OK`

**Body**:
```typescript
interface TokenResponse {
  sessionId: string;           // OnlyOfficeSession ID (for tracking)
  documentKey: string;         // Unique document key for ONLYOFFICE
  accessToken: string;         // JWT access token (4-hour expiration)
  downloadToken: string;       // JWT download token (1-hour expiration)
  downloadUrl: string;         // Full URL for document download endpoint
  callbackUrl: string;         // Full URL for ONLYOFFICE callback endpoint
  mode: 'view' | 'edit';       // Session mode
  expiresAt: string;           // ISO 8601 timestamp of access token expiration
  config: ONLYOFFICEConfig;    // Complete ONLYOFFICE editor configuration
}
```

### Example Success Response

```json
{
  "sessionId": "cm3session123",
  "documentKey": "contract-cm3abc123xyz-1708268400000",
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJjb250cmFjdElkIjoiY20zYWJjMTIzeHl6IiwidXNlcklkIjoidXNlcjEyMyIsIm1vZGUiOiJlZGl0IiwiaWF0IjoxNzA4MjY4NDAwLCJleHAiOjE3MDgyODI4MDB9.signature",
  "downloadToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJjb250cmFjdElkIjoiY20zYWJjMTIzeHl6IiwicHVycG9zZSI6Im9ubHlvZmZpY2UtZG93bmxvYWQiLCJpYXQiOjE3MDgyNjg0MDAsImV4cCI6MTcwODI3MjAwMH0.signature",
  "downloadUrl": "http://localhost:3000/api/contracts/cm3abc123xyz/download?token=eyJ...",
  "callbackUrl": "http://localhost:3000/api/onlyoffice/callback/cm3abc123xyz",
  "mode": "edit",
  "expiresAt": "2026-02-18T18:30:00Z",
  "config": {
    "document": {
      "fileType": "docx",
      "key": "contract-cm3abc123xyz-1708268400000",
      "title": "ACME Corp Agreement",
      "url": "http://localhost:3000/api/contracts/cm3abc123xyz/download?token=eyJ...",
      "permissions": {
        "comment": true,
        "download": true,
        "edit": true,
        "print": true,
        "review": true
      }
    },
    "documentType": "word",
    "editorConfig": {
      "mode": "edit",
      "lang": "en",
      "callbackUrl": "http://localhost:3000/api/onlyoffice/callback/cm3abc123xyz",
      "user": {
        "id": "user123",
        "name": "John Doe"
      },
      "customization": {
        "comments": true,
        "compactToolbar": true,
        "review": {
          "showReviewChanges": true,
          "trackChanges": true
        }
      }
    },
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

---

### Error Responses

#### 401 Unauthorized — Not Authenticated

**Status Code**: `401 Unauthorized`

**Body**:
```json
{
  "error": "Unauthorized",
  "message": "Authentication required"
}
```

**Causes**:
- No valid NextAuth session
- Session expired
- User not logged in

---

#### 403 Forbidden — No Permission

**Status Code**: `403 Forbidden`

**Body**:
```json
{
  "error": "Forbidden",
  "message": "You do not have permission to access this contract",
  "contractId": "cm3abc123xyz"
}
```

**Causes**:
- User does not own the contract
- Contract belongs to different client
- User role lacks contract access permission

---

#### 404 Not Found — Contract Not Found

**Status Code**: `404 Not Found`

**Body**:
```json
{
  "error": "Not Found",
  "message": "Contract not found",
  "contractId": "cm3abc123xyz"
}
```

**Causes**:
- Contract ID does not exist in database
- Contract was deleted

---

#### 400 Bad Request — Missing or Invalid Input

**Status Code**: `400 Bad Request`

**Body**:
```json
{
  "error": "Bad Request",
  "message": "Contract ID is required"
}
```

**Causes**:
- Missing `contractId` in request body
- Invalid `mode` value (not 'view' or 'edit')
- Malformed JSON

---

#### 500 Internal Server Error — Token Generation Failed

**Status Code**: `500 Internal Server Error`

**Body**:
```json
{
  "error": "Internal Server Error",
  "message": "Failed to generate session tokens",
  "details": "JWT signing failed"
}
```

**Causes**:
- Missing `ONLYOFFICE_JWT_SECRET` environment variable
- Database error creating session record
- File system error accessing contract file

---

## Token Structures

### Access Token Claims (JWT)

```typescript
interface AccessToken {
  contractId: string;     // Contract being accessed
  userId: string;         // User creating session
  mode: 'view' | 'edit';  // Session mode
  iat: number;            // Issued at (Unix timestamp)
  exp: number;            // Expires at (4 hours from iat)
}
```

### Download Token Claims (JWT)

```typescript
interface DownloadToken {
  contractId: string;     // Contract being downloaded
  purpose: 'onlyoffice-download';  // Token purpose
  iat: number;            // Issued at (Unix timestamp)
  exp: number;            // Expires at (1 hour from iat)
}
```

---

## Implementation

### Token Generation Handler

```typescript
// src/app/api/onlyoffice/token/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { generateAccessToken, generateDownloadToken } from '@/lib/onlyoffice/jwt';

interface TokenRequest {
  contractId: string;
  mode?: 'view' | 'edit';
}

export async function POST(request: NextRequest) {
  try {
    // Authenticate user
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized', message: 'Authentication required' },
        { status: 401 }
      );
    }

    // Parse request body
    const body: TokenRequest = await request.json();
    const { contractId, mode } = body;

    if (!contractId) {
      return NextResponse.json(
        { error: 'Bad Request', message: 'Contract ID is required' },
        { status: 400 }
      );
    }

    // Fetch contract with permissions check
    const contract = await prisma.contract.findUnique({
      where: { id: contractId },
      include: {
        document: true,
        client: true,
      },
    });

    if (!contract) {
      return NextResponse.json(
        { error: 'Not Found', message: 'Contract not found' },
        { status: 404 }
      );
    }

    // Check permissions
    if (contract.createdBy !== session.user.id) {
      // TODO: Check client membership if applicable
      return NextResponse.json(
        { error: 'Forbidden', message: 'You do not have permission to access this contract' },
        { status: 403 }
      );
    }

    // Determine session mode
    const sessionMode = mode || (contract.status === 'finalized' ? 'view' : 'edit');

    // Generate tokens
    const documentKey = `contract-${contractId}-${Date.now()}`;
    const accessToken = generateAccessToken(contractId, session.user.id, sessionMode);
    const downloadToken = generateDownloadToken(contractId);

    // Create session record
    const onlyOfficeSession = await prisma.onlyOfficeSession.create({
      data: {
        contractId: contract.id,
        userId: session.user.id,
        documentKey,
        accessToken,
        downloadToken,
        mode: sessionMode,
        status: 'active',
        expiresAt: new Date(Date.now() + 4 * 60 * 60 * 1000), // 4 hours
      },
    });

    // Build URLs
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const downloadUrl = `${baseUrl}/api/contracts/${contractId}/download?token=${downloadToken}`;
    const callbackUrl = `${baseUrl}/api/onlyoffice/callback/${contractId}`;

    // Build ONLYOFFICE config
    const config = {
      document: {
        fileType: contract.document.fileType === 'application/pdf' ? 'pdf' : 'docx',
        key: documentKey,
        title: contract.title,
        url: downloadUrl,
        permissions: {
          comment: true,
          download: true,
          edit: sessionMode === 'edit',
          print: true,
          review: sessionMode === 'edit',
        },
      },
      documentType: 'word',
      editorConfig: {
        mode: sessionMode,
        lang: 'en',
        callbackUrl: callbackUrl,
        user: {
          id: session.user.id,
          name: session.user.name || 'User',
        },
        customization: {
          comments: true,
          compactToolbar: true,
          review: {
            showReviewChanges: sessionMode === 'edit',
            trackChanges: sessionMode === 'edit',
          },
        },
      },
      token: accessToken,
    };

    // Return response
    return NextResponse.json({
      sessionId: onlyOfficeSession.id,
      documentKey,
      accessToken,
      downloadToken,
      downloadUrl,
      callbackUrl,
      mode: sessionMode,
      expiresAt: onlyOfficeSession.expiresAt.toISOString(),
      config,
    });

  } catch (error) {
    console.error('Token generation error:', error);
    return NextResponse.json(
      { error: 'Internal Server Error', message: 'Failed to generate session tokens' },
      { status: 500 }
    );
  }
}
```

---

## Security Considerations

### Permission Checks

1. **Authentication**: Verify user is logged in via NextAuth session
2. **Ownership**: Verify user owns the contract (`contract.createdBy === user.id`)
3. **Client Membership**: If contract belongs to client, verify user is client member
4. **Mode Restriction**: Force `view` mode for finalized contracts

### Token Security

- **Strong secret**: Use 32+ character random string for `ONLYOFFICE_JWT_SECRET`
- **Time-limited**: Access token 4 hours, download token 1 hour
- **Purpose-bound**: Download token only valid for download endpoint
- **Contract-scoped**: Tokens tied to specific contract ID

### Session Tracking

- **Database record**: Every session tracked in `OnlyOfficeSession` table
- **Audit trail**: Session creation logged with user ID, timestamp
- **Cleanup**: Expired sessions deleted after 7 days

---

## Rate Limiting

**Recommended Limits**:
- 10 token generation requests per minute per user
- 100 token generation requests per hour per user

**Implementation** (optional):
```typescript
// src/middleware.ts (if using middleware)
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

const ratelimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(10, '1 m'),
});

// In token endpoint:
const { success } = await ratelimit.limit(session.user.id);
if (!success) {
  return NextResponse.json(
    { error: 'Too Many Requests', message: 'Rate limit exceeded' },
    { status: 429 }
  );
}
```

---

## Testing

### Manual Testing

```bash
# 1. Authenticate (get session cookie)
curl -X POST http://localhost:3000/api/auth/signin/credentials \
  -H "Content-Type: application/json" \
  -d '{"email": "user@example.com", "password": "password"}' \
  -c cookies.txt

# 2. Generate ONLYOFFICE tokens
curl -X POST http://localhost:3000/api/onlyoffice/token \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{"contractId": "cm3abc123xyz", "mode": "edit"}'

# Expected response: JSON with accessToken, downloadToken, config
```

### Integration Testing Scenarios

1. **Valid request with edit mode**: Returns tokens and config with edit permissions
2. **Valid request with view mode**: Returns tokens and config with view permissions
3. **Finalized contract (no mode)**: Defaults to view mode
4. **Draft contract (no mode)**: Defaults to edit mode
5. **Missing contractId**: Returns 400 Bad Request
6. **Non-existent contract**: Returns 404 Not Found
7. **Unauthorized access**: Returns 403 Forbidden
8. **Not authenticated**: Returns 401 Unauthorized

---

## Monitoring & Observability

### Logging

Log every token generation:
```typescript
console.log({
  timestamp: new Date().toISOString(),
  userId: session.user.id,
  contractId: contractId,
  mode: sessionMode,
  sessionId: onlyOfficeSession.id,
  success: true,
});
```

### Metrics to Track

- Token generation rate (per user, per contract)
- Session mode distribution (edit vs. view)
- Session creation success/failure rate
- Average token generation latency

### Alerts

- **High failure rate** (>5% of token generations fail)
- **Missing JWT secret** (configuration error)
- **Permission denials** (potential security issue)
- **Unusual activity** (same user generating 100+ tokens/hour)

---

## Related Endpoints

- `GET /api/contracts/[id]/download` — Download endpoint (uses downloadToken)
- `POST /api/onlyoffice/callback/[contractId]` — Callback endpoint (receives save events)
- `GET /api/contracts/[id]` — Contract metadata endpoint
