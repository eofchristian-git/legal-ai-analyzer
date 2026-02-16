# Feature Specification: Clause Decision Actions & Undo System

**Feature Branch**: `006-clause-decision-actions`  
**Created**: 2026-02-16  
**Status**: Draft  
**Input**: User description: "Per-button behavior for clause decisions: accept deviation, replace with fallback, edit manually, escalate, add note, with undo/revert capabilities"

## Clarifications

### Session 2026-02-16

- Q: When two reviewers simultaneously apply conflicting decisions to the same clause, how should the system determine the "winner"? → A: Last-write-wins with optimistic locking warning - Both decisions saved (append-only). Projection uses latest server timestamp. UI detects stale state on save and shows warning: "This clause was updated by [User] while you were editing. Your change was saved but may conflict." User can undo if needed.
- Q: For legal/compliance purposes, is there any maximum retention period after which decision history can be archived or purged, or must decision history be retained indefinitely? → A: Indefinite retention - Decision history retained as long as contract exists in the system, with optional archive capability after contract closure (typically 7+ years per legal requirements).
- Q: Should projection results be cached to improve performance, or computed fresh on every clause load? → A: Per-clause cache with invalidation on clause decision - Cache projection result for each clause individually. Invalidate only the affected clause's cache when a decision is made on that clause. This provides optimal performance/complexity tradeoff with clause-level cache keys.
- Q: Who can resolve an escalated clause and unlock it for further editing? → A: Assigned approver or any admin - The specific user the clause was escalated to can resolve it (make a decision), and system admins can also resolve or reassign to unblock workflow. This balances accountability with operational flexibility.
- Q: Should all users with access to a contract be able to see the complete decision history, or should some decision details be restricted based on user role? → A: Full transparency - All users who can view the contract can see the complete decision history including all decisions, internal notes, comments, escalation reasons, and timestamps. This promotes team collaboration, trust, and shared understanding of contract review progress.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Accept Deviation from Playbook (Priority: P1)

A contract reviewer encounters a clause that deviates from the playbook but is acceptable from a business risk perspective. They need to quickly accept the deviation, document the decision, and move forward with the review.

**Why this priority**: This is the most common decision action in contract review. Reviewers need to make dozens of accept/reject decisions per contract. This single capability delivers immediate value by allowing reviewers to complete their primary workflow and create an audit trail of approved deviations.

**Independent Test**: Can be fully tested by loading a contract with playbook deviations, clicking "Accept deviation" on one finding, verifying the clause status changes to ACCEPTED, and confirming the decision persists with optional comment.

**Acceptance Scenarios**:

1. **Given** a contract with a clause that deviates from playbook, **When** reviewer clicks "✅ Accept deviation" button, **Then** the clause status immediately changes to ACCEPTED (no page reload), the clause list badge updates to show ACCEPTED status, and a small tag appears in the viewer showing "Accepted deviation (playbook override)"
2. **Given** the accept deviation action has been applied, **When** the contract is reopened later, **Then** the clause still shows ACCEPTED status with the override tag visible
3. **Given** reviewer clicks accept deviation, **When** they optionally add a comment explaining why, **Then** the comment is stored with the decision and visible on hover/expand in the clause viewer

---

### User Story 2 - Replace with Playbook Fallback Language (Priority: P1)

A contract reviewer sees counterparty language that deviates unacceptably from the playbook. The playbook provides preferred fallback language. The reviewer wants to replace the counterparty text with the fallback, show tracked changes, and mark the clause as resolved.

**Why this priority**: This is the second most critical action after acceptance. It enables reviewers to actively remediate contract language issues rather than just flagging them. This single capability delivers value by creating a redlined contract draft ready for negotiation.

**Independent Test**: Can be fully tested by loading a contract with a clause deviation that has fallback language defined in the playbook, clicking "🔁 Replace with fallback", and verifying the text is replaced with tracked changes (strikethrough old, underline new) and clause status updates to RESOLVED_APPLIED_FALLBACK.

**Acceptance Scenarios**:

1. **Given** a clause deviation with available fallback language in the playbook, **When** reviewer clicks "🔁 Replace with fallback", **Then** the counterparty clause text is immediately replaced (strikethrough in red) and the fallback text is inserted (underline in green) in the viewer with tracked changes visible
2. **Given** fallback replacement has been applied, **When** the viewer displays the clause, **Then** it shows tracked changes with delete/insert annotations and the clause status badge updates to RESOLVED_APPLIED_FALLBACK
3. **Given** a playbook rule has both "fallback" and "preferred" language options, **When** reviewer replaces with fallback, **Then** the system uses the fallback variant and stores `source: 'fallback'` in the decision payload
4. **Given** the fallback replacement is applied, **When** contract is exported or viewed in redline mode, **Then** tracked changes are preserved in the export format

---

### User Story 3 - Edit Clause Text Manually (Priority: P2)

A contract reviewer needs more control than just accepting or applying fallback. They want to craft custom language that balances both parties' interests. They need an inline editor that shows tracked changes relative to the current effective text.

**Why this priority**: Manual editing is less common than accept/replace (maybe 10-20% of decisions) but critical for complex negotiations. It requires more UI complexity (inline editor, tracked changes computation) so it's P2. Still delivers standalone value for negotiators who need fine-grained control.

**Independent Test**: Can be fully tested by loading any clause, clicking "✏️ Edit manually", typing custom text in the inline editor, saving, and verifying the clause shows tracked changes and status updates to RESOLVED_MANUAL_EDIT.

**Acceptance Scenarios**:

1. **Given** a clause in the viewer, **When** reviewer clicks "✏️ Edit manually", **Then** an inline editor opens (either in the drawer or in the viewer section) with the current effective text pre-loaded and tracked changes still visible
2. **Given** the inline editor is open, **When** reviewer modifies the text and clicks Save, **Then** the new text is applied with tracked changes shown relative to the currently effective text (not the original), and the clause status changes to RESOLVED_MANUAL_EDIT
3. **Given** a clause already has a fallback replacement applied, **When** reviewer edits it manually, **Then** the tracked changes show the diff from the fallback text (current effective), not from the original counterparty text
4. **Given** the editor is open, **When** reviewer clicks Cancel, **Then** no changes are saved and the clause remains in its previous state

---

### User Story 4 - Escalate to Senior Reviewer (Priority: P2)

A contract reviewer encounters a clause that exceeds their decision authority or risk tolerance. They need to escalate it to a senior reviewer or legal admin with context (reason, comment, assignee).

**Why this priority**: Escalation is essential for governance but less frequent than direct resolution (maybe 5-10% of clauses). It's P2 because it requires user assignment logic and notification systems. Delivers standalone value by creating a formal escalation workflow with accountability.

**Independent Test**: Can be fully tested by loading a clause, clicking "⬆ Escalate", selecting a reason and assignee, confirming, and verifying the clause status changes to ESCALATED with assignee name displayed and (optionally) the clause locked for non-approvers.

**Acceptance Scenarios**:

1. **Given** a clause in the reviewer drawer, **When** reviewer clicks "⬆ Escalate", **Then** an inline modal opens inside the drawer with fields for: reason dropdown (Exceeds tolerance, Commercial impact, Regulatory, Other), comment text area, assignee dropdown (filtered to approvers), and Confirm/Cancel buttons
2. **Given** the escalation modal is open, **When** reviewer selects "Exceeds tolerance" reason, adds a comment, selects a senior reviewer, and clicks Confirm, **Then** the clause status immediately updates to ESCALATED, the viewer shows "Escalated to [assignee name]", and the decision is persisted with actionType=ESCALATE
3. **Given** a clause is escalated to a specific approver, **When** a regular reviewer (non-approver, non-admin) tries to edit it, **Then** the edit actions are disabled (locked) and a message shows "Awaiting decision from [assignee name]"
4. **Given** a clause is escalated to User A, **When** User A (the assigned approver) makes any decision (accept, replace, edit), **Then** the escalation is resolved, the clause is unlocked, and the clause status updates based on the decision made
5. **Given** a clause is escalated to User A, **When** a system admin views the clause, **Then** all decision actions are enabled (escalation lock does not apply to admins), and admin can make decisions or reassign the escalation
6. **Given** a clause is escalated to a specific user, **When** that user logs in, **Then** they see the escalated clauses highlighted in their review queue (future enhancement: notification)

---

### User Story 5 - Add Internal Note (Priority: P3)

A contract reviewer wants to leave a non-binding internal note for their team (e.g., "Discuss with finance", "Client preference", "Low priority") without changing the clause status or text.

**Why this priority**: Internal notes are helpful for collaboration but not critical for the core review workflow. They're P3 because they're a "nice to have" enhancement. Can be implemented last and still deliver standalone value as a team communication tool.

**Independent Test**: Can be fully tested by loading any clause, clicking "💬 Add internal note", typing a note, saving, and verifying a note indicator icon appears in the drawer and clause list with the note visible on hover/tooltip.

**Acceptance Scenarios**:

1. **Given** a clause in the reviewer drawer, **When** reviewer clicks "💬 Add internal note", **Then** a text input field appears (inline or in a small modal) for entering the note
2. **Given** the note input is open, **When** reviewer types "Discuss with finance team" and saves, **Then** the note is stored with actionType=ADD_NOTE, a note indicator icon (💬 or 📝) appears next to the clause in the drawer, and no text or status changes occur
3. **Given** a clause has an internal note, **When** any team member with contract access hovers over the note icon, **Then** a tooltip displays the note text (visible to all users regardless of role)
4. **Given** a clause has multiple notes from different team members, **When** a user views the note indicator, **Then** all notes are visible in chronological order (or as a count like "3 notes") with author names and timestamps

---

### User Story 6 - Undo Last Decision (Priority: P1)

A contract reviewer makes a decision (accept, replace, edit, escalate) and immediately realizes it was incorrect. They need to undo the last action, reverting the clause to its previous state without losing the history.

**Why this priority**: Undo is essential for user confidence and error recovery. Reviewers make mistakes and must be able to correct them instantly. This is P1 because it's a fundamental UX expectation and prevents costly errors. Delivers immediate standalone value as a safety net.

**Independent Test**: Can be fully tested by applying any decision action (e.g., accept deviation), clicking "Undo", and verifying the clause reverts to its pre-action state (status, text, UI) while keeping the action in the history log.

**Acceptance Scenarios**:

1. **Given** a clause with a decision applied (e.g., ACCEPTED status), **When** reviewer clicks "Undo" in the drawer, **Then** the clause immediately reverts to its previous state (status, text, UI) as if the decision was never applied
2. **Given** an undo action is performed, **When** viewing the decision history log, **Then** the original decision is still visible but marked as undone (e.g., strikethrough or "UNDONE" label), and a new ClauseDecision record with actionType=UNDO references the undone decisionId
3. **Given** a clause has had multiple decisions applied (e.g., replaced, then edited), **When** reviewer clicks Undo, **Then** only the most recent decision is undone, reverting to the previous state (e.g., back to replaced state, not original)
4. **Given** an undone decision, **When** reviewer clicks Undo again, **Then** the next most recent decision is undone, supporting multiple levels of undo

---

### User Story 7 - Revert to Original Clause Text (Priority: P2)

A contract reviewer has made several decisions on a clause (replaced, then edited, then accepted edit) but now wants to start over from the original counterparty text. They need a "Revert to original" action that ignores all decisions.

**Why this priority**: Revert is less urgent than undo because it's used less frequently (when multiple decisions have been made incorrectly). It's P2 because it requires more complex projection logic to ignore all decisions. Still delivers standalone value for reviewers who need to "reset" a clause.

**Independent Test**: Can be fully tested by applying multiple decisions to a clause (accept, then edit), clicking "Revert to original", and verifying the clause returns to the original counterparty text/status with all decisions preserved in history but ignored in projection.

**Acceptance Scenarios**:

1. **Given** a clause with multiple decisions applied (e.g., replaced with fallback, then manually edited), **When** reviewer clicks "Revert to original", **Then** the clause immediately shows the original counterparty text and status (e.g., back to DEVIATION_DETECTED), ignoring all decisions in the projection logic
2. **Given** a revert action is performed, **When** viewing the decision history log, **Then** all previous decisions are still visible (not deleted) and a new ClauseDecision record with actionType=REVERT is appended to the history
3. **Given** a clause has been reverted to original, **When** the projection logic computes effective text/status, **Then** it sees the REVERT marker and ignores all decisions prior to that marker, using the original text
4. **Given** a clause is reverted, **When** reviewer applies a new decision (e.g., accept), **Then** the new decision is applied on top of the original text, and the projection ignores pre-revert decisions

---

### Edge Cases

- **What happens when a playbook rule has no fallback language defined, but the user clicks "Replace with fallback"?** → Button should be disabled/hidden if no fallback language is available, preventing the action
- **How does the system handle tracked changes when a clause has been replaced, then manually edited, then reverted, then edited again?** → Tracked changes always show diff from currently effective text (after applying projection logic), not from original. After revert, effective text is original, so next edit shows diff from original.
- **What happens when a clause is escalated to User A, then User A escalates it further to User B?** → User A (the assigned approver) can make any decision including escalating to another user. The latest escalation decision takes precedence. Projection shows "Escalated to User B". History shows both escalations. Alternatively, an admin can reassign the escalation from User A to User B without User A's involvement.
- **How does undo work if the undone decision was an escalation, and the clause is now locked?** → Undo removes the escalation, unlocking the clause and reverting status to previous state (e.g., DEVIATION_DETECTED).
- **Can a user undo an undo (redo)?** → Not in the initial implementation. Undo operates on the decision history linearly. Redo would require tracking undo actions separately (future enhancement).
- **What happens when multiple reviewers work on the same contract concurrently and apply conflicting decisions to the same clause?** → Append-only history preserves all decisions. Projection uses the most recent decision by server timestamp (last-write-wins). When a reviewer saves a decision on a clause that was modified by another user since they loaded it, the UI detects the stale state and displays a warning: "This clause was updated by [User] while you were editing. Your change was saved but may conflict." The reviewer can then undo their decision if needed to review the other user's change.
- **How does the system handle exporting a contract with tracked changes when decisions include a mix of replacements, edits, and accepts?** → Export logic computes final effective text for each clause after applying projection. Clauses with text changes (replacements, edits) include tracked changes markup. Accepted deviations export as-is with no markup (counterparty text preserved).

## Requirements *(mandatory)*

### Functional Requirements

#### Core Decision Actions

- **FR-001**: System MUST provide an "Accept deviation" button that changes clause status to ACCEPTED without modifying clause text
- **FR-002**: System MUST update UI immediately (no page reload) when a decision action is applied, including clause status badge in the list view and status tag in the detail viewer
- **FR-003**: System MUST persist each decision action as a ClauseDecision record with actionType (ACCEPT_DEVIATION, APPLY_FALLBACK, EDIT_MANUAL, ESCALATE, ADD_NOTE, UNDO, REVERT), timestamp, userId, and payload (decision-specific data)
- **FR-004**: System MUST support an optional comment field for "Accept deviation" actions, stored in the ClauseDecision payload
- **FR-005**: System MUST provide a "Replace with fallback" button that replaces clause text with playbook fallback language and shows tracked changes (strikethrough for deleted text, underline for inserted text)
- **FR-006**: System MUST store both the replacement text and the source type (fallback or preferred) in the ClauseDecision payload for fallback replacements
- **FR-007**: System MUST disable/hide the "Replace with fallback" button if the matching playbook rule has no fallback language defined
- **FR-008**: System MUST provide an "Edit manually" button that opens an inline text editor pre-loaded with the currently effective clause text
- **FR-009**: System MUST compute tracked changes relative to the currently effective text (after applying all previous decisions) when a manual edit is saved, not relative to the original counterparty text
- **FR-010**: System MUST change clause status to RESOLVED_MANUAL_EDIT when a manual edit is saved
- **FR-011**: System MUST provide an "Escalate" button that opens an inline modal with fields for: reason (dropdown with predefined options), comment (text area), assignee (user dropdown), and Confirm/Cancel buttons
- **FR-012**: System MUST support at least four escalation reasons: "Exceeds tolerance", "Commercial impact", "Regulatory", "Other"
- **FR-013**: System MUST change clause status to ESCALATED when an escalation is confirmed and display "Escalated to [assignee name]" in the viewer
- **FR-014**: System MUST lock editing actions (accept, replace, edit, escalate) for all users except the assigned approver and system admins when a clause is escalated (locking behavior can be disabled via admin configuration, but is enabled by default)
- **FR-044**: System MUST allow the assigned approver (the user the clause was escalated to) to make any decision action on that escalated clause, which will resolve the escalation and update the clause status. Note: APPROVE_ESCALATIONS permission only grants authority on clauses escalated to that user, not global edit permission.
- **FR-045**: System MUST allow system admins to override escalation locks, make decisions on escalated clauses, or reassign the escalation to a different approver
- **FR-015**: System MUST provide an "Add internal note" button that opens a text input field without changing clause text or status (note: "internal" means for the reviewing organization's team, visible to all team members with contract access, not for external counterparties)
- **FR-016**: System MUST display a note indicator icon (e.g., 💬 or 📝) next to clauses with internal notes in both the list view and detail viewer
- **FR-017**: System MUST show note text in a tooltip or expandable panel when the note indicator is hovered or clicked - notes are visible to all users with contract access (no role-based hiding)

#### Undo & Revert

- **FR-018**: System MUST provide an "Undo" button/action that reverts the clause to its state before the most recent decision was applied
- **FR-019**: System MUST preserve all decisions in the history log when an undo is performed (append-only), appending a new ClauseDecision record with actionType=UNDO that references the undone decisionId
- **FR-020**: System MUST support multiple levels of undo, allowing the user to undo the undo (i.e., undo the second-most-recent decision after undoing the most recent)
- **FR-021**: System MUST provide a "Revert to original" button/action that reverts the clause to the original counterparty text and status, ignoring all decisions in the projection logic
- **FR-022**: System MUST preserve all decisions in the history log when a revert is performed (append-only), appending a new ClauseDecision record with actionType=REVERT
- **FR-023**: System MUST compute the effective clause text and status by applying all decisions in chronological order, stopping at UNDO or REVERT markers and resuming after them (projection logic)
- **FR-024**: System MUST make the "Undo" button visible/enabled only when at least one decision has been applied to the clause
- **FR-025**: System MUST make the "Revert to original" button visible/enabled only when at least one decision has been applied to the clause

#### Tracked Changes & Display

- **FR-026**: System MUST display tracked changes in the clause viewer using visual differentiation: strikethrough (red) for deleted text, underline (green) for inserted text
- **FR-027**: System MUST compute tracked changes by comparing the previous effective text (before decision) with the new effective text (after decision)
- **FR-028**: System MAY preserve tracked changes markup when a contract is exported in Word, PDF, or HTML redline format (future enhancement - requires integration with contract export feature)
- **FR-029**: System MUST show a small tag "Accepted deviation (playbook override)" in the clause viewer when a deviation has been accepted
- **FR-030**: System MUST update the clause list view badge to reflect the current effective status (ACCEPTED, RESOLVED_APPLIED_FALLBACK, RESOLVED_MANUAL_EDIT, ESCALATED) immediately after a decision is applied

#### History & Audit Trail

- **FR-031**: System MUST provide a decision history log view that shows all decisions for a clause in chronological order with actionType, timestamp, user name, and full payload details (including internal notes, comments, escalation reasons) - visible to all users who have access to the contract (full transparency model)
- **FR-032**: System MUST mark undone decisions in the history log with a visual indicator (e.g., strikethrough or "UNDONE" label)
- **FR-033**: System MUST never delete ClauseDecision records as long as the parent contract exists in the system (append-only history for audit compliance and indefinite retention)
- **FR-034**: System SHOULD allow filtering/searching the history log by actionType, user, and date range (deferred to post-MVP - initial implementation displays full history chronologically per T044)
- **FR-039**: System MAY provide an archive capability for decision history when a contract is closed or deleted, with archival retention period following legal requirements (typically 7+ years) - this is a future enhancement not required for initial implementation
- **FR-046**: System MUST NOT implement role-based redaction or filtering of decision history content - all users with contract access see identical decision history (no hidden notes or redacted comments based on role)

#### Conflict Detection & Concurrent Edits

- **FR-035**: System MUST detect when a reviewer attempts to save a decision on a clause that has been modified by another user since the reviewer loaded the clause (stale state detection using clause version or last-modified timestamp)
- **FR-036**: System MUST display a warning message when a stale state is detected: "This clause was updated by [User Name] while you were editing. Your change was saved but may conflict." with the other user's name and a timestamp
- **FR-037**: System MUST save both conflicting decisions in the append-only history (no rejection), with the projection logic using the most recent decision by server timestamp (last-write-wins)
- **FR-038**: System MUST provide an "Undo" button immediately after showing the conflict warning, allowing the reviewer to quickly revert their decision if they determine the other user's decision should take precedence

#### Projection Caching & Performance

- **FR-040**: System MUST cache the projection result (effective text, effective status, tracked changes) for each clause after computing it, using a clause-level cache key (e.g., clauseId)
- **FR-041**: System MUST invalidate the cached projection result for a clause when any decision is made on that specific clause (cache invalidation on write)
- **FR-042**: System MUST serve subsequent reads of the same clause from cache (until invalidated) to achieve < 500ms response time for clause loading
- **FR-043**: System MUST recompute projection from decision history when cache is invalidated or cache miss occurs, then update the cache with the new result

### Key Entities

- **ClauseDecision**: Represents a single decision action applied to a clause by a reviewer. Key attributes:
  - `id`: Unique identifier
  - `clauseId`: Reference to the AnalysisClause this decision applies to
  - `userId`: User who made the decision
  - `actionType`: Enum (ACCEPT_DEVIATION, APPLY_FALLBACK, EDIT_MANUAL, ESCALATE, ADD_NOTE, UNDO, REVERT)
  - `timestamp`: When the decision was made
  - `payload`: JSON object with action-specific data:
    - For ACCEPT_DEVIATION: `{ comment?: string, isAdminOverride?: boolean }`
    - For APPLY_FALLBACK: `{ replacementText: string, source: 'fallback'|'preferred', playbookRuleId: string, isAdminOverride?: boolean }`
    - For EDIT_MANUAL: `{ replacementText: string, isAdminOverride?: boolean }`
    - For ESCALATE: `{ reason: string, comment: string, assigneeId: string, reassignedByAdminId?: string }`
    - For ADD_NOTE: `{ noteText: string }`
    - For UNDO: `{ undoneDecisionId: string }`
    - For REVERT: `{}` (no payload needed)
    - Note: `isAdminOverride` flag is set to true when an admin makes a decision on an escalated clause that was not assigned to them
  - `isActive`: Boolean flag (used by projection logic to mark undone/reverted decisions as inactive)
  - Relationships: Many-to-one with AnalysisClause, many-to-one with User

- **AnalysisClause** (extended): Existing entity representing a clause analyzed for deviations. Extended with:
  - `effectiveText`: Computed field (not stored) that represents the current text after applying all active decisions (projection logic)
  - `effectiveStatus`: Computed field (not stored) that represents the current status after applying all active decisions
  - Relationships: One-to-many with ClauseDecision (decision history)

- **ProjectionResult**: Computed object (not stored in DB) representing the effective state of a clause after applying decision history. Attributes:
  - `effectiveText`: Final text after applying all active decisions
  - `effectiveStatus`: Final status after applying all active decisions
  - `trackedChanges`: Array of change objects `{ type: 'delete'|'insert', text: string, position: number }` for rendering
  - `lastDecisionTimestamp`: When the most recent decision was applied
  - `decisionCount`: Number of active decisions applied

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Reviewers can apply any of the five core decision actions (accept, replace, edit, escalate, note) with immediate UI feedback (< 500ms response time)
- **SC-002**: Reviewers can undo or revert any decision with immediate UI feedback (< 500ms response time)
- **SC-003**: The decision history log for a clause displays all actions in chronological order with no data loss (100% append-only integrity)
- **SC-004**: Tracked changes display correctly in the UI for all text modification actions (replace, edit), showing clear visual differentiation between deleted and inserted text
- **SC-005**: Exported contracts preserve tracked changes markup in Word/PDF/HTML redline format for all clauses with text modifications
- **SC-006**: The system supports at least 500 clauses per contract with decision history on each clause without performance degradation (projection logic completes in < 2 seconds per contract)
- **SC-007**: Reviewers complete the escalation workflow (click escalate → fill form → confirm) in under 30 seconds on average
- **SC-008**: The projection logic correctly computes effective clause text and status in 100% of test cases, including complex scenarios (multiple edits, undo, revert, re-edit)
- **SC-009**: Escalation locks are enforced correctly: regular reviewers cannot edit escalated clauses, assigned approvers and admins can edit escalated clauses (100% API-level enforcement with no unauthorized access)
- **SC-010**: Users report increased confidence in their decisions due to undo/revert safety net (qualitative feedback: 80% positive)
- **SC-011**: All team members with contract access can view complete decision history including notes and comments, promoting transparency and collaboration (100% visibility with no role-based filtering)

## Non-Functional Requirements *(optional)*

### Performance

- **NFR-001**: Decision actions must update the UI within 500ms on average (achieved through per-clause projection caching with invalidation on write)
- **NFR-002**: Projection logic must compute effective state for a 500-clause contract in under 2 seconds (initial computation for uncached clauses; subsequent reads served from cache in < 100ms per clause)
- **NFR-003**: The decision history log for a clause with 50 decisions must load in under 1 second
- **NFR-013**: Cache hit rate for clause projection reads must be at least 80% under normal usage patterns (most reviewers read clauses multiple times before making decisions)

### Usability

- **NFR-004**: Decision action buttons must have clear, recognizable icons and labels (✅ Accept, 🔁 Replace, ✏️ Edit, ⬆ Escalate, 💬 Note)
- **NFR-005**: Tracked changes must use accessible color contrast ratios (red/green with additional visual indicators like strikethrough/underline for colorblind users)
- **NFR-006**: Undo and Revert buttons must have clear confirmation for destructive actions (optional: "Are you sure?" modal for Revert)

### Security & Audit

- **NFR-007**: All ClauseDecision records must include userId and timestamp for audit compliance
- **NFR-008**: The system must never delete or modify ClauseDecision records (append-only for legal audit trail)
- **NFR-009**: Escalation locks must be enforced at the API level, not just the UI, to prevent unauthorized edits. API must verify that the requesting user is either the assigned approver or a system admin before allowing decisions on escalated clauses.
- **NFR-011**: Conflict detection must be performed server-side (not just client-side) using clause version numbers or last-modified timestamps to ensure accurate stale state detection even with network latency or clock skew
- **NFR-014**: Admin override actions (resolving escalations not assigned to them, reassigning escalations) must be logged in the decision history with clear indication that an admin override occurred for audit purposes
- **NFR-015**: Decision history transparency must be enforced at the API level - all users with contract access receive identical decision history data (no server-side filtering based on role). Contract-level access control determines who can view the contract, not decision-level or note-level filtering.

### Scalability

- **NFR-010**: The decision history append-only model must support at least 100 decisions per clause without performance degradation, with indefinite retention as long as the contract exists in the system
- **NFR-012**: Database indexes and query optimization must account for long-lived contracts with years of accumulated decision history (contracts may remain active for 10+ years in some organizations)

## Assumptions *(optional)*

1. **Existing Contract Viewer**: We assume the application already has a contract detail viewer with a clause list (left panel) and clause detail drawer/panel (right panel) where these buttons will be placed
2. **Playbook Integration**: We assume the playbook system (Feature 004/005) already provides fallback/preferred language for rules, which can be retrieved via API for the "Replace with fallback" action
3. **User Permissions**: We assume the application has an existing user role system with roles "admin", "compliance", and "legal". This feature adds a proper RBAC system with role-permission mappings stored in a `RolePermission` table. Permissions: `REVIEW_CONTRACTS` (access to contract analysis/clause decisions), `APPROVE_ESCALATIONS` (resolve escalations when assigned), and future permissions for admin tasks. Permission model: (1) `legal` role is granted both `REVIEW_CONTRACTS` and `APPROVE_ESCALATIONS` via DB records, (2) `compliance` role has NO permissions (explicitly excluded from contract review), (3) Admin users bypass all permission checks (code-level fallback for performance). This architecture supports future role management UI without code changes.
4. **Tracked Changes Library**: We assume a text diff library (e.g., `diff-match-patch`, `fast-diff`) will be used to compute tracked changes, or a custom implementation will be built
5. **Single Active Review**: We assume only one reviewer actively edits a clause at a time (no real-time collaborative editing with conflict resolution in the initial implementation)
6. **Export Capability**: We assume the application already has a contract export feature that can be extended to include tracked changes markup
7. **Projection is Computed, Not Stored**: We assume effective clause text/status is computed on-the-fly from the decision history (projection logic) rather than stored in the database, to maintain single source of truth. Projection results are cached per-clause for performance but the cache is ephemeral (not the source of truth).
8. **Contract Lifecycle Management**: We assume the application has contract lifecycle management (active, closed, archived) and that decision history retention follows the contract lifecycle (retained indefinitely while contract is active, optionally archived after contract closure)
9. **Caching Infrastructure**: We assume the application has access to a caching layer (e.g., in-memory cache, Redis, or application-level cache) for storing per-clause projection results with sub-100ms read latency and support for cache invalidation by key
10. **Internal Users Only**: We assume all users with contract access are internal to the reviewing organization (employees, contractors). There is no external counterparty access to the contract review system in this feature scope. All decision history, notes, and comments are internal team communications.

## Constraints *(optional)*

1. **Append-Only History with Indefinite Retention**: All ClauseDecision records must be append-only (no updates or deletes) and retained indefinitely as long as the parent contract exists in the system, for audit compliance and legal requirements. This constrains the undo/revert implementation to use new records with UNDO/REVERT action types rather than modifying existing records. Archival of decision history is only permitted after contract closure, with retention periods following legal requirements (typically 7+ years).
2. **Projection Complexity**: The projection logic must handle complex decision chains (e.g., replace → edit → undo → edit → revert → accept) correctly. This adds implementation complexity and requires thorough testing.
3. **UI Real Estate**: The clause detail drawer must accommodate 5 primary action buttons (accept, replace, edit, escalate, note) plus 2 secondary buttons (undo, revert) without cluttering the interface. This constrains button placement and may require collapsible sections or icon-only buttons.
4. **Tracked Changes Performance**: Computing and rendering tracked changes for large clauses (500+ words) must not degrade UI responsiveness. This constrains the diff algorithm choice and may require debouncing/throttling for the inline editor.
5. **Browser Compatibility**: The inline editor and tracked changes rendering must work in all modern browsers (Chrome, Firefox, Safari, Edge) without polyfills. This constrains the use of bleeding-edge CSS or JavaScript features.

## Dependencies *(optional)*

1. **Feature 005 (Deviation-Focused Analysis)**: This feature builds on the clause analysis system from Feature 005, which identifies deviations from the playbook. ClauseDecision actions apply to AnalysisClause records created by Feature 005.
2. **Feature 004 (Playbook Management)**: The "Replace with fallback" action depends on the playbook system providing fallback/preferred language for each rule.
3. **User Management System**: The escalation workflow depends on the ability to list users and assign clauses to specific users.
4. **Text Diff Library**: The tracked changes feature depends on a text diff library for computing insertions/deletions (e.g., `diff-match-patch`, `fast-diff`, or a custom implementation).
5. **Contract Export Feature**: The "preserve tracked changes in export" requirement depends on the existing contract export feature being extensible to include markup (Word with track changes, PDF with redlines, HTML with styled diffs).

## Risks *(optional)*

1. **Projection Logic Complexity**: The projection algorithm to compute effective text/status from decision history is non-trivial. Risk: bugs in projection logic could cause clauses to display incorrect text or status. Mitigation: Comprehensive unit tests with complex decision chains, and a "decision debugger" UI for troubleshooting.
2. **Performance with Large Decision Histories**: If a clause accumulates 100+ decisions (from multiple reviewers or repeated undo/redo cycles), projection could become slow. Risk: UI lag when loading or updating clauses. Mitigation: Cache projection results per clause, invalidate on new decision. Monitor decision count metrics.
3. **Concurrent Editing Conflicts**: If two reviewers apply decisions to the same clause simultaneously, the append-only model will preserve both, but the UI may show stale data. Risk: Confusion, lost work, or conflicting decisions. Mitigation: Add "last updated by X at time Y" indicator in UI, warn if clause was updated since user opened it, implement optimistic locking in future version.
4. **Tracked Changes Rendering Issues**: Different browsers may render complex tracked changes markup (strikethrough + underline + colors) inconsistently. Risk: Poor UX, accessibility issues. Mitigation: Use a battle-tested rich text editor library (e.g., Quill, ProseMirror, TipTap) that handles tracked changes, or implement custom CSS with fallbacks.
5. **User Confusion Between Undo and Revert**: Users may not understand the difference between "undo last action" and "revert to original". Risk: Accidental data loss, frustration. Mitigation: Clear labeling and tooltips ("Undo undoes only the last decision; Revert clears all decisions"), confirmation modal for Revert.
6. **Cache Invalidation Bugs**: If cache invalidation logic fails (e.g., decision saved but cache not invalidated), users could see stale projection results (outdated effective text/status). Risk: Incorrect decision-making based on stale data, loss of trust in system. Mitigation: Defensive cache invalidation (invalidate on any write to ClauseDecision table), cache TTL as backup (e.g., 5-minute expiration), cache bypass mode for debugging, comprehensive integration tests for cache coherence.

## Alternatives Considered *(optional)*

1. **Mutable Decision Model (Update Instead of Append)**:
   - **Description**: Instead of append-only ClauseDecision records, update the single "current" decision for each clause when the user changes their mind.
   - **Pros**: Simpler database schema, no projection logic needed, faster queries.
   - **Cons**: Loses audit trail (can't see decision history), violates compliance requirements for contract review, no undo/revert capability.
   - **Reason not chosen**: Audit trail is essential for legal compliance in contract review.

2. **Snapshot Model (Store Effective Text in DB)**:
   - **Description**: Store the effective clause text and status in the AnalysisClause table, updating it on each decision. Keep decision history separately.
   - **Pros**: Faster reads (no projection computation), simpler query logic.
   - **Cons**: Data duplication, risk of inconsistency between effective text and decision history, more complex writes (must update both text and history).
   - **Reason not chosen**: Violates single source of truth principle, harder to debug and maintain, doesn't simplify undo/revert logic.

3. **Command Sourcing Without Projection (Replay All Decisions on Read)**:
   - **Description**: Store decisions as events, replay all decisions every time the clause is read to compute effective state.
   - **Pros**: Pure event sourcing, maximum flexibility for future decision types.
   - **Cons**: Potentially slow for clauses with many decisions, more complex to implement, overkill for the problem size.
   - **Reason not chosen**: Projection caching provides a good middle ground between pure event sourcing and materialized views.

4. **Separate Undo Stack (Not Part of Decision History)**:
   - **Description**: Maintain a separate undo/redo stack in memory or session storage instead of storing UNDO actions in the decision history.
   - **Pros**: Cleaner decision history (no UNDO clutter), easier redo implementation.
   - **Cons**: Loses undo/redo audit trail, session-only (lost on page refresh), harder to sync across devices/sessions.
   - **Reason not chosen**: Undo/revert actions are part of the decision-making process and should be auditable like any other action.

5. **Real-Time Collaborative Editing with Operational Transformation (OT) or CRDTs**:
   - **Description**: Implement real-time conflict resolution for concurrent edits using OT or CRDT algorithms.
   - **Pros**: Supports true multi-user collaboration, no lost edits.
   - **Cons**: Massive implementation complexity, requires WebSocket infrastructure, overkill for typical contract review workflow (reviewers work sequentially, not simultaneously).
   - **Reason not chosen**: Contract review is typically a sequential workflow (one reviewer at a time). Real-time collaboration is a nice-to-have for future versions, not MVP.

## Open Questions *(optional)*

1. **Escalation Notification**: Should the system send email/in-app notifications to the assignee when a clause is escalated? Or is the escalated status visible in their queue sufficient?  
   *Decision deferred to planning phase: Planning team will determine if notifications are in scope for MVP or a future enhancement.*

2. **Redo Implementation**: Should the initial version support redo (undo an undo)? Or only undo in a linear fashion?  
   *Assumption for now: Linear undo only. Redo is a future enhancement (low ROI for complexity).*

3. **Decision History UI Placement**: Should the decision history log be a separate tab in the clause drawer, an expandable section, or a modal?  
   *Decision deferred to planning phase: UX designer will determine optimal placement based on drawer real estate.*

4. **Export Format for Tracked Changes**: Should the exported redline use Word's native track changes format, PDF annotations, custom HTML/CSS styling, or all of the above?  
   *Decision deferred to planning phase: Export format depends on technical feasibility and user preferences. Survey target users during planning.*

5. **Edit Locking Granularity**: When a clause is escalated, should all actions be locked, or only certain actions (e.g., text changes but not notes)?  
   *Decision: All decision actions (accept, replace, edit, escalate) are locked for regular reviewers. Notes can always be added by any user. Assigned approver and admins can perform all actions. Locking can be disabled via admin configuration but is enabled by default.*

---

**End of Specification**
