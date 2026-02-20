# Research: ONLYOFFICE Document Viewer Integration

**Feature**: 009-onlyoffice-viewer  
**Date**: 2026-02-18  
**Purpose**: Technology selection and integration patterns for replacing HTML viewer with ONLYOFFICE

## R1: ONLYOFFICE Document Server Deployment

### Decision: Docker deployment with docker-compose

**Rationale**:
- Simplest deployment method for single-server environments
- Provides complete isolation from host system
- Pre-packaged with all dependencies (Node.js, PostgreSQL, Nginx, LibreOffice core, fonts)
- Easy local development setup (developers can run locally with `docker-compose up`)
- Official ONLYOFFICE Docker images maintained and updated regularly
- Resource requirements manageable (4GB RAM, 2 CPU cores)

**Alternatives Considered**:
- **Kubernetes Helm chart**: Overkill for single-instance deployment; adds complexity
- **VM deployment**: Requires manual dependency management; harder to version control configuration
- **Cloud SaaS (ONLYOFFICE Cloud)**: $5-15/user/month cost; data privacy concerns for legal documents; vendor lock-in

**Implementation Notes**:
- Use official `onlyoffice/documentserver` Docker image (latest stable: 7.5.1)
- Configure via environment variables in `docker-compose.yml`
- Enable JWT authentication (`JWT_ENABLED=true`)
- Expose on port 80 (or 443 with SSL)
- Mount volumes for persistent storage (cache, logs, fonts)

**Example docker-compose.yml**:
```yaml
version: '3'
services:
  onlyoffice-documentserver:
    image: onlyoffice/documentserver:7.5.1
    container_name: onlyoffice-documentserver
    ports:
      - "80:80"
      - "443:443"
    environment:
      - JWT_ENABLED=true
      - JWT_SECRET=${ONLYOFFICE_JWT_SECRET}
      - JWT_HEADER=Authorization
      - JWT_IN_BODY=true
    volumes:
      - onlyoffice_data:/var/www/onlyoffice/Data
      - onlyoffice_logs:/var/log/onlyoffice
      - onlyoffice_cache:/var/lib/onlyoffice
    restart: unless-stopped

volumes:
  onlyoffice_data:
  onlyoffice_logs:
  onlyoffice_cache:
```

---

## R2: JWT Authentication Pattern

### Decision: jsonwebtoken library with HS256 algorithm

**Rationale**:
- HS256 (HMAC with SHA-256) is symmetric encryption sufficient for server-to-server authentication
- ONLYOFFICE Document Server supports HS256 out-of-the-box (default configuration)
- `jsonwebtoken` is industry-standard Node.js library (25M+ weekly downloads)
- Simpler than asymmetric RSA keys (no key pair management)
- Tokens can be generated/validated server-side without additional infrastructure

**Alternatives Considered**:
- **RS256 (RSA asymmetric)**: More secure but unnecessary complexity; requires public/private key pair management
- **API keys per document**: No expiration support; harder to revoke; doesn't support user attribution
- **OAuth 2.0**: Massive overkill for server-to-server auth; designed for third-party delegated access

**Implementation Notes**:
- Generate tokens in `/api/onlyoffice/token` endpoint
- Include claims: `contractId`, `userId`, `mode` (edit/view), `exp` (4 hours)
- Sign with shared secret from environment variable (`ONLYOFFICE_JWT_SECRET`)
- ONLYOFFICE validates token signature on every request
- Refresh tokens 30 minutes before expiration (3.5 hours after creation)

**Token Structure**:
```typescript
interface ONLYOFFICEToken {
  contractId: string;
  userId: string;
  mode: 'edit' | 'view';
  iat: number;  // Issued at
  exp: number;  // Expires at (4 hours)
}
```

**Example Usage**:
```typescript
import jwt from 'jsonwebtoken';

const secret = process.env.ONLYOFFICE_JWT_SECRET!;

function generateToken(contractId: string, userId: string, mode: 'edit' | 'view') {
  return jwt.sign(
    { contractId, userId, mode },
    secret,
    { expiresIn: '4h' }
  );
}

function validateToken(token: string): ONLYOFFICEToken {
  return jwt.verify(token, secret) as ONLYOFFICEToken;
}
```

---

## R3: Finding Comment Injection Strategy

### Decision: Use ONLYOFFICE Document Editor API `AddComment` method with text search

**Rationale**:
- ONLYOFFICE provides `AddComment` method in Document Editor API for programmatic comment insertion
- Text search API (`SearchAndReplace` with search-only mode) can locate finding excerpts in document
- Dynamic injection at document load time (no pre-processing of Word files required)
- Supports finding updates without re-uploading documents
- Comments can include rich metadata (author, date, risk level) via custom data fields

**Alternatives Considered**:
- **Pre-process Word document with python-docx**: Requires server-side Word file manipulation; comments baked in (can't update)
- **Manual annotation workflow**: Not automated; defeats purpose of AI analysis
- **Custom overlay layer (like Feature 008)**: Loses ONLYOFFICE native comment UI; not compatible with exported files

**Implementation Notes**:
- Execute `AddComment` method after document loads via ONLYOFFICE JavaScript API connector
- Use finding `excerpt` field (from Feature 005) as search query
- Position comment at first occurrence of excerpt text
- Fallback to clause-level positioning if exact match not found (search clause heading)
- Include finding data in comment text and custom data field for retrieval

**Risk Level Styling**:
- HIGH: Red icon/marker (`#ef4444`)
- MEDIUM: Yellow/orange icon (`#f59e0b`)
- LOW: Green icon (`#10b981`)

**Example API Call**:
```javascript
const connector = window.DocEditor.instances['onlyoffice-editor'];

connector.executeMethod('AddComment', [{
  Text: finding.description,
  UserName: 'AI Analysis',
  Time: new Date().toISOString(),
  Solved: false,
  Data: JSON.stringify({ 
    findingId: finding.id,
    riskLevel: finding.riskLevel,
    ruleId: finding.ruleId
  }),
  QuoteText: finding.excerpt.substring(0, 60) // Text to search for
}]);
```

---

## R4: Track Changes Injection Strategy

### Decision: Compute changes from decision event log, inject via ONLYOFFICE API at load time

**Rationale**:
- Feature 006 provides append-only event log of all clause decisions (`ClauseDecision` model)
- ONLYOFFICE supports Track Changes mode with `StartTrackChanges()` and text replacement methods
- Dynamic generation ensures changes always reflect latest decisions (supports undo/revert)
- User attribution built-in via ONLYOFFICE tracked change author field
- No pre-generation of Word files required

**Alternatives Considered**:
- **Pre-generate Word file with Track Changes using docx library**: Must regenerate on every decision change; no real-time updates
- **Manual entry of changes**: Not automated; defeats purpose
- **Custom visual overlay (Feature 008 approach)**: Loses native Word compatibility; can't export to real Track Changes format

**Implementation Notes**:
- Read all `ClauseDecision` events for contract via `computeProjection()` (Feature 006)
- For each decision with text modification (fallback, manual edit):
  - Find original text in document via search API
  - Delete original text with Track Changes enabled (`isDelete: true`)
  - Insert replacement text with Track Changes enabled
- Enable Track Changes mode globally via `SetTrackChangesDisplay(true)`
- Set change author to user who made decision (`decision.createdBy`)
- Toggle Track Changes visibility via UI control

**Decision Type Mapping**:
| Decision Type | Original Text | Replacement Text | Track Change Type |
|---------------|---------------|------------------|-------------------|
| Accept Deviation | N/A | N/A | None (no change) |
| Apply Fallback | Clause text | Fallback text | Delete + Insert |
| Manual Edit | Clause text | User-edited text | Delete + Insert |

**Example API Calls**:
```javascript
connector.executeMethod('StartTrackChanges');

// For each decision with text modification:
connector.executeMethod('SearchAndReplace', {
  searchString: originalText,
  replaceString: replacementText,
  matchCase: true,
  trackChanges: true,
  author: decision.createdBy,
  date: new Date(decision.createdAt)
});

connector.executeMethod('SetTrackChangesDisplay', { mode: 'markup' });
```

---

## R5: Session Refresh Mechanism

### Decision: Client-side timer with 30-minute advance refresh via API call

**Rationale**:
- Client controls session lifecycle (knows when document actively being viewed)
- 30-minute advance refresh prevents expiration during active review
- Simple implementation using `setInterval` in React component
- Fails gracefully if network offline (user sees "Session expired" message)
- No server-side background jobs required

**Alternatives Considered**:
- **WebSocket heartbeat**: Adds WebSocket infrastructure complexity; unnecessary for simple token refresh
- **Server-side refresh**: Server doesn't know if user still viewing; wastes resources refreshing abandoned sessions
- **No refresh (let session expire)**: Poor UX; interrupts active review sessions after 4 hours

**Implementation Notes**:
- Start refresh timer when ONLYOFFICE viewer loads
- Call `/api/onlyoffice/token` every 3.5 hours (30 minutes before expiration)
- Update ONLYOFFICE config with new token via `updateConfig()` method
- Clear timer when user navigates away or closes document
- Display "Refreshing session..." indicator during refresh (< 500ms)

**Example React Hook**:
```typescript
function useSessionRefresh(contractId: string, initialToken: string) {
  const [token, setToken] = useState(initialToken);

  useEffect(() => {
    // Refresh 30 minutes before expiration (3.5 hours)
    const refreshInterval = 3.5 * 60 * 60 * 1000;

    const timer = setInterval(async () => {
      try {
        const response = await fetch('/api/onlyoffice/token', {
          method: 'POST',
          body: JSON.stringify({ contractId }),
        });
        const { token: newToken } = await response.json();
        setToken(newToken);
        
        // Update ONLYOFFICE config
        window.DocEditor.instances['onlyoffice-editor']?.updateConfig({
          token: newToken
        });
      } catch (error) {
        console.error('Token refresh failed:', error);
        // Display "Session expired" message to user
      }
    }, refreshInterval);

    return () => clearInterval(timer);
  }, [contractId]);

  return token;
}
```

---

## R6: Document Download Endpoint Security

### Decision: Token-based authentication separate from user session

**Rationale**:
- ONLYOFFICE Document Server makes server-to-server requests (cannot send browser cookies)
- Token-based auth allows ONLYOFFICE server to authenticate without user session
- One-time or short-lived tokens prevent unauthorized access if token leaked
- Separate from ONLYOFFICE JWT (download token vs. editing session token)

**Alternatives Considered**:
- **User session cookies**: ONLYOFFICE server cannot send browser session cookies (different domain/server)
- **API keys**: No expiration; harder to revoke; shared across all documents
- **Public URLs**: Security risk; any user with URL can download any contract

**Implementation Notes**:
- Generate download token when creating ONLYOFFICE session
- Include download token in ONLYOFFICE config `document.url` parameter
- Validate token in `/api/contracts/[id]/download` endpoint
- Token expires after 1 hour (long enough for ONLYOFFICE to download)
- Token single-use (invalidated after first download) or limited to ONLYOFFICE server IP

**Token Structure**:
```typescript
interface DownloadToken {
  contractId: string;
  expiresAt: number;
  purpose: 'onlyoffice-download';
}
```

**Example Endpoint**:
```typescript
// GET /api/contracts/[id]/download?token=abc123
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get('token');

  // Validate token
  const decoded = jwt.verify(token, secret) as DownloadToken;
  if (decoded.purpose !== 'onlyoffice-download') {
    return new Response('Invalid token', { status: 403 });
  }

  // Serve file
  const contract = await prisma.contract.findUnique({
    where: { id: decoded.contractId },
    include: { document: true }
  });

  const fileBuffer = await fs.readFile(contract.document.filePath);

  return new Response(fileBuffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Content-Disposition': `inline; filename="${contract.title}.docx"`
    }
  });
}
```

---

## Best Practices

### ONLYOFFICE Deployment
- Always enable JWT authentication in production (`JWT_ENABLED=true`)
- Use strong random secret (32+ characters) for JWT_SECRET
- Configure HTTPS/SSL for production deployments (Let's Encrypt recommended)
- Set appropriate resource limits in Docker (4GB RAM minimum, 2 CPU cores)
- Monitor ONLYOFFICE health endpoint (`/healthcheck`) for uptime tracking
- Configure log rotation to prevent disk space issues

### Security
- Never expose JWT secrets in client-side code or version control
- Validate user permissions before generating ONLYOFFICE tokens
- Use short-lived tokens (4 hours) with automatic refresh
- Sanitize file paths to prevent directory traversal attacks
- Implement rate limiting on token generation endpoints (10 requests/minute per user)
- Log all document downloads for audit trail

### Performance
- Use ONLYOFFICE's built-in caching (stores rendered pages in memory)
- Configure Redis for ONLYOFFICE cache storage (optional, improves multi-instance deployments)
- Implement lazy loading for finding comments (inject in batches of 20)
- Debounce Track Changes updates (wait 500ms after last decision before injecting)
- Monitor ONLYOFFICE response times; restart container if > 5s consistently

### Error Handling
- Always provide fallback to direct document download if ONLYOFFICE unavailable
- Display clear error messages for common failures (connection timeout, invalid token, document not found)
- Implement retry logic for transient ONLYOFFICE API failures (3 retries with exponential backoff)
- Log all ONLYOFFICE errors with context (contractId, userId, operation) for debugging

## Dependency Installation

```bash
# Next.js application dependencies
npm install @onlyoffice/document-editor-react jsonwebtoken
npm install --save-dev @types/jsonwebtoken

# Docker deployment (no npm installation required)
# Use official ONLYOFFICE Document Server Docker image
docker pull onlyoffice/documentserver:7.5.1
```

## Environment Variables

```bash
# .env.local
ONLYOFFICE_SERVER_URL=http://localhost:80  # Or https://onlyoffice.yourdomain.com in production
ONLYOFFICE_JWT_SECRET=your-super-secret-jwt-key-min-32-chars
DATABASE_URL=file:./prisma/dev.db  # Existing
NEXT_PUBLIC_APP_URL=http://localhost:3000  # Existing
```

## Performance Benchmarks (Expected)

Based on ONLYOFFICE documentation and testing:

| Operation | Target | Notes |
|-----------|--------|-------|
| Document load (20-50 pages) | < 3s | First page render time |
| Finding comments injection (50 findings) | < 3s | Using batched AddComment calls |
| Track Changes display (30 decisions) | < 2s | Cached after first injection |
| Token refresh | < 500ms | Simple JWT generation |
| Export download | < 5s | Native ONLYOFFICE export for 50 pages |
| Concurrent users (Community Edition) | 20 | Hard limit; upgrade to Enterprise for more |

## Future Enhancements (Out of Scope for MVP)

- Redis cache integration for multi-instance ONLYOFFICE deployments
- Load balancing across multiple ONLYOFFICE Document Server instances
- Real-time collaborative presence indicators (user avatars, cursor positions)
- Version history UI with side-by-side comparison
- Mobile-responsive viewer (currently desktop/tablet only)
- Integration with external storage (S3, Azure Blob) for large documents

## References

- [ONLYOFFICE Document Server Documentation](https://api.onlyoffice.com/editors/basic)
- [ONLYOFFICE Document Builder API](https://api.onlyoffice.com/docbuilder/basic)
- [ONLYOFFICE JavaScript API](https://api.onlyoffice.com/editors/config/)
- [ONLYOFFICE Docker Deployment Guide](https://github.com/ONLYOFFICE/Docker-DocumentServer)
- [JWT Best Practices (RFC 8725)](https://datatracker.ietf.org/doc/html/rfc8725)
- [jsonwebtoken npm package](https://www.npmjs.com/package/jsonwebtoken)
