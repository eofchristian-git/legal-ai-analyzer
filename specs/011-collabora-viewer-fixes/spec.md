# Feature Specification: Collabora Viewer Reliability & UX Fixes

**Feature Branch**: `011-collabora-viewer-fixes`
**Created**: 2026-02-19
**Status**: Draft
**Input**: User description: "Fix 6 issues in the Collabora Online document viewer: clause highlighting timing, fallback strikethrough rendering, undo revert correctness, clause navigation reliability, changes not synced when viewer is closed, and enforce read-only review mode."

## Clarifications

### Session 2026-02-19

- Q: When a programmatic save fails (Action_Save / WOPI PutFile), what should the system do? → A: Fail visibly — show a non-blocking error toast; retain the pending change in the queue so it can be retried on next viewer open.
- Q: Should the pending change queue survive a full page refresh, or only SPA navigation? → A: SPA navigation only — queue lives in application state and is lost on hard page refresh.
- Q: What should the reviewer see while highlights are being applied before the document is displayed? → A: A loading overlay with a status message (e.g., "Preparing document…") shown over the viewer area until the document is ready.
- Q: How should the system handle a partially-applied redline if the viewer is closed before the operation completes? → A: Re-apply from scratch on next open — detect the incomplete state, clear any partial changes, and re-execute the full redline sequence when the viewer is next mounted.
- Q: How should navigation failure be handled when clause text differs from document content? → A: ~~Implement bulletproof clause anchors — named bookmarks embedded into the document~~ **Update (V2 failed)**: `.uno:InsertBookmark` opens a dialog in Collabora Online and cannot be used programmatically. Navigation uses enhanced text-search with extended normalization (NFC, dash/quote equivalence, whitespace collapsing) and progressive fallback (full excerpt → shorter → first sentence). On complete failure, a non-blocking indicator is shown on the clause in the left panel.

---

## Background

The Collabora Online document viewer is already integrated (Feature 010). This feature addresses six distinct reliability and UX issues discovered during use. All fixes must preserve the existing working behaviour: WOPI-based file access, postMessage communication, clause decision workflows, and the event-sourcing projection model.

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Enforce Read-Only Viewer Mode (Priority: P1)

A legal reviewer opens a contract in the viewer. They should see a clean, uncluttered document surface — no toolbars, no editing panels, no menu bars. They can scroll freely and click any clause in the left panel to jump to it in the document. They cannot type into or manually modify the document.

**Why this priority**: This is a fundamental UX contract. If a user can accidentally edit the document, it undermines the integrity of the review workflow. All other viewer behaviours depend on the viewer being in a stable, predictable state.

**Independent Test**: Open any analyzed contract. Confirm: no toolbar, no menu bar, no ruler, no status bar visible. Click a clause in the left panel — document scrolls to that clause. Attempt to type in the document — no text is inserted.

**Acceptance Scenarios**:

1. **Given** a contract is open in the viewer, **When** the document finishes loading, **Then** no editing toolbars, rulers, status bars, or menu bars are visible — only the document content area.
2. **Given** the viewer is loaded, **When** the user clicks anywhere in the document and types, **Then** no text is inserted or modified.
3. **Given** a clause is selected in the left-panel clause list, **When** the user clicks it, **Then** the document viewport scrolls to that clause's location without triggering edit mode.
4. **Given** the viewer is in read-only mode, **When** programmatic actions (highlight, redline, undo) are applied, **Then** they still execute correctly despite the user-facing read-only constraint.

---

### User Story 2 - Clause Highlighting Before First Display (Priority: P1)

When a reviewer opens a contract, risk highlights (RED/YELLOW/GREEN background colors) should already be present on the first visible render of the document. The document must not flash as un-highlighted then suddenly highlight clause by clause.

**Why this priority**: The current behaviour — highlights applied after the document is already visible — looks broken and disorienting. It is a first-impression issue that undermines trust in the tool.

**Independent Test**: Open a contract that has completed analysis. Observe the document at the moment it first becomes visible. All risk-highlighted clauses should already carry their background color.

**Acceptance Scenarios**:

1. **Given** a contract with analyzed clauses, **When** the document viewer first becomes visible to the user, **Then** all clause risk highlights are already applied — no visible highlighting animation or sequential coloring occurs after display.
2. **Given** highlights have already been applied and saved, **When** the viewer is reopened, **Then** the saved highlighted version is shown immediately with no re-highlighting.
3. **Given** a contract is opened for the first time (highlights not yet applied), **When** the system prepares the document, **Then** all highlights are applied and the file saved before the viewer iframe becomes visible.

---

### User Story 3 - Fallback Acceptance Shows Redline in Document (Priority: P1)

When a reviewer accepts a fallback suggestion for a clause, the document should visually reflect: the original clause text struck through (with gray color) and the replacement fallback text inserted immediately after, formatted distinctly (green background, bold). This redline must appear in the document every time, not intermittently.

**Why this priority**: This is the primary visual output of a core decision action. Without reliable redline rendering, reviewers cannot verify that their fallback acceptance was correctly applied in the document.

**Independent Test**: Apply "Accept Fallback" to any clause with a fallback suggestion. Immediately view the clause in the document. The original text must be struck through and the fallback text must appear directly after, in the expected format.

**Acceptance Scenarios**:

1. **Given** a clause has a fallback suggestion, **When** a reviewer accepts the fallback, **Then** within a few seconds the original clause text appears struck through with gray color in the document.
2. **Given** the fallback is accepted, **When** viewing the document, **Then** the replacement fallback text appears immediately after the struck-through original, formatted with a green background and bold styling.
3. **Given** the viewer is not currently open when fallback is accepted, **When** the viewer is opened afterward, **Then** the document already shows the correct redline (strikethrough + insertion) for that clause.
4. **Given** a redline has been applied, **When** the file is saved, **Then** the redline changes persist across viewer sessions.

---

### User Story 4 - Undo Correctly Reverts Document Changes (Priority: P2)

When a reviewer undoes a fallback decision, the document must revert to its pre-fallback state: the strikethrough is removed, the inserted fallback text is deleted, and the clause's original risk-level highlight is restored. No stray characters, partial deletions, or corrupted text should result from the undo operation.

**Why this priority**: A faulty undo that corrupts document text is a data integrity issue. Reviewers rely on undo to correct mistakes, and the document content must remain trustworthy.

**Independent Test**: Accept fallback on a clause, then undo the action. Confirm the document text matches the original, the redline formatting is gone, and the risk-level highlight is restored. No characters are missing or added.

**Acceptance Scenarios**:

1. **Given** a fallback redline has been applied to a clause, **When** the reviewer undoes the action, **Then** the inserted fallback text is fully removed from the document with no partial deletions.
2. **Given** the undo is applied, **When** viewing the document, **Then** the original clause text appears exactly as it was before the fallback was accepted — no strikethrough, no extra characters.
3. **Given** the undo is applied, **When** viewing the document, **Then** the original risk-level highlight (RED/YELLOW/GREEN) is restored on the clause text.
4. **Given** multiple fallbacks and undos are performed in sequence, **When** viewing the document, **Then** each clause remains in the correct state with no text corruption.

---

### User Story 5 - Reliable Clause Navigation via Enhanced Text Search (Priority: P2)

When a reviewer clicks a clause in the left-panel list, the document viewport reliably scrolls to that clause every time — even when there are minor text differences between the database and the document. Navigation uses enhanced text-search with extended normalization (Unicode NFC, dash/quote equivalence, whitespace collapsing) and progressive fallback strategies.

**Why this priority**: Navigation is the primary interaction between the left-panel clause list and the document viewer. The previous text-search navigation was brittle when clause text had Unicode differences (en-dashes, smart quotes, etc.). Extended normalization and progressive fallback greatly improve reliability.

**Note**: Named bookmark anchors (`.uno:InsertBookmark`) were originally planned but abandoned after empirical testing revealed the command opens a dialog in Collabora Online instead of silently inserting a bookmark. See research.md §R2.

**Independent Test**: Click all clauses in the left panel. Navigation should succeed for the vast majority of clauses. For any clause where navigation fails, a visible indicator is shown in the left panel.

**Acceptance Scenarios**:

1. **Given** a contract has been prepared (highlights applied), **When** the reviewer clicks a clause in the left panel, **Then** the document scrolls to that clause's location using enhanced text search with normalization.
2. **Given** a clause whose text contains en-dashes, smart quotes, or unusual whitespace, **When** navigation is triggered, **Then** the normalization layer handles the mismatch and navigation succeeds.
3. **Given** a clause that appears multiple times in the document, **When** navigation is triggered, **Then** the system uses occurrence indexing to navigate to the correct instance.
4. **Given** navigation fails for a specific clause after all progressive fallback attempts, **When** the reviewer clicks that clause, **Then** a non-blocking indicator is shown on the clause in the left panel ("Not found in document").

---

### User Story 6 - Changes Sync to File Regardless of Viewer State (Priority: P1)

When a reviewer takes a clause decision action (accept fallback, undo, etc.) while the document viewer panel is not open or not mounted, those changes must be reliably applied to the document file. The document must not require the viewer to be open at the moment of the decision for changes to take effect.

**Why this priority**: This is a critical data integrity issue. If decisions taken outside the viewer are silently lost, reviewers may believe they've made changes that were never persisted. The document file must always reflect the current state of all clause decisions.

**Independent Test**: Close the document viewer panel (or navigate away from it). Apply a fallback acceptance from the clause list view. Reopen the document viewer. The document must show the correct redline for the accepted fallback.

**Acceptance Scenarios**:

1. **Given** the viewer panel is not mounted, **When** a reviewer accepts a fallback for a clause, **Then** the system queues or defers the document update and applies it when the viewer is next opened.
2. **Given** multiple decisions were made while the viewer was closed, **When** the viewer is opened, **Then** all pending changes are applied to the document in order before the document becomes visible.
3. **Given** a decision is made and the viewer is subsequently opened, **When** the document loads, **Then** the document reflects the decision without requiring the reviewer to manually trigger a sync.
4. **Given** a decision has been applied to the document file, **When** the viewer is closed and reopened, **Then** the applied change is still present (it was persisted to disk via WOPI).

---

### Edge Cases

- What happens when the document text has been partially modified by a previous redline, and a subsequent highlight search tries to find the original text (which is now surrounded by strikethrough formatting)?
- How does the system handle a clause whose text was extracted incorrectly (e.g., OCR error or encoding issue) such that it cannot be found in the document at all?
- What if multiple decisions are undone in rapid succession — does the document revert correctly in all cases without race conditions?
- When a programmatic save fails, the system shows a non-blocking error toast and retains the pending change in the queue for retry on next viewer open (see FR-025).
- If the viewer is closed mid-way through a multi-step redline operation, the system detects the incomplete state on next open, clears partial changes, and re-executes the full redline sequence from scratch (see FR-026).
- How does read-only mode interact with the programmatic editing commands — does blocking user input also block `.uno:` macro commands?

---

## Requirements *(mandatory)*

### Functional Requirements

**Read-Only Mode**

- **FR-001**: The document viewer MUST present the document in a read-only visual mode — no toolbars, ruler, status bar, menu bar, or sidebar panels visible to the user.
- **FR-002**: The viewer MUST prevent user-initiated text editing (typing, deleting, formatting) in the document.
- **FR-003**: Programmatic document modifications (highlight, redline, undo) MUST continue to function correctly when the viewer is in read-only mode.
- **FR-004**: Users MUST be able to scroll through the document freely regardless of read-only mode.
- **FR-005**: Clicking a clause in the left panel MUST scroll and navigate the document to that clause's location, and this MUST work in read-only mode.

**Clause Highlighting Timing**

- **FR-006**: The document MUST NOT become visible to the user until all clause risk highlights have been applied and saved.
- **FR-007**: The system MUST check whether highlights have already been applied (via a persisted flag or by detecting existing highlight formatting) before running the highlight sequence on an already-processed document.
- **FR-008**: The highlight application sequence MUST be completed and the resulting file saved before the viewer iframe is shown or made interactive.
- **FR-008a**: While highlights are being applied (before the document is shown), the viewer area MUST display a loading overlay with a status message (e.g., "Preparing document…") so the reviewer is aware the document is being prepared.

**Fallback Redline Rendering**

- **FR-009**: When a fallback is accepted, the system MUST apply strikethrough formatting and gray text color to the exact original clause text in the document.
- **FR-010**: Immediately after the strikethrough, the system MUST insert the fallback replacement text with green background color, bold formatting, and normal (non-strikethrough) style.
- **FR-011**: The inserted fallback text MUST be placed directly adjacent to the struck-through original with no extra whitespace or paragraph breaks between them.
- **FR-012**: The completed redline MUST be saved to the document file (via WOPI PutFile) so it persists across viewer sessions.

**Undo Correctness**

- **FR-013**: When a fallback decision is undone, the system MUST remove the inserted fallback text completely and precisely — no partial deletions or stray characters.
- **FR-014**: When undo is applied, the system MUST remove strikethrough and gray text color from the original clause text, restoring it to its pre-redline appearance.
- **FR-015**: When undo is applied, the system MUST restore the clause's risk-level background highlight to the original clause text.
- **FR-016**: The undo operation MUST be atomic with respect to document state — either all revert steps succeed and are saved, or the document remains in its pre-undo state.

**Clause Navigation via Enhanced Text Search**

- **FR-017**: ~~During document preparation, the system MUST embed a named bookmark anchor~~ **Removed** — `.uno:InsertBookmark` opens a dialog in Collabora Online (V2 validation failed). No bookmark embedding occurs.
- **FR-018**: The system MUST apply extended text normalization to clause search strings: Unicode NFC normalization, en-dash/em-dash to hyphen equivalence, smart quote to straight quote conversion, and whitespace variant collapsing. These normalizations MUST be applied both to the search string and comparison text.
- **FR-019**: When a reviewer clicks a clause in the left panel, the system MUST navigate using enhanced text search with progressive fallback (full excerpt → shorter excerpt → first sentence).
- **FR-020**: If all progressive text search fallbacks fail for a clause, the system MUST display a non-blocking indicator on the clause item in the left panel ("Not found in document") and call `onNavigationFailed(clauseId)`.
- **FR-020a**: For clauses with duplicate text in the document, the system MUST use occurrence indexing to navigate to the correct instance.

**Changes Sync When Viewer is Closed**

- **FR-021**: The system MUST track all pending document changes (redlines, undos) that were requested while the viewer was not mounted.
- **FR-022**: When the viewer is opened or mounted, the system MUST apply all pending changes in decision order before making the document visible to the user.
- **FR-023**: The pending-change queue MUST survive SPA navigation (moving between routes without a hard reload) — navigating away from and returning to the contract page MUST not discard queued changes. The queue does not need to survive a full page refresh.
- **FR-024**: After applying pending changes, the system MUST save the document to disk so changes persist if the viewer is closed again.
- **FR-025**: When any programmatic document save fails, the system MUST display a non-blocking error notification (toast) to the reviewer and retain the failed change in the pending queue so it can be retried when the viewer is next opened. The failure MUST NOT be silently discarded.
- **FR-026**: The system MUST detect a partially-applied redline state (operation interrupted before completion). On the next viewer open, it MUST clear any partial formatting from the affected clause and re-execute the full redline sequence from scratch before making the document visible.

### Key Entities

- **Pending Redline Queue**: An ordered list of document modification requests (clause ID, action type, payload) that have been requested but not yet applied to the document file. Scoped to a contract's SPA session (lost on hard page refresh).
- **Highlight State**: A per-document flag or fingerprint indicating whether the initial clause highlights have been applied and saved. Used to skip redundant re-preparation.
- ~~**Clause Anchor**~~: Removed — `.uno:InsertBookmark` is a dialog-based command in Collabora Online and cannot be used programmatically (V2 validation failed).
- **Clause Search String**: A normalized text excerpt derived from a clause, used as the primary mechanism for navigating to a clause's location in the document. Extended normalization (NFC, dash/quote equivalence, whitespace collapsing) and progressive fallback ensure reliable matching.

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: When a contract with analyzed clauses is opened, the document viewer displays clause risk highlights on first render with no visible highlighting animation — measured by direct observation across 5 different contracts.
- **SC-002**: Accepting a fallback decision results in correct strikethrough + insertion redline visible in the document within 10 seconds, in 100% of test cases across 10 different clause types.
- **SC-003**: Undoing a fallback decision results in the original clause text being fully restored with no character corruption, in 100% of test cases, including sequential undo of multiple decisions.
- **SC-004**: Clause navigation from the left panel successfully scrolls the viewer to the correct clause location in 95%+ of clauses using enhanced text-search with normalization and progressive fallback. For any clause where navigation fails, a visible non-blocking indicator is shown in the left panel.
- **SC-005**: Decision actions (fallback, undo) taken while the viewer is closed are correctly reflected in the document when the viewer is subsequently opened, with no manual sync step required.
- **SC-006**: The document viewer surface shows no toolbars, panels, menu bars, or other editing UI elements — verified by visual inspection immediately after document load on every viewer open.
- **SC-007**: Programmatic actions (highlight, redline, undo) complete successfully in read-only mode, confirmed by document file inspection after each action.

---

## Assumptions

- The Collabora Online server remains available and the WOPI protocol integration continues to function as established in Feature 010.
- Programmatic `.uno:` UNO commands (ExecuteSearch, CharBackColor, etc.) continue to work even when user editing is blocked — ✅ validated (V1). **Critical caveat (R6)**: Some UNO commands open dialogs instead of applying silently when dispatched with empty `{}` args or wrong argument names. All formatting commands must use correct typed args or no args (for toggle commands). See research.md §R6.
- The existing event-sourcing projection model (Feature 006) is the source of truth for clause decisions; this feature does not change the projection logic, only how document changes are rendered and synced.
- "While the viewer is closed" means the viewer iframe/component is not mounted in the DOM. Changes made when a user is on a different page or has collapsed the viewer panel fall into this category.
- Clause text normalization for navigation will handle the most common mismatches (whitespace, line breaks, Unicode normalization, dashes, smart quotes) but cannot guarantee navigation for clauses where the extracted text is fundamentally different from the document content (e.g., heavily reformatted or OCR-corrupted text). Named bookmark anchors were explored but abandoned — `.uno:InsertBookmark` opens a dialog in Collabora Online (V2 validation failed).
- `UserCanWrite: true` in WOPI is preserved (required for programmatic UNO commands to function). Read-only UX enforcement uses two separate mechanisms: the `ReadOnly: true` WOPI CheckFileInfo flag (controls the Collabora editing UI independently of write permissions, subject to empirical validation) plus a transparent interaction guard overlay in the host page that prevents the iframe from receiving keyboard focus. These two layers together provide reliable read-only enforcement without blocking the programmatic command channel.
