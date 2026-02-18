# Implementation Plan: ONLYOFFICE Document Viewer Integration

**Branch**: `009-onlyoffice-viewer` | **Date**: 2026-02-18 | **Spec**: [spec.md](./spec.md)  
**Input**: Feature specification from `/specs/009-onlyoffice-viewer/spec.md`

**Note**: This template is filled in by the `/speckit.plan` command. See `.specify/templates/commands/plan.md` for the execution workflow.

## Summary

Replace the current HTML-based document viewer (mammoth.js for Word, pdf.js for PDF) with ONLYOFFICE Document Server integration to provide high-fidelity document rendering with perfect formatting preservation. Inject AI-generated findings as ONLYOFFICE comments with risk-level color coding. Enable Track Changes mode to display decision-based modifications (fallback text, manual edits) as native Word tracked changes. Support direct export from ONLYOFFICE with all changes preserved in Microsoft Word format. Optionally support real-time collaborative review sessions for multiple users.

**Key Technical Approach**:
- Deploy ONLYOFFICE Document Server as a Docker container accessible from Next.js app
- Embed `@onlyoffice/document-editor-react` component in contract detail page
- Generate JWT tokens for secure document access with 4-hour expiration
- Create API endpoints for document download and ONLYOFFICE callbacks
- Inject findings as ONLYOFFICE comments using the document editor API
- Convert decision events (Feature 006) into ONLYOFFICE tracked changes
- Leverage ONLYOFFICE's native export instead of custom Word/PDF generation
- Deprecate Feature 008 HTML viewer code after migration complete

## Technical Context

**Language/Version**: TypeScript 5.x (Next.js 16.1.6, App Router)  
**Primary Dependencies**: 
- Next.js 16, React 19, TypeScript
- Prisma ORM with SQLite
- shadcn/ui components
- @onlyoffice/document-editor-react (ONLYOFFICE embedding)
- jsonwebtoken (JWT authentication for ONLYOFFICE sessions)
- ONLYOFFICE Document Server (deployed separately in Docker)

**Storage**: 
- SQLite via Prisma ORM for session metadata, contract references
- File system storage for uploaded contracts (existing Document model with filePath)
- ONLYOFFICE Document Server accesses files via API endpoint serving from file system

**Testing**: No test framework configured (manual testing per constitution)  

**Target Platform**: Web application — desktop and tablet browsers (Chrome, Firefox, Edge, Safari)  

**Project Type**: Web application (Next.js full-stack, single project structure)  

**Performance Goals**: 
- Document viewer first page load < 3 seconds (contracts up to 50 pages)
- Finding comments injected < 3 seconds after document load
- Track Changes mode enabled < 2 seconds
- Supports contracts up to 200 pages, 50 MB file size
- ONLYOFFICE session token refresh < 500ms

**Constraints**: 
- ONLYOFFICE Document Server requires separate deployment (Docker container)
- Session tokens expire after 4 hours (must implement auto-refresh)
- ONLYOFFICE Community Edition limits: 20 concurrent connections
- Network connectivity required (no offline mode)
- Word format (.docx) primary; PDF secondary (read-only)

**Scale/Scope**: 
- Single organization with multiple reviewers
- Contracts: up to 200 pages, 50+ MB files
- Concurrent users: up to 20 (Community Edition limit)
- Session duration: up to 4 hours with automatic refresh
- Findings per contract: 50-100 comments

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

### ✅ Data Integrity

- **Compliance**: New `OnlyOfficeSession` entity will include `createdAt`, `updatedAt`, and `expiresAt` timestamps for audit trail
- **Audit Trail**: Leverages existing append-only `ClauseDecision` event log (Feature 006) for decision history; ONLYOFFICE callback saves document versions with timestamps
- **Soft Delete**: Not applicable — sessions expire automatically; document versions are retained indefinitely for finalized contracts
- **Migration**: Prisma migration required for `OnlyOfficeSession` model; deprecation plan for Feature 008 `ContractDocument` model

### ✅ Simplicity

- **Justified Complexity**: ONLYOFFICE integration adds infrastructure complexity (Docker deployment, JWT authentication, callback endpoints) but is justified by:
  - Eliminates complex HTML conversion logic (mammoth.js, pdf.js, position mapping, sanitization)
  - Removes custom export generation code (puppeteer, docx library)
  - Provides native Microsoft Word compatibility and Track Changes support
  - Reduces codebase complexity by ~1000 lines (removing Feature 008 conversion utilities)
- **No Premature Optimization**: ONLYOFFICE selected for immediate high-fidelity rendering need, not speculative features
- **Minimal Dependencies**: ONLYOFFICE Document Server (industry-standard, well-maintained), @onlyoffice/document-editor-react (official React wrapper), jsonwebtoken (standard JWT library)
- **YAGNI**: No speculative features; all requirements traced to user stories; collaborative editing (P3) optional for MVP

### ✅ AI-Assisted, Human-Controlled

- **No AI Decision Making**: Feature only displays AI-generated findings as comments; users make all decisions through existing UI (Feature 006/007)
- **No New AI Prompts**: No additional Claude interactions required; reuses existing finding data from Feature 005
- **Graceful Handling**: ONLYOFFICE connection failures display clear error messages with fallback to direct document download
- **User Control**: Users control document viewing mode (edit/view), Track Changes toggle, comment visibility, and export options

### ✅ Technology Constraints

- **Runtime**: Next.js App Router with TypeScript ✅ (compliant)
- **Database**: Prisma ORM with SQLite ✅ (compliant)
- **UI**: shadcn/ui components ✅ (compliant — ONLYOFFICE iframe embedded in existing layout)
- **AI Provider**: No new Claude interactions ✅ (N/A for this feature)
- **Text Processing**: Removes custom diff-match-patch usage (Feature 008) in favor of ONLYOFFICE native Track Changes ✅ (simplification)
- **Path Alias**: `@/*` → `./src/*` ✅ (compliant)

### ✅ Data Design Patterns

- **Optional Fields**: `OnlyOfficeSession.documentKey` nullable until document loaded; `ConversionStatus` removed from ContractDocument (no longer needed)
- **Position Fields**: N/A — ONLYOFFICE handles text positioning internally via its own coordinate system
- **Status Lifecycle**: Session status: `active` → `expired` | `revoked`; no analysis status changes
- **Event Sourcing**: Leverages existing `ClauseDecision` event log (Feature 006) for generating tracked changes; no new event log required

### Gate Decision: ✅ **PASS** - All principles satisfied

**Complexity Justification**:
- ONLYOFFICE infrastructure (Docker, JWT, callbacks) adds deployment complexity
- **Why Needed**: Current HTML viewer provides poor formatting fidelity (fonts, colors, layouts stripped); users cannot trust they're seeing actual contracts
- **Simpler Alternative Rejected**: PDF.js canvas rendering considered but rejected because:
  - Still requires custom Track Changes overlay (complex)
  - Text not selectable without additional text layer
  - No native Word export compatibility
  - No collaborative editing support
  - Would still require mammoth.js for Word conversion

## Project Structure

### Documentation (this feature)

```text
specs/009-onlyoffice-viewer/
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output (/speckit.plan command)
├── data-model.md        # Phase 1 output (/speckit.plan command)
├── quickstart.md        # Phase 1 output (/speckit.plan command)
├── contracts/           # Phase 1 output (/speckit.plan command)
│   ├── api-download.md          # GET /api/contracts/[id]/download
│   ├── api-callback.md          # POST /api/onlyoffice/callback/[contractId]
│   └── api-session-token.md     # POST /api/onlyoffice/token
└── tasks.md             # Phase 2 output (/speckit.tasks command - NOT created by /speckit.plan)
```

### Source Code (repository root)

```text
prisma/
├── schema.prisma                      # ADD: OnlyOfficeSession model
└── migrations/                        # NEW: migration for OnlyOfficeSession table

src/
├── app/
│   ├── (app)/contracts/
│   │   └── [id]/
│   │       ├── page.tsx               # MODIFY: Replace HTML viewer toggle with ONLYOFFICE viewer
│   │       └── _components/
│   │           ├── onlyoffice-viewer/ # NEW: ONLYOFFICE integration components
│   │           │   ├── onlyoffice-document-viewer.tsx  # Main viewer component
│   │           │   ├── finding-comments.tsx            # Finding injection logic
│   │           │   ├── tracked-changes.tsx             # Track Changes toggle & injection
│   │           │   └── session-manager.tsx             # Token refresh & session lifecycle
│   │           ├── document-viewer/   # DEPRECATED: Remove after migration
│   │           │   ├── document-viewer.tsx             # Delete
│   │           │   ├── html-renderer.tsx               # Delete
│   │           │   └── highlight-layer.tsx             # Delete
│   │           └── [existing components remain]
│   └── api/
│       ├── contracts/
│       │   └── [id]/
│       │       ├── download/
│       │       │   └── route.ts       # NEW: Serve contract files to ONLYOFFICE
│       │       └── document/
│       │           └── route.ts       # DEPRECATED: Remove (Feature 008 HTML endpoint)
│       └── onlyoffice/
│           ├── callback/
│           │   └── [contractId]/
│           │       └── route.ts       # NEW: Handle ONLYOFFICE save callbacks
│           └── token/
│               └── route.ts           # NEW: Generate JWT tokens for sessions
├── lib/
│   ├── onlyoffice/                    # NEW: ONLYOFFICE utilities
│   │   ├── config.ts                  # ONLYOFFICE server URL, JWT secret
│   │   ├── jwt.ts                     # JWT token generation/validation
│   │   ├── comment-injector.ts        # Inject findings as comments
│   │   ├── track-changes-injector.ts  # Inject decisions as tracked changes
│   │   └── session-manager.ts         # Session lifecycle management
│   ├── document-converter.ts          # DEPRECATED: Remove (mammoth.js, pdf.js)
│   ├── position-mapper.ts             # DEPRECATED: Remove (puppeteer positioning)
│   └── html-sanitizer.ts              # DEPRECATED: Remove (DOMPurify)
└── types/
    ├── onlyoffice.ts                  # NEW: ONLYOFFICE types (session, config, events)
    └── document-viewer.ts             # DEPRECATED: Remove (HTML viewer types)

docker/                                # NEW: Docker configuration
└── onlyoffice/
    ├── docker-compose.yml             # ONLYOFFICE Document Server deployment
    └── .env.example                   # Environment variables (JWT secret, port)
```

**Structure Decision**: Next.js single project structure (existing pattern). ONLYOFFICE Document Server deployed as separate Docker container but accessed via API from Next.js app. New `src/lib/onlyoffice/` directory contains all ONLYOFFICE-specific logic. Deprecated Feature 008 code will be removed after migration complete (marked for deletion in source tree above).

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| External service dependency (ONLYOFFICE Document Server) | Current HTML conversion strips formatting; users cannot trust document fidelity. Microsoft Word compatibility required for export. | PDF.js canvas rendering: Still requires custom Track Changes overlay, no Word export compatibility, not selectable text, no collaboration support. Custom Word rendering library: Does not exist; would require building full OOXML parser (months of work). |
| JWT authentication system | ONLYOFFICE Document Server requires authentication to prevent unauthorized document access and ensure user attribution for changes. | API key per document: Does not support user attribution or time-limited access. Session cookies: Not supported by ONLYOFFICE callback architecture. |
| Docker deployment | ONLYOFFICE Document Server is a complex document editing engine that requires dedicated runtime environment with specific dependencies (Node.js, fonts, LibreOffice core). | Node.js library: Does not exist as pure JavaScript; ONLYOFFICE uses LibreOffice core (C++) which requires separate process. Cloud SaaS: Adds cost ($5-15/user/month) and data privacy concerns; self-hosted preferred for legal documents. |

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| ONLYOFFICE Document Server deployment complexity | Medium | High | Provide docker-compose.yml with pre-configured settings; include detailed quickstart guide; fallback to direct document download if ONLYOFFICE unavailable |
| Session token management bugs (expiration, refresh) | Medium | Medium | Implement comprehensive token refresh logic with 30-minute advance refresh; display clear "Session expired" UI with reload button |
| Finding comment positioning inaccuracies | Low | Medium | Use ONLYOFFICE's text search API to find exact positions; fallback to clause-level positioning; include "Position approximate" indicator |
| Performance degradation with large documents (200+ pages) | Low | Medium | ONLYOFFICE handles large documents internally; monitor performance during testing; add loading indicators for slow operations |
| ONLYOFFICE API breaking changes | Low | High | Pin to specific ONLYOFFICE Document Server version (7.5.x); test thoroughly before upgrades; maintain Feature 008 code temporarily as rollback option |
| Collaborative editing conflicts | Low | Low | ONLYOFFICE handles conflicts internally (P3 feature, optional); provide clear UI for conflict resolution prompts |

## Phase 0: Research

**Output**: `research.md` — Technology selection and integration patterns

### Research Tasks

1. **R1 - ONLYOFFICE Document Server Deployment**:
   - Decision: Docker deployment with docker-compose
   - Alternatives: Kubernetes, VM, cloud SaaS
   - Rationale: Docker simplest for single-server deployment; provides isolation; easy local development

2. **R2 - JWT Authentication Pattern**:
   - Decision: jsonwebtoken library with HS256 algorithm
   - Alternatives: RSA keys, API keys, OAuth
   - Rationale: HS256 sufficient for server-to-server auth; simpler than RSA; ONLYOFFICE supports out-of-box

3. **R3 - Finding Comment Injection Strategy**:
   - Decision: Use ONLYOFFICE Document Editor API `AddComment` method with text search
   - Alternatives: Pre-process Word document, manual annotation
   - Rationale: Dynamic injection at load time; no document modification; supports finding updates

4. **R4 - Track Changes Injection Strategy**:
   - Decision: Compute changes from decision event log, inject via ONLYOFFICE API at load time
   - Alternatives: Pre-generate Word file with changes, manual entry
   - Rationale: Dynamic generation ensures changes reflect latest decisions; supports undo/revert

5. **R5 - Session Refresh Mechanism**:
   - Decision: Client-side timer with 30-minute advance refresh via API call
   - Alternatives: WebSocket heartbeat, server-side refresh
   - Rationale: Client controls session lifecycle; simple implementation; fails gracefully if offline

6. **R6 - Document Download Endpoint Security**:
   - Decision: Token-based authentication separate from user session
   - Alternatives: User session cookies, API keys
   - Rationale: ONLYOFFICE server cannot send browser cookies; token allows server-to-server auth

## Phase 1: Design & Contracts

**Prerequisites**: `research.md` complete

### Data Model

**Output**: `data-model.md`

Key entities:
- **OnlyOfficeSession**: Tracks active document viewing sessions with JWT tokens
- **Contract**: Existing entity; no changes to schema
- **Document**: Existing entity; no changes to schema
- **AnalysisFinding**: Existing entity (Feature 005); used for comment injection
- **ClauseDecision**: Existing entity (Feature 006); used for tracked changes generation

### API Contracts

**Output**: `contracts/` directory with OpenAPI/REST specifications

1. **api-download.md**: `GET /api/contracts/[id]/download`
   - Serves contract file to ONLYOFFICE Document Server
   - Requires token-based authentication (not user session)
   - Returns file stream with appropriate Content-Type

2. **api-callback.md**: `POST /api/onlyoffice/callback/[contractId]`
   - Receives save events from ONLYOFFICE
   - Handles status codes (editing, saving, errors)
   - Downloads and persists updated document versions

3. **api-session-token.md**: `POST /api/onlyoffice/token`
   - Generates JWT tokens for ONLYOFFICE sessions
   - Validates user permissions before token issuance
   - Sets 4-hour expiration with refresh support

### Quickstart

**Output**: `quickstart.md`

Step-by-step guide for:
1. Deploying ONLYOFFICE Document Server with Docker
2. Configuring JWT secrets and environment variables
3. Integrating ONLYOFFICE viewer component in contract page
4. Testing basic document viewing
5. Testing finding comment injection
6. Testing Track Changes mode

### Agent Context Update

After Phase 1 artifacts are generated, run:
```bash
.specify/scripts/powershell/update-agent-context.ps1 -AgentType claude
```

This updates the agent-specific context file with new ONLYOFFICE dependencies and architecture decisions.

## Implementation Phases (Tasks)

*Note: Detailed tasks will be generated by `/speckit.tasks` command (Phase 2). This section provides high-level phase breakdown.*

### Phase 0: Infrastructure Setup (4 tasks)
- T001: Create Docker configuration for ONLYOFFICE Document Server
- T002: Configure environment variables and JWT secrets
- T003: Deploy ONLYOFFICE locally and verify connectivity
- T004: Create Prisma migration for OnlyOfficeSession model

### Phase 1: Basic Document Viewing (6 tasks)
- T005: Install @onlyoffice/document-editor-react
- T006: Create ONLYOFFICE configuration utilities (config.ts, jwt.ts)
- T007: Implement document download API endpoint
- T008: Implement callback API endpoint
- T009: Create OnlyOfficeDocumentViewer React component
- T010: Integrate viewer in contract detail page with toggle

### Phase 2: Finding Comment Injection (5 tasks)
- T011: Implement comment injection utility (comment-injector.ts)
- T012: Map finding risk levels to comment styles
- T013: Implement finding-to-position mapping logic
- T014: Test comment positioning accuracy
- T015: Implement sidebar finding click → document scroll

### Phase 3: Track Changes Integration (6 tasks)
- T016: Implement decision event log reader
- T017: Implement tracked changes injection utility (track-changes-injector.ts)
- T018: Create Track Changes toggle UI component
- T019: Map decision types to change types (delete/insert/replace)
- T020: Test Track Changes display with various decision scenarios
- T021: Implement change attribution with user names and timestamps

### Phase 4: Session Management (5 tasks)
- T022: Implement session creation and token generation
- T023: Implement automatic token refresh (30-minute advance)
- T024: Handle session expiration gracefully
- T025: Implement error handling for ONLYOFFICE connection failures
- T026: Add fallback to direct document download

### Phase 5: Export & Migration (6 tasks)
- T027: Implement export button with ONLYOFFICE native download
- T028: Test exported Word documents in Microsoft Word
- T029: Verify Track Changes format compatibility
- T030: Create migration guide for existing contracts
- T031: Deprecate Feature 008 HTML viewer code
- T032: Remove document-converter.ts, position-mapper.ts, html-sanitizer.ts

### Phase 6: Polish & Documentation (4 tasks)
- T033: Add loading indicators for document load and operations
- T034: Implement error messages for common failure scenarios
- T035: Write deployment documentation (ONLYOFFICE setup guide)
- T036: Update user documentation with new viewer features

**Total Estimated Tasks**: 32 tasks across 6 phases

## Rollback Plan

If ONLYOFFICE integration encounters critical issues during rollout:

1. **Immediate**: Re-enable Feature 008 HTML viewer by reverting viewer toggle default
2. **Investigation**: Keep ONLYOFFICE accessible via feature flag for testing
3. **Fix**: Address issues in isolated development environment
4. **Re-rollout**: Gradual re-enable once issues resolved (10% → 50% → 100% users)
5. **Fallback**: If issues persist beyond 2 weeks, maintain HTML viewer as primary with ONLYOFFICE as opt-in beta

**Rollback Trigger Conditions**:
- ONLYOFFICE Document Server uptime < 95%
- Document load failures > 10%
- User complaints about formatting issues > 25%
- Performance degradation (load time > 10 seconds) for > 50% of documents

## Dependencies & Prerequisites

### External Dependencies
- ONLYOFFICE Document Server 7.5.x (open-source Community Edition)
- Docker Engine 20.x+ (for ONLYOFFICE deployment)
- @onlyoffice/document-editor-react npm package
- jsonwebtoken npm package

### Feature Dependencies
- Feature 005 (Deviation-Focused Analysis): Provides finding data for comment injection
- Feature 006 (Clause Decision Actions): Provides decision event log for tracked changes
- Feature 008 (Document Viewer & Redline): Will be deprecated and removed after this feature completes

### Infrastructure Prerequisites
- Server with Docker support (4GB RAM minimum for ONLYOFFICE)
- Port 80 or 443 available for ONLYOFFICE Document Server
- Persistent storage for ONLYOFFICE cache and logs
- SSL certificate (recommended for production)

## Success Metrics

*How we'll measure if this implementation achieves the specification's success criteria:*

- **SC-001 (100% formatting fidelity)**: Visual inspection of contracts with complex formatting; comparison screenshots before/after
- **SC-002 (Comments load < 3s)**: Performance testing with contracts containing 20-50 findings
- **SC-003 (Finding click navigation < 500ms)**: Browser performance profiling
- **SC-004 (Track Changes load < 2s)**: Performance testing with contracts having 10-30 decisions
- **SC-005 (Word export compatibility)**: Open exported files in Microsoft Word; verify all Track Changes functional
- **SC-006 (Handles 200 pages, 50MB)**: Load testing with large contract samples
- **SC-007 (First page < 3s)**: Performance testing with 20-50 page contracts
- **SC-008 (Collaboration sync < 5s)**: Multi-browser testing (P3 feature)
- **SC-009 (Token refresh seamless)**: Long-duration session testing (4+ hours)
- **SC-010 (Fallback 100% success)**: Disconnect ONLYOFFICE; verify download button works
- **SC-011 (90% user satisfaction)**: User feedback survey after 2-week rollout
- **SC-012 (25% review time reduction)**: Compare average review durations before/after deployment

## Post-Implementation

### Monitoring
- ONLYOFFICE Document Server uptime and health checks
- Session token generation/refresh success rates
- Document load times (p50, p95, p99)
- Comment injection accuracy (% positioned correctly)
- Export success rates
- User error reports (connection failures, session expiration)

### Maintenance
- Regular ONLYOFFICE Document Server updates (quarterly review)
- JWT secret rotation (every 6 months)
- Docker container cleanup (remove old images)
- Session cleanup (delete expired sessions older than 7 days)
- Monitor storage usage for ONLYOFFICE cache

### Future Enhancements (Out of Scope for MVP)
- Real-time collaborative editing with presence indicators (P3 feature)
- Version comparison/diffing between contract versions
- Inline comment threading for team discussions
- Mobile-responsive ONLYOFFICE viewer
- Integration with external document management systems (SharePoint, Google Drive)
