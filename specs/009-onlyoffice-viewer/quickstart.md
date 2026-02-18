# Quickstart: ONLYOFFICE Document Viewer Integration

**Feature**: 009-onlyoffice-viewer  
**Date**: 2026-02-18  
**Purpose**: Step-by-step guide for deploying and testing ONLYOFFICE integration

## Prerequisites

Before starting, ensure you have:

- [x] Docker Engine 20.x+ installed and running
- [x] Node.js 18+ and npm installed
- [x] Git repository cloned locally
- [x] Database migrated to latest schema (Prisma)
- [x] At least one contract uploaded in the system for testing

**System Requirements**:
- 4GB RAM minimum (for ONLYOFFICE Document Server)
- 2 CPU cores
- 10GB free disk space

---

## Step 1: Deploy ONLYOFFICE Document Server

### 1.1 Create Docker Configuration

Create a new file `docker/onlyoffice/docker-compose.yml`:

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

### 1.2 Create Environment File

Create `docker/onlyoffice/.env`:

```bash
# Generate a strong random secret (32+ characters)
# Example: openssl rand -base64 32
ONLYOFFICE_JWT_SECRET=your-super-secret-jwt-key-min-32-characters-here
```

### 1.3 Start ONLYOFFICE Document Server

```bash
cd docker/onlyoffice
docker-compose up -d
```

**Expected Output**:
```
Creating network "onlyoffice_default" with the default driver
Creating volume "onlyoffice_data" with default driver
Creating volume "onlyoffice_logs" with default driver
Creating volume "onlyoffice_cache" with default driver
Creating onlyoffice-documentserver ... done
```

### 1.4 Verify ONLYOFFICE is Running

```bash
# Check container status
docker ps | grep onlyoffice

# Check health endpoint (may take 30-60 seconds to be ready)
curl http://localhost:80/healthcheck

# Expected response: {"status":"true"}
```

**Troubleshooting**:
- If port 80 already in use, change to `"8080:80"` in docker-compose.yml
- If container fails to start, check logs: `docker logs onlyoffice-documentserver`
- If healthcheck fails, wait 60 seconds (ONLYOFFICE takes time to initialize)

---

## Step 2: Configure Next.js Application

### 2.1 Install Dependencies

```bash
# Navigate to project root
cd B:\Projects\legal-ai-anylizer\legal-ai-analyzer

# Install ONLYOFFICE React component and JWT library
npm install @onlyoffice/document-editor-react jsonwebtoken
npm install --save-dev @types/jsonwebtoken
```

### 2.2 Update Environment Variables

Add to `.env.local` (or `.env` for production):

```bash
# ONLYOFFICE Configuration
ONLYOFFICE_SERVER_URL=http://localhost:80
ONLYOFFICE_JWT_SECRET=your-super-secret-jwt-key-min-32-characters-here
ONLYOFFICE_JWT_ENABLED=true

# Existing variables
DATABASE_URL=file:./prisma/dev.db
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

**Important**: Use the **same JWT secret** from Step 1.2!

### 2.3 Run Database Migration

```bash
# Generate Prisma migration for OnlyOfficeSession model
npx prisma migrate dev --name add_onlyoffice_session

# Verify migration applied
npx prisma studio
# Navigate to OnlyOfficeSession table in browser UI
```

**Expected Output**:
```
Environment variables loaded from .env.local
Prisma schema loaded from prisma\schema.prisma
Datasource "db": SQLite database "dev.db" at "file:./prisma/dev.db"

Applying migration `20260218HHMMSS_add_onlyoffice_session`

The following migration(s) have been applied:

migrations/
  └─ 20260218HHMMSS_add_onlyoffice_session/
    └─ migration.sql

Your database is now in sync with your schema.
```

---

## Step 3: Test ONLYOFFICE Integration

### 3.1 Start Development Server

```bash
npm run dev
```

**Expected Output**:
```
  ▲ Next.js 16.1.6
  - Local:        http://localhost:3000
  - Environments: .env.local

 ✓ Ready in 3.2s
```

### 3.2 Open Contract Detail Page

1. Navigate to `http://localhost:3000` in your browser
2. Log in with your credentials
3. Go to **Contracts** page
4. Click on any contract to open detail page

### 3.3 Toggle to ONLYOFFICE Viewer

Look for toggle buttons at the top of the contract detail page:

```
[Clause View] [Document View]
```

Click **Document View** button.

**Expected Behavior**:
- ONLYOFFICE iframe loads (may take 3-5 seconds)
- Document appears with perfect formatting (fonts, colors, tables, images)
- You can scroll through pages
- Zoom controls work
- Document is interactive

**Troubleshooting**:
- If "Document View" button doesn't appear: Contract may not have been analyzed yet (run analysis first)
- If viewer shows error: Check browser console for error messages
- If viewer stuck loading: Verify ONLYOFFICE healthcheck passes (Step 1.4)
- If blank screen: Check CORS settings (ONLYOFFICE server must allow requests from Next.js app)

---

## Step 4: Test Finding Comment Injection

### 4.1 Ensure Contract Has Findings

1. If contract not analyzed yet, click **Analyze Contract** button
2. Wait for analysis to complete (30-90 seconds)
3. Verify findings appear in right panel

### 4.2 View Comments in ONLYOFFICE

After toggling to Document View:

1. Look for **comment markers** in the document (colored icons/bubbles)
2. Click on a comment marker
3. Verify comment shows:
   - Finding description
   - Risk level (HIGH/MEDIUM/LOW)
   - Matched rule

**Expected Comment Appearance**:
- **High Risk**: Red icon/marker
- **Medium Risk**: Yellow/orange icon/marker
- **Low Risk**: Green icon/marker

### 4.3 Test Sidebar → Comment Navigation

1. In the right panel (Findings), click on a specific finding
2. Document should scroll to that finding's comment
3. Comment should be highlighted/expanded

---

## Step 5: Test Track Changes Mode

### 5.1 Make Decisions on Findings

Before testing Track Changes, make at least one decision:

1. In the Findings panel, click on a finding
2. Choose one of the decision actions:
   - **Apply Fallback** (replaces text with playbook fallback)
   - **Manual Edit** (enter custom replacement text)
3. Confirm the decision

### 5.2 Enable Track Changes

1. Look for **"Show Track Changes"** toggle button
2. Click to enable Track Changes mode

**Expected Behavior**:
- Original text shows with **red strikethrough**
- Replacement text shows with **blue/green underline**
- Hovering over changes shows tooltip with:
  - User who made decision
  - Timestamp
  - Decision type

### 5.3 Toggle Track Changes Off

1. Click **"Hide Changes"** toggle
2. Document should show only final modified text (no markup)

---

## Step 6: Test Export Functionality

### 6.1 Export Document

1. Click **"Export Document"** button in contract header
2. Wait for download to complete (5-10 seconds)
3. Save file to disk

### 6.2 Verify Export in Microsoft Word

1. Open exported `.docx` file in Microsoft Word
2. Verify:
   - All formatting preserved
   - Track Changes visible in Review tab
   - Changes attributed to correct users
   - Document metadata includes contract title, export date

**Expected Track Changes in Word**:
- Red strikethrough for deletions
- Blue/green underline for insertions
- Comment balloons on right margin (if comments enabled)
- User attribution in Review tab

---

## Step 7: Test Session Token Refresh

This test verifies automatic token refresh works correctly.

### 7.1 Open Browser Developer Console

1. Open contract in Document View
2. Open browser DevTools (F12)
3. Go to Console tab

### 7.2 Monitor Token Refresh Logs

Look for log messages like:

```
[ONLYOFFICE] Session token will expire at: 2026-02-18T18:30:00Z
[ONLYOFFICE] Token refresh scheduled for: 2026-02-18T18:00:00Z (3.5 hours)
```

### 7.3 Simulate Token Refresh (Optional)

To test immediately without waiting 3.5 hours:

1. In DevTools Console, run:
   ```javascript
   // Trigger manual refresh
   window.refreshONLYOFFICEToken();
   ```

2. Verify new token generated (check network tab for `/api/onlyoffice/token` request)

---

## Step 8: Verify ONLYOFFICE Callback

This test verifies ONLYOFFICE sends save events correctly.

### 8.1 Make a Small Edit

1. Open contract in **edit mode** (not view mode)
2. Make a small text change in the document
3. Press Ctrl+S (or Cmd+S on Mac) to save

### 8.2 Check Server Logs

In your terminal (where `npm run dev` is running), look for:

```
ONLYOFFICE callback - Contract: cm3abc123xyz, Status: 2
Document saved: B:\Projects\...\uploads\contracts\contract-cm3abc123xyz-edited-1708268400000.docx
```

### 8.3 Verify Document Updated

1. Check the file system: `uploads/contracts/` directory
2. Verify new file created with `-edited-{timestamp}` suffix
3. Database: Verify `Document.filePath` updated to new file path

---

## Common Issues & Solutions

### Issue 1: ONLYOFFICE Not Loading

**Symptoms**: Blank iframe, stuck loading spinner

**Solutions**:
1. Verify ONLYOFFICE container running: `docker ps`
2. Check healthcheck: `curl http://localhost:80/healthcheck`
3. Check browser console for CORS errors
4. Verify `ONLYOFFICE_SERVER_URL` matches actual server URL

### Issue 2: JWT Token Errors

**Symptoms**: "Invalid signature" or "Token expired" errors

**Solutions**:
1. Verify JWT secrets match between ONLYOFFICE and Next.js app
2. Check system time is correct (JWT expiration time-sensitive)
3. Verify `ONLYOFFICE_JWT_ENABLED=true` in both configs

### Issue 3: Comments Not Appearing

**Symptoms**: Document loads but no finding comments visible

**Solutions**:
1. Verify contract has been analyzed (findings exist in database)
2. Check finding excerpts are not empty
3. Enable ONLYOFFICE comments UI (may be hidden by default)
4. Check browser console for comment injection errors

### Issue 4: Callback Not Working

**Symptoms**: Edits not saving, no callback logs in terminal

**Solutions**:
1. Verify callback URL accessible from ONLYOFFICE container
2. If using Docker, check network connectivity between containers
3. Verify JWT token included in callback request body
4. Check `/api/onlyoffice/callback/[id]` route exists and working

### Issue 5: Export Downloads Empty File

**Symptoms**: Export completes but file is 0 bytes or corrupted

**Solutions**:
1. Verify ONLYOFFICE has completed document rendering
2. Check ONLYOFFICE export API is responding
3. Verify file system permissions allow writing to uploads directory
4. Check disk space available

---

## Performance Benchmarks

Expected performance metrics (on recommended hardware):

| Operation | Target | Actual (Test) |
|-----------|--------|---------------|
| ONLYOFFICE container startup | < 60s | ___ seconds |
| Document load (20-page contract) | < 3s | ___ seconds |
| Finding comments injection (20 findings) | < 3s | ___ seconds |
| Track Changes display (10 decisions) | < 2s | ___ seconds |
| Token refresh | < 500ms | ___ ms |
| Export download (50-page contract) | < 10s | ___ seconds |

Fill in "Actual (Test)" column with your test results.

---

## Next Steps

After completing this quickstart, you're ready to:

1. ✅ **Phase 2: Production Deployment** — Deploy ONLYOFFICE to production server with HTTPS
2. ✅ **Phase 3: Collaborative Features** — Enable real-time collaborative editing (P3 feature)
3. ✅ **Phase 4: Migration** — Migrate existing contracts from Feature 008 HTML viewer
4. ✅ **Phase 5: Deprecation** — Remove deprecated HTML viewer code

See `tasks.md` (generated by `/speckit.tasks`) for detailed implementation tasks.

---

## Additional Resources

- [ONLYOFFICE Documentation](https://api.onlyoffice.com/editors/basic)
- [ONLYOFFICE Docker Deployment Guide](https://github.com/ONLYOFFICE/Docker-DocumentServer)
- [ONLYOFFICE JavaScript API Reference](https://api.onlyoffice.com/editors/config/)
- [Feature Specification](./spec.md)
- [Implementation Plan](./plan.md)
- [Research Document](./research.md)
- [Data Model](./data-model.md)
- [API Contracts](./contracts/)

---

## Support

If you encounter issues not covered in this guide:

1. Check ONLYOFFICE server logs: `docker logs onlyoffice-documentserver`
2. Check Next.js server logs: Look for errors in terminal
3. Check browser console: Look for JavaScript errors
4. Review [spec.md](./spec.md) edge cases section
5. Consult ONLYOFFICE official documentation

For bugs or feature requests, create an issue in the project repository.
