# Feature Specification: ONLYOFFICE Document Viewer Integration

**Feature Branch**: `009-onlyoffice-viewer`  
**Created**: 2026-02-18  
**Status**: Draft  
**Input**: User description: "I want to replace current HTML contract viewer with ONLYOFFICE"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - View Contract with Perfect Formatting Fidelity (Priority: P1)

A legal reviewer opens a contract that has been analyzed. Instead of seeing a plain HTML rendering that strips formatting (current mammoth.js/pdf.js implementation), they see the contract displayed in an embedded ONLYOFFICE viewer that preserves all original formatting: fonts, colors, tables, images, headers, footers, page layouts, and complex structures. The document looks exactly as it would in Microsoft Word, providing a professional and familiar reading experience. The reviewer can scroll through pages, zoom in/out, and read the contract in its native format.

**Why this priority**: This is the foundational capability that replaces the current low-fidelity HTML viewer with high-fidelity native document rendering. It solves the core problem of poor formatting preservation and is a prerequisite for all other ONLYOFFICE features. Without this, reviewers cannot trust that they're seeing the actual contract as intended.

**Independent Test**: Can be fully tested by uploading a Word contract with complex formatting (tables, images, custom fonts, headers/footers), running analysis, opening the contract detail page, and verifying that: (1) ONLYOFFICE viewer loads, (2) all formatting is preserved perfectly, (3) document is scrollable and zoomable, and (4) pages render correctly. Delivers value by providing accurate document visualization.

**Acceptance Scenarios**:

1. **Given** a contract has been uploaded and analyzed, **When** the user opens the contract detail page, **Then** the document is displayed in an embedded ONLYOFFICE viewer with perfect formatting fidelity
2. **Given** the document contains complex formatting (tables, images, custom fonts, colors, borders), **When** the document is rendered in ONLYOFFICE, **Then** all formatting elements are preserved exactly as in the original document
3. **Given** the document is displayed in ONLYOFFICE, **When** the user scrolls through pages, **Then** all pages render smoothly with correct page breaks and layouts
4. **Given** the document is displayed, **When** the user uses zoom controls (zoom in/out, fit to width, fit to page), **Then** the document scales appropriately while maintaining formatting
5. **Given** a multi-page contract is loaded, **When** the user navigates between pages, **Then** page navigation works smoothly with page thumbnails or page number input
6. **Given** the ONLYOFFICE viewer is loading, **When** the document is being fetched, **Then** a loading indicator is displayed with appropriate messaging

---

### User Story 2 - Display Findings as Document Comments (Priority: P1)

After AI analysis completes and identifies contract findings, a legal reviewer wants to see these findings directly in the document context. The system automatically injects all findings as ONLYOFFICE comments attached to the relevant text positions in the document. Each comment shows the finding description, risk level (with color coding: red for high, yellow for medium, green for low), and the matched rule. The reviewer can click on comment markers in the document to expand and read finding details, or click on a finding in the sidebar to jump to that comment in the document.

**Why this priority**: Findings visualization is essential for the contract review workflow. Without seeing where findings occur in the actual document, the ONLYOFFICE integration would not deliver the core value of contextual analysis. This must work immediately in the MVP.

**Independent Test**: Can be fully tested by analyzing a contract that generates findings, opening the document viewer, and verifying that: (1) findings appear as comments in ONLYOFFICE, (2) comments are positioned at correct text locations, (3) clicking a comment shows finding details, (4) clicking a sidebar finding jumps to the document comment, and (5) risk colors are applied correctly. Delivers value by connecting AI findings to document positions.

**Acceptance Scenarios**:

1. **Given** a contract has been analyzed and findings have been generated, **When** the document is loaded in ONLYOFFICE, **Then** all findings are injected as comments positioned at the relevant text locations
2. **Given** findings are displayed as comments, **When** a comment represents a high-risk finding, **Then** the comment marker is styled with red color or icon indicating high risk
3. **Given** findings are displayed as comments, **When** a comment represents a medium-risk finding, **Then** the comment marker is styled with yellow/orange color indicating medium risk
4. **Given** findings are displayed as comments, **When** a comment represents a low-risk finding, **Then** the comment marker is styled with green color indicating low risk
5. **Given** a finding comment is visible in the document, **When** the user clicks on the comment marker, **Then** the comment expands to show the full finding description, risk level, matched rule, and suggested action
6. **Given** the user is viewing the findings sidebar, **When** they click on a specific finding, **Then** the document scrolls to that finding's comment and highlights it
7. **Given** a single text span has multiple findings, **When** comments are injected, **Then** multiple comments are attached to that span with indicators showing the count
8. **Given** the AI analysis could not determine exact text position for a finding, **When** the comment is injected, **Then** it is positioned at the clause level with a note indicating "Exact position unavailable"

---

### User Story 3 - Enable Track Changes for Decision Review (Priority: P2)

A legal reviewer has made decisions on contract findings (accepting deviations, applying fallback text, or manually editing clauses). They want to see how these decisions will modify the contract before finalizing. The system enables ONLYOFFICE's native Track Changes mode and injects all decision-based modifications as tracked changes: deletions appear with strikethrough (red), insertions appear with underline (blue/green), and each change is attributed to the user who made the decision. The reviewer can toggle Track Changes on/off to compare the original vs. modified document, and can accept/reject individual changes using ONLYOFFICE's standard UI.

**Why this priority**: This is P2 because it depends on the foundational viewing (P1) but is critical for the review workflow. Reviewers need to preview the impact of their decisions before finalizing and exporting. This leverages ONLYOFFICE's built-in Track Changes instead of custom overlays, providing a familiar Microsoft Word experience.

**Independent Test**: Can be fully tested by making decisions on findings (accept deviation, apply fallback, manual edit), enabling Track Changes mode, and verifying that: (1) Track Changes toggle appears in the UI, (2) modifications appear as tracked changes with correct formatting, (3) changes are attributed to the decision maker, (4) accept/reject buttons work, and (5) toggling off Track Changes shows the clean final document. Delivers value by providing change preview and approval workflow.

**Acceptance Scenarios**:

1. **Given** decisions have been made on one or more findings, **When** the user toggles "Show Track Changes" to ON, **Then** all decision-based modifications are displayed as ONLYOFFICE tracked changes (strikethrough for deletions, underline for insertions)
2. **Given** Track Changes are displayed, **When** the user hovers over a tracked change, **Then** a tooltip shows the change type (accept deviation, apply fallback, manual edit), the user who made the decision, and the timestamp
3. **Given** Track Changes are displayed, **When** the user right-clicks on a tracked change, **Then** ONLYOFFICE's context menu appears with options to "Accept Change" or "Reject Change"
4. **Given** Track Changes are displayed, **When** the user clicks "Accept Change," **Then** the change is applied permanently and the tracking markup is removed
5. **Given** Track Changes are displayed, **When** the user clicks "Reject Change," **Then** the change is reverted to the original text and the tracking markup is removed
6. **Given** multiple users have made decisions, **When** Track Changes are displayed, **Then** each change is attributed to the correct user with distinct color coding per user
7. **Given** the user toggles "Show Track Changes" to OFF, **When** viewing the document, **Then** only the final modified text is shown without any tracking markup (clean view)
8. **Given** some findings were "accepted deviations" (no text change), **When** Track Changes are displayed, **Then** those findings do not generate tracked changes (only fallback/edit decisions generate changes)

---

### User Story 4 - Export Contracts Directly from ONLYOFFICE (Priority: P2)

A legal reviewer has completed their review and wants to export the contract for negotiation with the counterparty. Instead of relying on custom export generation, they click "Export Document" and the system downloads the current document state directly from ONLYOFFICE with all tracked changes preserved in native Microsoft Word format (.docx). The exported document can be opened in Microsoft Word, LibreOffice, or Google Docs with full Track Changes support, allowing the counterparty to see all modifications, accept/reject changes, and add their own comments.

**Why this priority**: This is P2 because export is essential for completing the review workflow, but depends on having the document in ONLYOFFICE first (P1). By using ONLYOFFICE's export instead of custom generation (puppeteer/docx library), we get native Word compatibility and eliminate complex export code.

**Independent Test**: Can be fully tested by making decisions on findings, enabling Track Changes, clicking "Export Document," downloading the .docx file, and verifying that: (1) file downloads successfully, (2) file opens in Microsoft Word, (3) all tracked changes are present and properly formatted, (4) changes are attributed to correct users, and (5) metadata (contract title, export date) is included. Delivers value by enabling seamless negotiation workflow.

**Acceptance Scenarios**:

1. **Given** a contract is loaded in ONLYOFFICE with tracked changes, **When** the user clicks "Export Document," **Then** a Word document (.docx) is downloaded with all tracked changes preserved in Microsoft Word Track Changes format
2. **Given** an exported document is downloaded, **When** the user opens it in Microsoft Word, **Then** all tracked changes are visible and functional with Word's native Review tab controls
3. **Given** an exported document is downloaded, **When** the user inspects document properties, **Then** metadata includes contract title, counterparty name, export date, and reviewing organization
4. **Given** multiple users made decisions, **When** the document is exported, **Then** each tracked change shows the correct user attribution and timestamp
5. **Given** the contract has no tracked changes (no decisions made or all accepted), **When** the document is exported, **Then** a clean document without any tracking markup is downloaded
6. **Given** the user wants to export without tracked changes, **When** they select "Export Clean Version" option, **Then** a document with all changes applied (no markup) is downloaded
7. **Given** large documents (100+ pages), **When** export is requested, **Then** the system shows a progress indicator and completes export within 30 seconds

---

### User Story 5 - Collaborative Review Sessions (Priority: P3)

Multiple legal reviewers from the same organization want to review a contract simultaneously. When one reviewer makes a decision or adds a comment, other reviewers see the update in real-time without refreshing the page. ONLYOFFICE's collaborative editing features enable multiple cursors, live updates, and comment threads. Reviewers can see who else is currently viewing the document and coordinate their review efforts through document-level comments.

**Why this priority**: This is P3 because it's an advanced collaboration feature that enhances team productivity but is not essential for the core single-user review workflow. It leverages ONLYOFFICE's built-in collaboration capabilities but requires additional backend infrastructure (WebSocket connections, session management).

**Independent Test**: Can be fully tested by opening the same contract in two different browser sessions with different users, making a decision in one session, and verifying that: (1) the other session sees the update within 5 seconds, (2) user presence indicators show who is viewing, (3) comments sync across sessions, and (4) cursor positions are visible. Delivers value by enabling team-based contract review.

**Acceptance Scenarios**:

1. **Given** multiple users are viewing the same contract, **When** one user makes a decision that creates a tracked change, **Then** all other users see the tracked change appear in real-time within 5 seconds
2. **Given** multiple users are viewing the same contract, **When** one user adds a comment, **Then** all other users see the new comment appear without refreshing
3. **Given** multiple users are viewing the same contract, **When** a user's cursor is positioned in the document, **Then** other users see a labeled cursor indicator showing that user's name and cursor position
4. **Given** multiple users are viewing the same contract, **When** one user scrolls or zooms, **Then** other users' views are not affected (independent view control)
5. **Given** multiple users are viewing the same contract, **When** the document loads, **Then** a presence indicator shows the names/avatars of all currently viewing users
6. **Given** a user leaves the review session, **When** they close the browser or navigate away, **Then** their presence indicator is removed within 10 seconds
7. **Given** two users simultaneously edit the same text, **When** a conflict occurs, **Then** ONLYOFFICE's conflict resolution UI appears prompting users to choose a version

---

### Edge Cases

- What happens when ONLYOFFICE Document Server is unavailable or unreachable?
  - System displays an error message indicating the document viewer is temporarily unavailable and provides a link to download the original contract file directly

- How does the system handle contracts uploaded before ONLYOFFICE integration (legacy contracts with HTML conversion)?
  - System detects legacy contracts and offers a "Migrate to ONLYOFFICE" button that converts the stored HTML back to the original Word/PDF format and loads it in ONLYOFFICE

- What happens when a finding's text position cannot be mapped to a specific location in the ONLYOFFICE document?
  - Finding comment is positioned at the clause-level (first paragraph of the clause) with a note "Exact position unavailable - positioned at clause start"

- How does the system handle very large contracts (200+ pages, 50+ MB files)?
  - ONLYOFFICE viewer loads the document progressively, rendering visible pages first, and shows a loading indicator for large files with estimated load time

- What happens when a user uploads a PDF contract instead of Word?
  - System first checks if ONLYOFFICE can render PDFs natively; if not, displays a message asking the user to provide the source Word document for full editing capabilities, while still allowing read-only PDF viewing

- How does the system handle unsupported document formats (e.g., .pages, .rtf, older .doc)?
  - System displays an error during upload stating supported formats are .docx and .pdf, and provides guidance on converting to supported formats

- What happens when tracked changes exceed ONLYOFFICE's rendering limits (thousands of modifications)?
  - System warns user that the document has extensive changes and offers to export a summary report instead of displaying all tracked changes inline

- How does the system handle ONLYOFFICE authentication and authorization?
  - System generates time-limited JWT tokens for each document viewing session, preventing unauthorized access to ONLYOFFICE and ensuring only users with contract permissions can view documents

- What happens when a user's ONLYOFFICE session expires while they're viewing a document?
  - System detects session expiration and displays a "Session expired - Click to reload" message, preserving any draft comments but requiring re-authentication

- How does the system handle network interruptions during collaborative sessions?
  - ONLYOFFICE buffers changes locally and automatically reconnects when network is restored, syncing buffered changes once connection is re-established

- What happens when a user wants to compare two versions of a contract?
  - This is out of scope for initial ONLYOFFICE integration; user must export both versions and use Word's compare feature externally

---

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST deploy ONLYOFFICE Document Server as a separate service accessible from the Next.js application
- **FR-002**: System MUST embed ONLYOFFICE Document Editor component in the contract detail page replacing the current HTML viewer
- **FR-003**: System MUST support viewing Word documents (.docx) in ONLYOFFICE with full formatting fidelity
- **FR-004**: System MUST support viewing PDF documents in ONLYOFFICE (read-only mode if editing not supported)
- **FR-005**: System MUST generate secure time-limited JWT tokens for authenticating document viewing sessions with ONLYOFFICE
- **FR-006**: System MUST create an API endpoint (`/api/contracts/[id]/download`) that serves contract files to ONLYOFFICE Document Server
- **FR-007**: System MUST create an API callback endpoint (`/api/onlyoffice/callback/[contractId]`) that receives document save events from ONLYOFFICE
- **FR-008**: System MUST inject AI-generated findings as ONLYOFFICE comments positioned at relevant text locations
- **FR-009**: System MUST apply risk-level color coding to finding comments (RED for high risk, YELLOW for medium, GREEN for low)
- **FR-010**: System MUST support clicking on sidebar findings to jump to corresponding document comments in ONLYOFFICE
- **FR-011**: System MUST enable ONLYOFFICE Track Changes mode to display decision-based modifications
- **FR-012**: System MUST inject decision modifications (fallback text, manual edits) as tracked changes in ONLYOFFICE
- **FR-013**: System MUST attribute each tracked change to the user who made the decision with timestamp
- **FR-014**: System MUST provide a toggle to show/hide Track Changes in the document viewer
- **FR-015**: System MUST support exporting documents directly from ONLYOFFICE with tracked changes preserved
- **FR-016**: System MUST include contract metadata in exported documents (title, counterparty, export date, organization)
- **FR-017**: System MUST handle ONLYOFFICE document save callbacks and persist updated document versions to storage
- **FR-018**: System MUST display loading indicators while ONLYOFFICE is initializing or loading large documents
- **FR-019**: System MUST display error messages when ONLYOFFICE Document Server is unreachable with fallback to direct download
- **FR-020**: System MUST validate user permissions before generating ONLYOFFICE access tokens (only authorized users can view contracts)
- **FR-021**: System MUST configure ONLYOFFICE viewer mode (edit vs. view-only) based on user permissions and contract status
- **FR-022**: System MUST remove the current HTML conversion logic (mammoth.js, pdf.js) after ONLYOFFICE integration is complete
- **FR-023**: System MUST migrate existing contracts from HTML storage to original document format for ONLYOFFICE viewing
- **FR-024**: System MUST support zoom controls in ONLYOFFICE (zoom in, zoom out, fit to width, fit to page)
- **FR-025**: System MUST support page navigation in ONLYOFFICE (next/previous page, page thumbnails, page number input)
- **FR-026**: System MUST handle finding comments that span multiple lines or paragraphs by positioning at the start of the span
- **FR-027**: System MUST limit ONLYOFFICE session token validity to 4 hours for active review sessions
- **FR-028**: System MUST refresh ONLYOFFICE session tokens automatically before expiration during active sessions
- **FR-029**: System MUST support collaborative editing when multiple users view the same contract simultaneously (P3 feature)
- **FR-030**: System MUST display user presence indicators showing who is currently viewing the contract (P3 feature)
- **FR-031**: System MUST sync finding comments and tracked changes in real-time across collaborative sessions (P3 feature)
- **FR-032**: System MUST handle ONLYOFFICE conflict resolution when multiple users edit the same text simultaneously (P3 feature)

### Key Entities

- **ONLYOFFICE Document Session**: Represents an active viewing/editing session with a unique document key, user token, expiration time, and access mode (view/edit)
- **Document Comment**: Represents a finding injected as an ONLYOFFICE comment with finding ID, text position, risk level, description, and resolved status
- **Tracked Change**: Represents a decision-based modification injected as ONLYOFFICE tracked change with change type (delete/insert), user attribution, timestamp, and text content

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Reviewers can view contracts with 100% formatting fidelity matching the original document appearance (fonts, colors, tables, images, layouts preserved)
- **SC-002**: Finding comments appear in the document within 3 seconds of the document loading
- **SC-003**: Clicking a finding in the sidebar jumps to the corresponding document comment within 500ms
- **SC-004**: Track Changes mode displays all decision modifications within 2 seconds of enabling the toggle
- **SC-005**: Exported Word documents open successfully in Microsoft Word with all tracked changes functional and properly attributed
- **SC-006**: ONLYOFFICE Document Server handles contracts up to 200 pages and 50 MB file size without performance degradation
- **SC-007**: Document viewer loads the first page within 3 seconds for typical contracts (20-50 pages)
- **SC-008**: Multiple users viewing the same contract see updates from other users within 5 seconds in collaborative mode
- **SC-009**: User session tokens are refreshed automatically without interrupting the viewing experience
- **SC-010**: System displays appropriate error messages and fallback options when ONLYOFFICE is unavailable, with 100% of users able to download the original contract file as fallback
- **SC-011**: 90% of reviewers report that the ONLYOFFICE viewer provides a better document reading experience compared to the previous HTML viewer
- **SC-012**: Time to review and make decisions on contracts decreases by 25% due to improved document fidelity and familiar Word-like interface

## Assumptions *(optional)*

- ONLYOFFICE Document Server Community Edition will be used initially (supports up to 20 concurrent users) with option to upgrade to Enterprise if needed
- ONLYOFFICE Document Server will be deployed as a Docker container on the same infrastructure as the Next.js application
- Most contracts will be provided in Word format (.docx); PDF support is secondary
- ONLYOFFICE's JavaScript API provides sufficient control for injecting comments, enabling Track Changes, and managing collaborative sessions
- Users are familiar with Microsoft Word interface and Track Changes workflow
- Network connectivity is stable for real-time collaborative features; offline mode is out of scope
- ONLYOFFICE Document Server can be configured to use JWT authentication for secure document access
- The existing decision event log (Feature 006) will provide all necessary data for generating tracked changes
- Export will use ONLYOFFICE's native save/download mechanism rather than custom PDF/Word generation libraries

## Dependencies *(optional)*

- **ONLYOFFICE Document Server**: Open-source document server that must be deployed and accessible from the Next.js app
- **Docker** (recommended): For deploying ONLYOFFICE Document Server in a containerized environment
- **Feature 006 (Clause Decision Actions)**: Provides the decision event log that drives tracked changes generation
- **Feature 005 (Deviation-Focused Analysis)**: Provides finding data with text excerpts and positions for comment injection
- **Storage service**: For serving contract files to ONLYOFFICE and persisting modified documents from save callbacks
- **JWT library**: For generating and validating secure access tokens for ONLYOFFICE sessions
- **@onlyoffice/document-editor-react**: React component library for embedding ONLYOFFICE editor

## Out of Scope *(optional)*

- Real-time collaborative editing conflict resolution UI (basic ONLYOFFICE conflict handling is sufficient)
- Version comparison/diffing between two contract versions (users can export and use Word's compare feature)
- Offline document viewing or editing (requires network connectivity to ONLYOFFICE server)
- Mobile app native integration (web viewer only)
- OCR for scanned PDFs (ONLYOFFICE limitation)
- Custom document templates or auto-generation of contracts from templates
- Integration with external document management systems (SharePoint, Google Drive)
- Fine-grained permission controls within documents (paragraph-level or clause-level edit restrictions)
- Automated decision approval workflows directly in ONLYOFFICE (decisions are made through the application UI)

## Migration Strategy *(optional)*

### From Current HTML Viewer to ONLYOFFICE

1. **Phase 1 - Infrastructure Setup**:
   - Deploy ONLYOFFICE Document Server in Docker
   - Configure JWT authentication and callback endpoints
   - Test ONLYOFFICE connectivity and basic document viewing

2. **Phase 2 - Parallel Implementation**:
   - Implement ONLYOFFICE viewer component alongside existing HTML viewer
   - Add UI toggle to switch between "Legacy View" and "ONLYOFFICE View"
   - Enable gradual rollout and A/B testing

3. **Phase 3 - Finding Comment Injection**:
   - Build comment injection logic for AI findings
   - Test comment positioning accuracy
   - Verify risk-level color coding

4. **Phase 4 - Track Changes Integration**:
   - Implement decision-to-tracked-change conversion
   - Enable Track Changes toggle
   - Test export functionality

5. **Phase 5 - Legacy Contract Migration**:
   - Create migration script to restore original contract files for legacy contracts
   - Offer manual "Migrate to ONLYOFFICE" button for users
   - Monitor migration success rate

6. **Phase 6 - Deprecation**:
   - Remove HTML viewer code (mammoth.js, pdf.js, document-converter.ts, html-renderer.tsx)
   - Clean up database schema (remove htmlContent, clausePositions, findingPositions from ContractDocument)
   - Archive Feature 008 documentation with deprecation notice

### Rollback Plan

If ONLYOFFICE integration encounters critical issues:
- Re-enable HTML viewer as default
- Keep ONLYOFFICE viewer accessible via feature flag
- Investigate and fix issues in isolated environment
- Gradual re-rollout once issues resolved
