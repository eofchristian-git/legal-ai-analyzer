# Research: Collabora Online Viewer Integration (Replacing ONLYOFFICE)

**Feature**: 009 — Document Viewer Migration  
**Date**: 2026-02-18  
**Status**: Complete

---

## R1: Collabora Online Deployment Model

### Decision: Collabora CODE via Docker with WOPI protocol

### Rationale

Collabora Online Development Edition (CODE) is the freely available Docker image
for development and small-scale deployments. It implements the WOPI protocol,
which is an industry-standard interface for web-based office document editing.
This aligns with our architecture because:

- **Docker-native**: Same deployment model as our current ONLYOFFICE setup.
- **WOPI protocol**: Standard interface — our Next.js app becomes a "WOPI host."
  Collabora (the "WOPI client") fetches documents via HTTP from our API. This
  replaces the ONLYOFFICE-specific JWT/config-signing scheme with a simpler
  standard.
- **No npm package required**: Unlike ONLYOFFICE (which uses
  `@onlyoffice/document-editor-react`), Collabora is embedded via a plain
  `<iframe>`. No client-side vendor library needed.
- **Read-only is first-class**: WOPI CheckFileInfo sets `UserCanWrite: false`
  and Collabora enforces it server-side. No risk of client-side bypass.

### Alternatives Considered

| Alternative | Rejected Because |
|-------------|-----------------|
| Keep ONLYOFFICE | Requires paid Enterprise/Developer Edition for Connector API (comment injection, tracked changes). Community Edition is severely limited. Licensing cost and complexity. |
| LibreOffice Online (direct) | CODE _is_ LibreOffice-based but adds the web-serving layer. Raw LibreOffice has no web embedding. |
| Simple DOCX → HTML conversion | Already have this (Feature 008 legacy viewer). Loses formatting fidelity. |
| PDF.js viewer | Would require DOCX→PDF conversion step. Loses editability path for future features. No native DOCX track-change support. |
| Google Docs Viewer | External dependency, privacy concerns for legal documents, no self-hosting. |

---

## R2: WOPI Protocol — How It Works

### Decision: Implement standard WOPI host endpoints in Next.js API routes

### How WOPI Works

```
┌──────────────┐         ┌──────────────────┐         ┌─────────────────┐
│   Browser     │ iframe  │  Collabora CODE  │  WOPI   │  Next.js App    │
│   (React)     │ ──────> │  (Docker)        │ ──────> │  (WOPI Host)    │
│               │ postMsg │                  │  HTTP   │                 │
└──────────────┘         └──────────────────┘         └─────────────────┘
```

1. **Browser** loads an `<iframe>` pointing to Collabora with a `WOPISrc` URL parameter.
2. **Collabora** calls our WOPI endpoints to get file info and contents.
3. **Our app** (WOPI host) validates the access token and serves the file.

### WOPI Endpoints Required

| Endpoint | Method | Purpose | Required for Read-Only |
|----------|--------|---------|----------------------|
| `/api/wopi/files/{fileId}` | GET | CheckFileInfo — returns file metadata and permissions | ✅ Yes |
| `/api/wopi/files/{fileId}/contents` | GET | GetFile — returns the raw document bytes | ✅ Yes |
| `/api/wopi/files/{fileId}/contents` | POST | PutFile — saves edited document | ❌ No (read-only) |

### Access Token Strategy

WOPI uses an `access_token` query parameter on every request. We generate a
short-lived JWT token containing `{ fileId, userId, permissions }` and pass it in the
iframe URL. Collabora forwards this token on all WOPI calls. Our API validates it.

This replaces the ONLYOFFICE approach of:
- Generating a download token + access token + signing the full editor config as JWT
- Managing session lifecycle in the `OnlyOfficeSession` database table

With WOPI, token validation is stateless (JWT verify) and we can optionally
store sessions for audit trail purposes only.

### Rationale

- WOPI is the standard protocol for LibreOffice/Collabora — well-documented,
  well-tested.
- Simpler than ONLYOFFICE: No callback handlers needed for read-only mode.
  ONLYOFFICE required `/api/onlyoffice/callback/{contractId}` to handle
  save/close events. With read-only WOPI, the only server calls are
  CheckFileInfo and GetFile.
- Access tokens are stateless JWTs — no DB session table required.

### Alternatives Considered

| Alternative | Rejected Because |
|-------------|-----------------|
| Direct file URL (no WOPI) | Collabora supports `NotWOPIButIframe=true` but this bypasses authentication entirely. Unacceptable for legal documents. |
| Session-based tokens in DB | Adds complexity. ONLYOFFICE required this for session management. WOPI tokens can be stateless JWTs. |
| Cookie-based auth | Collabora runs in a different origin — cookies won't be sent cross-origin to our WOPI endpoints. WOPI token approach is the standard solution. |

---

## R3: Viewer UI Configuration — Read-Only & Minimal Chrome

### Decision: Use WOPI CheckFileInfo permissions + iframe URL parameters + postMessage API

### Read-Only Enforcement

The primary mechanism is **server-side** via WOPI CheckFileInfo response:

```json
{
  "BaseFileName": "contract.docx",
  "Size": 45000,
  "UserCanWrite": false,
  "UserCanNotWriteRelative": true,
  "DisablePrint": false,
  "DisableExport": false,
  "HidePrintOption": false,
  "HideExportOption": false,
  "HideSaveOption": true,
  "UserCanRename": false
}
```

Collabora enforces `UserCanWrite: false` server-side — even if someone
manipulates the client, edits cannot be saved back.

### UI Minimization

Collabora supports extensive UI customization via iframe URL parameters:

| Parameter | Value | Effect |
|-----------|-------|--------|
| `permission` | `readonly` | Forces read-only mode |
| `NotebookbarView` | not set | Use classic menu (or set for notebookbar) |
| `closebutton` | `0` | Hides the close button |
| `StatusBarHeight` | `0` (via postMessage) | Hides status bar |

Additional UI stripping via **postMessage** after document loads:

```javascript
// Hide all toolbars for a clean, document-only view
iframe.contentWindow.postMessage(JSON.stringify({
  MessageId: 'Hide_Menu_Bar',
}), collaboraOrigin);

iframe.contentWindow.postMessage(JSON.stringify({
  MessageId: 'Hide_Status_Bar',
}), collaboraOrigin);

// Optionally show only the compact view toolbar
iframe.contentWindow.postMessage(JSON.stringify({
  MessageId: 'Show_Toolbar',
  Values: { Show: false }
}), collaboraOrigin);
```

The overall approach:
1. **CheckFileInfo** sets `UserCanWrite: false` → read-only enforced server-side
2. **iframe URL params** set `permission=readonly` → UI adapts to read-only mode
3. **postMessage** after load hides remaining chrome → clean document-only view

### Rationale

Three-layer approach (server + URL params + postMessage) ensures read-only mode
is robust. Even if postMessage fails, the server-side enforcement prevents any writes.

### Alternatives Considered

| Alternative | Rejected Because |
|-------------|-----------------|
| CSS iframe overlay to block interaction | Fragile, doesn't prevent keyboard shortcuts, won't block save via other means. |
| Custom Collabora build with UI removed | Over-engineered. Standard configuration achieves the same result. |

---

## R4: Navigation Strategy — Scroll to Clause Without Bookmarks

### Decision: Use postMessage `.uno:ExecuteSearch` command with clause text matching

### How It Works

Collabora supports the LibreOffice UNO command interface via postMessage:

```javascript
// Step 1: Trigger search for clause text
iframe.contentWindow.postMessage(JSON.stringify({
  MessageId: 'Action_Exec',
  Values: {
    command: '.uno:ExecuteSearch',
    json: JSON.stringify({
      SearchItem: {
        SearchString: clauseTextPrefix,
        Backward: false,
        SearchStartPointX: 0,
        SearchStartPointY: 0,
      }
    })
  }
}), collaboraOrigin);
```

### Navigation Flow

1. User clicks a clause in the sidebar → clause GUID sent to viewer component.
2. Viewer looks up the clause's extracted text from the contract data.
3. Viewer computes a **unique search snippet** (first 60-80 characters of clause text).
4. Viewer sends `.uno:ExecuteSearch` via postMessage to the Collabora iframe.
5. Collabora finds and scrolls to the matching text in the document.

### Handling Repeated Text

If the same text appears multiple times in the document:

1. **Primary strategy**: Use the clause's position (order) from AI extraction.
   Search sequentially from the document start, sending `.uno:ExecuteSearch`
   N times to skip to the Nth occurrence.
2. **Secondary strategy**: Combine the clause heading/number (if present) with
   the text for a more unique match.
3. **Tertiary fallback**: Use a longer excerpt (120+ characters) which is
   statistically unique in legal documents.

### Re-Navigation After Reload

After the document reloads (e.g., post-mutation), we need to re-trigger navigation:

1. Listen for Collabora's `App_LoadingStatus: Document_Loaded` postMessage event.
2. Store the last-navigated clause ID in React state.
3. After receiving `Document_Loaded`, re-execute the search command.

### Rationale

- **No bookmarks in DOCX**: The user explicitly requires no bookmark insertion.
  Text search is the only viable approach.
- **UNO commands are well-documented**: LibreOffice's UNO API is extensive and
  stable. `.uno:ExecuteSearch` is the standard search command.
- **postMessage is the official integration path**: Collabora's documentation
  recommends postMessage for all host↔viewer communication.

### Alternatives Considered

| Alternative | Rejected Because |
|-------------|-----------------|
| Insert hidden bookmarks | Violates constraint "No bookmarks inserted into DOCX." |
| Page-number-based scrolling | Unreliable — page breaks depend on rendering engine, fonts, etc. |
| Character offset scrolling | Not supported by Collabora postMessage API. |
| Named ranges | Still modifies the DOCX file structure. Violates constraint. |

---

## R5: Reload Strategy After Backend Document Mutation

### Decision: Version-token iframe reload with re-navigation

### How It Works

When the backend mutates the DOCX (fallback apply/remove, manual edit save):

1. **Backend updates DOCX** file on disk (overwrite in place — existing behavior).
2. **Backend increments version counter** or updates `Document.updatedAt` timestamp.
3. **Frontend receives mutation confirmation** (from triage decision API response).
4. **Frontend generates new WOPI access token** with the new version embedded.
5. **Frontend reloads the iframe** by updating the `src` attribute with the new
   token URL. The version change in the WOPI access token ensures Collabora
   fetches the fresh file (cache bust).
6. **On document load**, frontend re-triggers clause navigation.

### Cache Busting

WOPI's `CheckFileInfo` response includes a `Version` field. When this changes,
Collabora knows to re-fetch the file instead of using a cached copy:

```json
{
  "Version": "1708281234567",
  "BaseFileName": "contract.docx"
}
```

We derive `Version` from `Document.updatedAt.getTime()` — any mutation changes
the timestamp, which changes the version, which forces Collabora to re-fetch.

### Flicker Mitigation

To prevent the white-flash when reloading the iframe:
1. Show a brief loading overlay (50% opacity spinner) over the iframe.
2. Listen for `App_LoadingStatus: Document_Loaded` postMessage.
3. Remove the overlay when document is loaded.

### Rationale

- **Deterministic reload**: Version-token approach guarantees the new file is
  fetched. No stale cache issues (which plagued our ONLYOFFICE setup).
- **Simple implementation**: Just change the iframe `src` attribute.
- **No WebSocket needed**: Polling-free — the reload is triggered by the
  mutation response, not by a push mechanism.

### Alternatives Considered

| Alternative | Rejected Because |
|-------------|-----------------|
| Collabora `Action_Save` / `Action_Close` commands | These are for collaborative editing scenarios. In read-only mode, there's nothing to save. Reloading the iframe is simpler. |
| WebSocket file-change notifications | Over-engineered. The mutation is always triggered by the user's own action in the sidebar — they already know to expect a reload. |
| Service Worker cache control | Collabora controls its own caching. WOPI Version field is the standard mechanism. |

---

## R6: Host ↔ Collabora Communication

### Decision: postMessage API (bidirectional)

### Communication Channels

| Direction | Mechanism | Use Cases |
|-----------|-----------|-----------|
| Host → Collabora | `iframe.contentWindow.postMessage()` | Search/navigate, hide UI, execute commands |
| Collabora → Host | `window.addEventListener('message')` | Document loaded, errors, user interactions |

### Key Messages (Host → Collabora)

| MessageId | Purpose |
|-----------|---------|
| `Host_PostmessageReady` | Initialize postMessage channel |
| `Action_Exec` (`.uno:ExecuteSearch`) | Find and scroll to text |
| `Hide_Menu_Bar` | Remove menu bar |
| `Hide_Status_Bar` | Remove status bar |
| `Action_Print` | Trigger print dialog |
| `Action_Export` (`.uno:ExportToPDF`) | Export as PDF |

### Key Messages (Collabora → Host)

| MessageId | Purpose |
|-----------|---------|
| `App_LoadingStatus` | Document load progress (Frame_Ready → Document_Loaded) |
| `UI_Error` | Error occurred in viewer |
| `View_Added` | New view opened |
| `Doc_ModifiedStatus` | Document modification status changed |
| `Action_Save_Resp` | Save completed (not used in read-only) |

### PostMessage Protocol

```javascript
// Outbound (Host → Collabora)
const msg = JSON.stringify({ MessageId: 'Action_Exec', Values: { ... } });
iframeRef.current.contentWindow.postMessage(msg, collaboraOrigin);

// Inbound (Collabora → Host)
window.addEventListener('message', (event) => {
  if (event.origin !== collaboraOrigin) return;
  const data = JSON.parse(event.data);
  switch (data.MessageId) {
    case 'App_LoadingStatus':
      if (data.Values.Status === 'Document_Loaded') {
        // Document is ready for API calls
      }
      break;
    case 'UI_Error':
      // Handle error
      break;
  }
});
```

### Rationale

postMessage is the only supported integration mechanism for Collabora Online.
It's the standard web platform API for cross-origin iframe communication.
This replaces ONLYOFFICE's Connector API (which required Developer/Enterprise
Edition and used `createConnector()` / `executeMethod()`).

---

## R7: Collabora Discovery Endpoint

### Decision: Use `/hosting/discovery` to dynamically resolve the iframe URL pattern

### How It Works

Collabora exposes a discovery XML at `https://<collabora>/hosting/discovery`:

```xml
<wopi-discovery>
  <net-zone name="external-https">
    <app name="application/vnd.openxmlformats-officedocument.wordprocessingml.document">
      <action ext="docx" name="view" urlsrc="https://collabora:9980/browser/dist/cool.html?"/>
    </app>
  </net-zone>
</wopi-discovery>
```

Our WOPI host:
1. Fetches and caches the discovery XML on startup or first request.
2. Finds the `urlsrc` for the `view` action matching our file type (docx).
3. Appends `WOPISrc=<encoded-wopi-url>&access_token=<token>` to build the full iframe URL.

### Rationale

Using the discovery endpoint ensures we always have the correct iframe URL pattern,
even across Collabora version upgrades. This is the recommended approach in the
WOPI specification.

---

## R8: Edge Cases & Mitigations

### Large Documents (100+ pages)

- **Risk**: Slow load time, search latency.
- **Mitigation**: Collabora is optimized for large documents (LibreOffice engine).
  Initial load may take 3-8 seconds for 100+ page documents. Show a loading
  spinner. Search is fast once document is loaded (runs server-side in Collabora).
- **Monitoring**: Track `App_LoadingStatus` timing.

### Clause Text Appears Multiple Times

- **Risk**: Search lands on the wrong occurrence.
- **Mitigation**: Use position-based disambiguation (search N times for Nth occurrence)
  or use longer/unique text snippets. For clauses with very common text,
  prepend the clause number/heading to the search string.

### Search Mismatch (Text Not Found)

- **Risk**: AI-extracted clause text doesn't exactly match DOCX content.
- **Mitigation**: 
  1. Use fuzzy matching — try progressively shorter substrings.
  2. Fall back to searching for just the first sentence.
  3. If all searches fail, show a toast notification "Could not locate clause in document."
  4. No silent failure — always inform the user.

### Network Latency (Docker Communication)

- **Risk**: Slow WOPI calls if Collabora container is remote.
- **Mitigation**: Local Docker deployment (same machine). WOPI calls are simple
  HTTP — file serving is fast for <10MB DOCX files. `host.docker.internal` for
  container→host communication (same as current ONLYOFFICE setup).

### Viewer Reload While User on Clause Panel

- **Risk**: User is reading a clause, backend mutation reloads the document.
- **Mitigation**: 
  1. Store the active clause ID before reload.
  2. After `Document_Loaded`, re-navigate to the same clause.
  3. Show a brief "Updating document…" indicator.

---

## R9: Migration Checklist — ONLYOFFICE → Collabora

### Backend Changes

| Component | Action | Details |
|-----------|--------|---------|
| Docker setup | **Replace** | `docker/onlyoffice/` → `docker/collabora/`, new `docker-compose.yml` with `collabora/code` image |
| WOPI endpoints | **Create new** | `GET /api/wopi/files/{fileId}` (CheckFileInfo), `GET /api/wopi/files/{fileId}/contents` (GetFile) |
| Token generation | **Simplify** | Replace ONLYOFFICE multi-token approach with single WOPI access token JWT |
| Callback handler | **Remove** | `/api/onlyoffice/callback/` — not needed for read-only WOPI |
| Health check | **Replace** | Check Collabora `/hosting/discovery` instead of ONLYOFFICE `/healthcheck` |
| Session management | **Simplify** | Stateless JWT tokens. Optional: keep session table for audit. |
| Lock/presence APIs | **Remove** | `/api/onlyoffice/lock/`, `/api/onlyoffice/presence/` — no collaboration features |
| Download endpoint | **Repurpose** | `/api/contracts/{id}/download` kept but refactored as WOPI GetFile |
| Middleware | **Update** | Replace ONLYOFFICE route bypasses with WOPI route bypasses |
| Environment vars | **Replace** | `ONLYOFFICE_*` → `COLLABORA_*` |

### Frontend Changes

| Component | Action | Details |
|-----------|--------|---------|
| Viewer component | **Rewrite** | Replace `@onlyoffice/document-editor-react` with plain `<iframe>` + postMessage |
| Session manager | **Simplify** | Simple token fetch + iframe URL construction |
| Finding comments | **Remove (deferred)** | ONLYOFFICE Connector API comments dropped — sidebar highlights sufficient for MVP. Collabora postMessage-based highlighting can be added later if needed. |
| Finding highlights | **Remove (deferred)** | ONLYOFFICE Connector API highlights dropped — server-side DOCX mutation handles visual changes. In-document highlighting deferred to future iteration. |
| Tracked changes | **Remove** | Track changes were injected via ONLYOFFICE Connector API. With Collabora, rely on server-side DOCX mutation (already exists) |
| Contract detail page | **Update** | Update import paths, component props |
| Types | **Replace** | `src/types/onlyoffice.ts` → `src/types/collabora.ts` |

### What Remains Untouched

| Component | Why |
|-----------|-----|
| AI clause extraction | Not related to viewer |
| Clause triage workflow | Not related to viewer |
| Fallback language logic | Server-side DOCX mutation — viewer just reloads |
| DOCX mutation pipeline | Backend logic unchanged |
| Audit history | Existing logging continues to work |
| Status → highlight mapping | Handled by the clause list sidebar, not the viewer |
| Prisma schema (mostly) | `OnlyOfficeSession` table deprecated/removed; no new tables needed |
| PDF export | Already derived from DOCX server-side |

### NPM Dependency Changes

| Package | Action |
|---------|--------|
| `@onlyoffice/document-editor-react` | **Remove** |
| `jsonwebtoken` | **Keep** (used for WOPI access tokens) |
| No new packages | Collabora uses standard `<iframe>` + `postMessage` |

### Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| Collabora postMessage API less rich than ONLYOFFICE Connector | Medium | We only need search-and-scroll. PostMessage supports this. Comment injection was already limited to Enterprise Edition. |
| Different rendering fidelity | Low | Collabora uses LibreOffice engine — excellent DOCX support. May render slightly differently from ONLYOFFICE. Visual testing required. |
| Collabora CODE Docker image larger (~1.5GB) | Low | One-time download. Same pattern as ONLYOFFICE. |
| `.uno:ExecuteSearch` may not highlight found text | Medium | Test behavior. May need `.uno:SearchResultSelection` or additional commands. |
| Collabora Docker startup slower (~30-60 seconds) | Low | Same as ONLYOFFICE. Health check endpoint waits for readiness. |
