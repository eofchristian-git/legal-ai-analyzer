# Feature Specification: Interactive Document Viewer & Redline Export

**Feature Branch**: `008-document-viewer-redline`  
**Created**: 2026-02-17  
**Status**: Draft  
**Input**: User description: "Interactive Document Viewer & Redline Export - Create an interactive document viewer that displays the full contract with highlighted findings, enables navigation, shows tracked changes, and exports redlined Word/PDF documents for negotiation workflows."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - View Full Document with Finding Highlights (Priority: P1)

A legal reviewer opens a contract after AI analysis is complete. Instead of seeing isolated clause text blocks, they see the entire contract document rendered in a scrollable viewer. As they scroll through the document, they see findings visually highlighted with color-coded overlays (red for high risk, yellow for medium risk, green for low risk). When they hover over a highlighted section, a tooltip appears showing the finding summary. Clicking on a highlight opens the findings panel for that specific clause, allowing them to review details and make decisions.

**Why this priority**: This is the foundational capability that transforms the current fragmented clause view into a cohesive document reading experience. Without this, none of the other document-based features can function. It delivers immediate value by helping reviewers understand findings in their full document context.

**Independent Test**: Can be fully tested by uploading a contract, running analysis, and verifying that: (1) the full document renders, (2) findings are highlighted with correct colors, (3) tooltips appear on hover, and (4) clicking highlights opens the findings panel. Delivers value by providing contextual document viewing.

**Acceptance Scenarios**:

1. **Given** a contract has been analyzed and has findings, **When** the user opens the contract detail page, **Then** the full document is rendered in the center panel with all text visible and scrollable
2. **Given** the document is displayed, **When** the user scrolls through the document, **Then** all finding locations are highlighted with colored overlays (RED=high risk, YELLOW=medium risk, GREEN=low risk)
3. **Given** a finding is highlighted in the document, **When** the user hovers over the highlight, **Then** a tooltip appears showing the finding summary and matched rule title
4. **Given** a finding is highlighted in the document, **When** the user clicks on the highlight, **Then** the findings panel opens/scrolls to display that specific clause's findings
5. **Given** multiple findings exist in close proximity, **When** highlights overlap, **Then** the highest risk level color is displayed with a badge indicating multiple findings

---

### User Story 2 - Navigate to Clause Positions (Priority: P1)

A legal reviewer is working through the clause list on the left side of the screen. When they click on a clause in the list, the document viewer automatically scrolls to that clause's position in the document, and the clause is visually indicated with a border or background highlight. As the reviewer manually scrolls through the document, the selected clause in the left panel updates automatically to reflect the currently visible clause (bi-directional synchronization).

**Why this priority**: Navigation is critical for usability in a document-based workflow. This enables reviewers to quickly jump to specific clauses they need to review and maintains context awareness as they read. This is a P1 because without it, the document viewer would be difficult to navigate for long contracts.

**Independent Test**: Can be fully tested by loading a contract with multiple clauses and verifying that: (1) clicking a clause in the left panel scrolls the document viewer to that position, (2) the active clause is visually highlighted in the document, and (3) manually scrolling the document updates the selected clause in the left panel. Delivers value by enabling efficient navigation.

**Acceptance Scenarios**:

1. **Given** the contract detail page is open with the clause list visible, **When** the user clicks on a clause in the left panel, **Then** the document viewer scrolls to that clause's position and highlights it with a visual indicator (e.g., yellow border or subtle background)
2. **Given** the user is viewing a clause in the document, **When** they manually scroll down to view another clause, **Then** the selected clause in the left panel automatically updates to reflect the currently visible clause
3. **Given** a clause spans multiple pages or screens, **When** the user clicks on it in the left panel, **Then** the document scrolls to the beginning of that clause
4. **Given** the user is navigating between clauses quickly, **When** they click multiple clauses in rapid succession, **Then** the document smoothly scrolls to each position without lag or jumping
5. **Given** a long contract with 50+ clauses, **When** the user scrolls through the document, **Then** the left panel auto-scrolls to keep the currently visible clause in view

---

### User Story 3 - View Tracked Changes in Document (Priority: P2)

After making several decisions on findings (accepting deviations, applying fallbacks, or manual edits), a legal reviewer wants to see what the modified contract will look like. They toggle on "Show Tracked Changes" mode. The document viewer now displays the original text with strikethrough (in red) for deletions and underline (in green/blue) for insertions, all shown inline at the correct document positions. A legend at the top shows the types of changes and which user made them. The reviewer can toggle this view on/off to compare the original vs. modified version.

**Why this priority**: This is P2 because it requires the foundation from P1 but provides critical value for reviewing the impact of decisions before finalization. Reviewers need to see a preview of their changes to ensure they're making the right modifications.

**Independent Test**: Can be fully tested by making decisions on findings (accept, fallback, edit), toggling "Show Tracked Changes," and verifying that: (1) original text shows with strikethrough, (2) replacement text shows with underline, (3) changes appear at correct positions, and (4) toggle switches between original and change views. Delivers value by providing change preview.

**Acceptance Scenarios**:

1. **Given** decisions have been made on one or more findings, **When** the user toggles "Show Tracked Changes" to ON, **Then** the document displays original text with red strikethrough for deletions and replacement text with green/blue underline for insertions
2. **Given** tracked changes are displayed, **When** the user hovers over a change, **Then** a tooltip shows the type of change (accept deviation, apply fallback, manual edit), the user who made it, and the timestamp
3. **Given** tracked changes are displayed, **When** the user clicks a "Hide Changes" toggle, **Then** the document reverts to showing only the final modified text without markup
4. **Given** multiple users have made decisions, **When** tracked changes are shown, **Then** a legend displays different colors or indicators for each user's changes
5. **Given** a clause has both accepted deviations and applied fallbacks, **When** tracked changes are shown, **Then** only the text modifications (fallbacks/edits) display tracked changes, not accepted deviations
6. **Given** changes have been undone or reverted, **When** tracked changes are shown, **Then** those undone changes do not appear in the document

---

### User Story 4 - Export Redlined Document (Priority: P2)

A legal reviewer has completed their review and made all necessary decisions. They are ready to send the modified contract to the counterparty for negotiation. They click "Export Redline" in the contract header, select the export format (Word .docx or PDF), and download the document. The exported file includes all tracked changes in standard format (red strikethrough for deletions, blue/green underline for insertions), with metadata showing the contract title, export date, and reviewer name. Changes are attributed to the users who made them.

**Why this priority**: This is P2 because it depends on the tracked changes capability but is essential for the negotiation workflow. Without redline export, the feature doesn't complete the business workflow of contract negotiation.

**Independent Test**: Can be fully tested by making decisions on findings, clicking "Export Redline," downloading the file, and verifying that: (1) file contains all tracked changes, (2) formatting is correct (strikethrough/underline), (3) metadata is included, and (4) changes are attributed to users. Delivers value by enabling the negotiation workflow.

**Acceptance Scenarios**:

1. **Given** all findings have been resolved and decisions made, **When** the user clicks "Export Redline" button, **Then** a modal opens with export format options (Word .docx or PDF)
2. **Given** the export modal is open, **When** the user selects Word .docx format and confirms, **Then** a Word document is generated and downloaded with all tracked changes in Microsoft Word's Track Changes format
3. **Given** the export modal is open, **When** the user selects PDF format and confirms, **Then** a PDF is generated and downloaded with visual indication of changes (strikethrough and underline)
4. **Given** a redlined document is exported, **When** the user opens the file, **Then** it includes metadata in a header or properties (contract title, counterparty, export date, reviewing organization)
5. **Given** multiple users have made decisions on the contract, **When** a redlined document is exported, **Then** each change is attributed to the user who made it (shown in comments or change tracking)
6. **Given** some clauses have no changes (accepted deviations only), **When** a redlined document is exported, **Then** those clauses appear in their original form without markup
7. **Given** the contract analysis has not been finalized, **When** the user attempts to export redline, **Then** a warning appears indicating changes may still be in progress, but export is still allowed

---

### User Story 5 - Finding Indicators & Navigation (Priority: P3)

A legal reviewer is working through a long contract with many findings. They want to quickly navigate between findings without scrolling manually. The document scrollbar shows small colored markers at the positions where findings are located. The reviewer uses "Next Finding" and "Previous Finding" buttons or keyboard shortcuts (Ctrl+↓ and Ctrl+↑) to jump between findings sequentially. A counter displays "Finding 2 of 7" to show progress.

**Why this priority**: This is P3 because it's a navigation enhancement that improves efficiency but isn't critical for core functionality. It delivers value for power users working with many findings but can be added after the foundational capabilities are in place.

**Independent Test**: Can be fully tested by loading a contract with multiple findings and verifying that: (1) scrollbar markers appear at finding positions, (2) next/previous buttons navigate between findings, (3) keyboard shortcuts work, and (4) counter displays correctly. Delivers value by speeding up navigation for contracts with many findings.

**Acceptance Scenarios**:

1. **Given** a contract has multiple findings, **When** the document viewer is displayed, **Then** the scrollbar shows small colored markers at the vertical positions where findings are located
2. **Given** the document is displayed, **When** the user clicks the "Next Finding" button, **Then** the viewer scrolls to the next finding in document order and highlights it
3. **Given** the document is displayed, **When** the user clicks the "Previous Finding" button, **Then** the viewer scrolls to the previous finding in document order and highlights it
4. **Given** the document is displayed, **When** the user presses Ctrl+↓ (Windows/Linux) or Cmd+↓ (Mac), **Then** the viewer navigates to the next finding
5. **Given** the document is displayed, **When** the user presses Ctrl+↑ (Windows/Linux) or Cmd+↑ (Mac), **Then** the viewer navigates to the previous finding
6. **Given** the user is navigating between findings, **When** a finding is highlighted, **Then** a counter displays "Finding X of Y" showing the current position and total count
7. **Given** the user has filtered clauses by risk level or resolution status, **When** they use finding navigation, **Then** navigation only includes findings from visible/filtered clauses
8. **Given** the user is at the last finding, **When** they click "Next Finding," **Then** the button is disabled or wraps to the first finding
9. **Given** the user is at the first finding, **When** they click "Previous Finding," **Then** the button is disabled or wraps to the last finding

---

### Edge Cases

- What happens when a finding's excerpt location cannot be precisely mapped to the full document (e.g., text was modified after extraction)?
  - System displays a warning icon on the highlight and positions it at the clause level with a note "Exact position unavailable"
  
- How does the system handle findings that span multiple pages or screen heights?
  - The highlight extends across page boundaries, and clicking any portion of it opens the findings panel
  
- What happens when the user makes manual edits that significantly change document structure or length?
  - Position mappings are recalculated based on clause anchors; highlights may shift but remain associated with correct clauses
  
- How does the system handle very large documents (200+ pages) that may impact rendering performance?
  - Document is rendered with virtualized scrolling (only visible pages are rendered); highlights load progressively as user scrolls
  
- What happens when trying to export a redlined document before any decisions are made?
  - Export is still allowed but generates a document with only the finding highlights (no tracked changes), and a warning notifies the user
  
- How does the system handle documents that have already been modified outside the system?
  - The system works from the originally uploaded document; external modifications are not recognized
  
- What happens when multiple findings affect overlapping or adjacent text?
  - Highlights merge with the highest risk color displayed; clicking shows all associated findings in the panel
  
- How does the system handle documents with complex formatting (tables, images, headers/footers)?
  - Format v2 (deviation-focused) analysis provides location metadata; complex elements are preserved in rendering; highlights overlay on top
  
- What happens when a user wants to export a document with only certain changes included?
  - Export always includes all finalized changes (all-or-nothing approach); users can manually edit the exported Word document if they need selective changes
  
- How does the system handle concurrent edits when multiple users are reviewing the same contract?
  - The existing optimistic locking system (Feature 006) applies; redline export includes all finalized changes at time of export
  
- What happens if document conversion (PDF to HTML) fails or produces poor results?
  - System falls back to displaying the original PDF with basic highlight overlays; a warning notifies the user of limited editing capabilities

## Requirements *(mandatory)*

### Functional Requirements

#### Document Rendering & Display

- **FR-001**: System MUST render the full contract document in a scrollable viewer that preserves the original layout and formatting
- **FR-002**: System MUST support rendering documents up to 200 pages without significant performance degradation (target: load within 5 seconds)
- **FR-003**: System MUST display the document with sufficient zoom/scale for readability on desktop and tablet devices
- **FR-004**: System MUST maintain document aspect ratio and page boundaries when rendering
- **FR-005**: System MUST support both PDF source documents and HTML-converted documents

#### Finding Highlights & Visualization

- **FR-006**: System MUST highlight finding locations in the document using color-coded overlays (RED for high risk, YELLOW for medium risk, GREEN for low risk)
- **FR-007**: System MUST position highlights accurately at the finding's location using the `locationPage` and `locationPosition` metadata from Feature 005
- **FR-008**: System MUST display finding highlights as semi-transparent overlays that allow the underlying text to remain readable
- **FR-009**: System MUST show a tooltip on hover over a highlight containing the finding summary and matched rule title
- **FR-010**: System MUST make highlights clickable to open the findings panel for that clause
- **FR-011**: System MUST handle overlapping highlights by displaying the highest risk color and indicating multiple findings with a badge

#### Navigation & Synchronization

- **FR-012**: System MUST scroll the document viewer to a clause's position when the clause is clicked in the left panel
- **FR-013**: System MUST visually indicate the active clause in the document with a border or background highlight
- **FR-014**: System MUST update the selected clause in the left panel when the user manually scrolls to a different clause in the document (bi-directional sync)
- **FR-015**: System MUST smooth-scroll to clause positions with animation to maintain user context
- **FR-016**: System MUST auto-scroll the left clause list to keep the currently visible clause in view
- **FR-017**: System MUST provide "Next Finding" and "Previous Finding" navigation buttons
- **FR-018**: System MUST support keyboard shortcuts (Ctrl/Cmd + ↓/↑) for finding navigation
- **FR-019**: System MUST display a finding counter showing current position and total (e.g., "Finding 2 of 7")
- **FR-020**: System MUST show markers on the document scrollbar at finding positions

#### Tracked Changes Display

- **FR-021**: System MUST provide a "Show Tracked Changes" toggle to switch between original and change-marked views
- **FR-022**: System MUST display deleted text with red strikethrough when tracked changes are enabled
- **FR-023**: System MUST display inserted/replaced text with green or blue underline when tracked changes are enabled
- **FR-024**: System MUST position tracked changes inline at the exact location in the document where the change applies
- **FR-025**: System MUST show a tooltip on hover over a change indicating the type (accept deviation, apply fallback, manual edit), user, and timestamp
- **FR-026**: System MUST display a legend showing change types and user attribution
- **FR-027**: System MUST exclude undone or reverted decisions from the tracked changes display
- **FR-028**: System MUST only show tracked changes for text modifications (fallbacks and manual edits), not for accepted deviations (which have no text changes)
- **FR-029**: System MUST support toggling tracked changes on/off without reloading the document

#### Redline Export

- **FR-030**: System MUST provide an "Export Redline" button in the contract header
- **FR-031**: System MUST support exporting redlined documents in Word (.docx) format
- **FR-032**: System MUST support exporting redlined documents in PDF format
- **FR-033**: System MUST include all tracked changes in the exported document using standard formatting (strikethrough for deletions, underline for insertions)
- **FR-034**: System MUST include metadata in exported documents (contract title, counterparty name, export date, reviewing organization)
- **FR-035**: System MUST attribute changes to the users who made them (shown in Word Track Changes or PDF comments)
- **FR-036**: System MUST generate exports for contracts with 200+ pages within 30 seconds
- **FR-037**: System MUST allow export even if the contract has not been finalized, with an appropriate warning
- **FR-038**: System MUST handle clauses with no modifications (accepted deviations only) by showing them in original form without markup

#### Data & Position Mapping

- **FR-039**: System MUST store clause position mappings (page, x, y, width, height) for accurate rendering
- **FR-040**: System MUST store finding position mappings using the existing `locationPage` and `locationPosition` fields from Feature 005
- **FR-041**: System MUST recalculate position mappings if the document structure changes due to edits
- **FR-042**: System MUST maintain position accuracy within 50 pixels for PDF rendering and 1 paragraph for HTML rendering
- **FR-043**: System MUST handle cases where exact position mapping fails by falling back to clause-level positioning

#### Performance & Scalability

- **FR-044**: System MUST render documents using virtualized scrolling to support large documents (200+ pages)
- **FR-045**: System MUST load and display the first page of the document within 3 seconds
- **FR-046**: System MUST progressively load document pages as the user scrolls
- **FR-047**: System MUST cache rendered pages to improve scrolling performance
- **FR-048**: System MUST support concurrent access by multiple users viewing the same contract document

### Key Entities

- **ContractDocument**: Represents the full document with rendering data
  - Attributes: originalPdfPath, htmlContent (optional), pageCount, clausePositions, findingPositions, createdAt, updatedAt
  - Relationships: One-to-one with Contract

- **FindingHighlight**: Represents a visual highlight for a finding in the document
  - Attributes: findingId, page, x, y, width, height, riskColor, clauseNumber
  - Relationships: Many-to-one with AnalysisFinding

- **RedlineExport**: Represents an exported redlined document
  - Attributes: contractId, format (DOCX or PDF), exportedBy, exportedAt, filePath, includesChanges, metadata (JSON)
  - Relationships: Many-to-one with Contract

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Legal reviewers can locate a specific finding in the full document context in under 5 seconds (compared to ~30 seconds with current clause-by-clause view)
- **SC-002**: Document viewer loads and displays the first page of contracts up to 200 pages within 3 seconds on standard business hardware
- **SC-003**: 90% of users report improved understanding of findings with full document context (measured via user survey)
- **SC-004**: Finding highlights are positioned within 50 pixels of the actual text location for PDF rendering and within 1 paragraph for HTML rendering
- **SC-005**: Users can navigate between findings using keyboard shortcuts or buttons with less than 500ms response time
- **SC-006**: Tracked changes display correctly shows all text modifications (fallbacks and manual edits) with proper strikethrough and underline formatting
- **SC-007**: Redlined documents export successfully for 100% of finalized contracts within 30 seconds
- **SC-008**: Exported redlined Word documents open correctly in Microsoft Word with Track Changes enabled and all modifications visible
- **SC-009**: 80% of finalized contracts result in a redline export within 24 hours of finalization
- **SC-010**: Support requests related to "where is this clause/finding" decrease by 70% after feature deployment
- **SC-011**: Time to complete contract review decreases by 30% due to improved navigation and context (measured by average time from analysis complete to finalize)
- **SC-012**: User satisfaction with contract review workflow increases to 8+/10 (measured via in-app feedback)
