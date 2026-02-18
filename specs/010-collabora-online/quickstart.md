# Quickstart: Collabora Online Viewer Integration

**Feature**: 009 — Document Viewer Migration (ONLYOFFICE → Collabora)  
**Prerequisites**: Docker Desktop running, Node.js 18+, existing project setup

---

## Step 1: Start Collabora CODE Docker Container

```bash
# From project root
cd docker/collabora
docker compose up -d
```

Collabora CODE takes ~30-60 seconds to fully initialize. Verify readiness:

```bash
# Wait for the discovery endpoint to respond
curl -s http://localhost:9980/hosting/discovery | head -5
```

Expected output (XML):
```xml
<?xml version="1.0" encoding="utf-8"?>
<wopi-discovery>
  <net-zone name="external-http">
    <app name="application/vnd.openxmlformats-officedocument.wordprocessingml.document">
```

## Step 2: Configure Environment Variables

Add to `.env.local`:

```env
# Collabora Online Configuration
COLLABORA_SERVER_URL=http://localhost:9980
COLLABORA_JWT_SECRET=dev-secret-change-in-production-min-32-chars!!
NEXT_PUBLIC_COLLABORA_SERVER_URL=http://localhost:9980

# URL that Collabora (inside Docker) uses to reach our Next.js app
COLLABORA_APP_CALLBACK_URL=http://host.docker.internal:3000
```

Remove old ONLYOFFICE variables:
```env
# DELETE THESE:
# ONLYOFFICE_SERVER_URL=...
# ONLYOFFICE_JWT_SECRET=...
# ONLYOFFICE_JWT_ENABLED=...
# NEXT_PUBLIC_ONLYOFFICE_SERVER_URL=...
# ONLYOFFICE_APP_CALLBACK_URL=...
```

## Step 3: Update Database Schema

```bash
# Remove OnlyOfficeSession model and push schema
npx prisma db push
npx prisma generate
```

## Step 4: Remove ONLYOFFICE npm Package

```bash
npm uninstall @onlyoffice/document-editor-react
```

## Step 5: Start the Application

```bash
npm run dev
```

## Step 6: Verify Integration

1. Open a contract with an analyzed document.
2. Click **"Document View"** in the center panel toggle.
3. Verify:
   - [ ] Document loads in the embedded viewer (no ONLYOFFICE branding).
   - [ ] No toolbar, menu bar, or status bar visible — just the document.
   - [ ] Document is read-only (cannot type or edit).
   - [ ] Clicking a clause in the sidebar scrolls the document to that clause.
   - [ ] After applying a fallback (triage decision), the document reloads with updated content.
   - [ ] Error fallback shows a download link if Collabora is unavailable.

## Step 7: Health Check

```bash
curl http://localhost:3000/api/collabora/health
```

Expected:
```json
{
  "healthy": true,
  "serverUrl": "http://localhost:9980",
  "discoveryAvailable": true,
  "timestamp": "2026-02-18T12:00:00.000Z"
}
```

---

## Docker Compose Reference

`docker/collabora/docker-compose.yml`:

```yaml
services:
  collabora:
    image: collabora/code:latest
    container_name: collabora-code
    ports:
      - "9980:9980"
    environment:
      - "aliasgroup1=http://host.docker.internal:3000"
      - "server_name=localhost"
      - "extra_params=--o:ssl.enable=false --o:ssl.termination=false"
      - "username=admin"
      - "password=admin"
    cap_add:
      - MKNOD
    restart: unless-stopped
```

**Key environment variables**:
- `aliasgroup1`: Tells Collabora which WOPI host origins are allowed.
  Must match the URL that Collabora uses to reach our Next.js app.
- `server_name`: The hostname Collabora listens on.
- `extra_params`: Disable SSL for local development (use HTTPS in production).

---

## Troubleshooting

### Document shows "Error loading document"
- Check that `COLLABORA_APP_CALLBACK_URL` is set to `http://host.docker.internal:3000`
  (for Docker Desktop on Windows/Mac).
- Verify the WOPI endpoints are accessible: `curl http://localhost:3000/api/wopi/files/test`
  should return 401 (not 307 redirect to login).

### Collabora container won't start
- Ensure Docker Desktop is running.
- Check logs: `docker logs collabora-code`
- Ensure port 9980 is not in use by another service.

### "WOPI host not allowed" error
- The `aliasgroup1` environment variable must match the URL that Collabora
  uses to call our WOPI endpoints. For local Docker:
  `aliasgroup1=http://host.docker.internal:3000`

### Clause navigation not working
- Open browser console and check for postMessage errors.
- Verify the clause text exists in the document (search manually in the viewer).
- Check that `PostMessageOrigin` in CheckFileInfo matches `window.location.origin`.

---

## After completing this quickstart, you're ready to:

1. **Phase 1**: Verify all clause navigation works with different document types.
2. **Phase 2**: Test reload strategy with fallback apply/remove.
3. **Phase 3**: Validate edge cases (large documents, repeated text, search mismatches).
4. **Phase 4**: Remove ONLYOFFICE code and Docker setup.
5. **Phase 5**: Production deployment with SSL and Collabora licensing.
