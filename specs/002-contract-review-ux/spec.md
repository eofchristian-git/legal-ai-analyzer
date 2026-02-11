# Feature Specification: Contract Review — Professional Legal UI/UX

**Feature Branch**: `002-contract-review-ux`  
**Created**: 2026-02-11  
**Status**: Draft  
**Input**: User description: "Enhance UI/UX for the contract analysis page to look more legally sufficient. Improve the three sections (Clauses, Clause Text, Findings). Visually indicate when a clause has been triaged. Rework the negotiation strategy section into a structured, priority-based layout."

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Clause List with Triage Visibility (Priority: P1)

A legal reviewer opens the contract analysis page and immediately sees the clause list on the left panel. Each clause row shows its risk badge and finding count as today, **but now also indicates the triage progress** for that clause. When all findings under a clause have been triaged, the clause is visually marked as "done" (e.g. a subtle checkmark or a muted/struck-through appearance). When some findings are triaged but not all, the clause shows a partial-progress indicator (e.g. "2/3 triaged"). Untouched clauses show no triage indicator. This lets the reviewer quickly scan the full list and understand what still needs attention without clicking into each clause.

**Why this priority**: The clause list is the primary navigation element. Making triage state visible here is the highest-leverage change — it immediately answers "where do I still need to work?" for the reviewer.

**Independent Test**: Can be tested by triaging one finding, then verifying the parent clause row updates in the list without a full page reload.

**Acceptance Scenarios**:

1. **Given** a clause with 3 findings and 0 triaged, **When** the reviewer views the clause list, **Then** no triage indicator is shown (only risk badge and finding count).
2. **Given** a clause with 3 findings and 2 triaged, **When** the reviewer views the clause list, **Then** the clause shows "2/3" triaged progress indicator.
3. **Given** a clause with all findings triaged, **When** the reviewer views the clause list, **Then** the clause row displays a completion checkmark and its appearance is visually distinguished (e.g. muted text or a green left-border accent).
4. **Given** an analysis that is finalized, **When** the reviewer views the clause list, **Then** every clause row shows the locked/finalized state consistently.

---

### User Story 2 — Professional Clause Text Panel (Priority: P1)

The center "Clause Text" panel is the reading pane for the original contract language. Today it displays the clause text as plain pre-wrapped text. The enhanced version should present the clause text in a more professional, document-like style:

- A clear header showing the clause number and name in a legal-style format (e.g. bold section number, followed by the title).
- The clause body rendered in a serif or document-appropriate typeface with comfortable line-height and justified or left-aligned text, resembling a printed legal document.
- A subtle top-bar or banner showing the clause's aggregate risk status and total findings count for the selected clause (so the reviewer doesn't need to look at the right panel to know severity).
- When the clause has findings, the specific passages that triggered findings are highlighted (underlined or background-highlighted in the risk colour) within the clause text, linking the reader's eye from the text to the finding. The highlight substring comes from the `excerpt` field returned by the AI per finding and is matched via exact string search in the clause text.

**Why this priority**: The clause text is the core evidence the reviewer reads. Making it look authoritative and connecting it visually to the findings improves comprehension and trust.

**Independent Test**: Can be tested by selecting a clause and confirming the header, typography, risk banner, and highlighted passages render correctly.

**Acceptance Scenarios**:

1. **Given** a selected clause with findings, **When** the reviewer reads the clause text, **Then** the clause body is displayed in a legible, document-style typeface with a clear section-number header.
2. **Given** a clause with RED findings, **When** the reviewer views the clause text panel, **Then** a risk summary banner at the top shows the highest risk level and finding count for this clause.
3. **Given** a clause with zero findings, **When** the reviewer views the clause text panel, **Then** no highlight marks or risk banner appear — the text displays cleanly.

---

### User Story 3 — Refined Findings & Triage Panel (Priority: P1)

The right "Findings & Triage" panel shows finding cards. The enhanced version should:

- Group findings visually by severity, with RED findings sorted first, then YELLOW, then GREEN.
- Show a risk-coloured left border on each finding card (red, amber, green vertical stripe) so the eye can scan severity without reading text.
- Display the triage state more prominently: when a finding has been triaged, show the decision as a full-width coloured banner at the top of the card (green for Accept, amber for Needs Review, red for Reject) instead of just button states. Include the reviewer's name and timestamp.
- When the analysis is finalized, finding cards should appear in a locked/read-only style (subdued colours, a lock icon on each card).

**Why this priority**: The findings panel is where decisions are made. Making severity and triage state immediately visible reduces cognitive load and makes the triage workflow faster.

**Independent Test**: Can be tested by viewing findings for a clause that has a mix of severities and triage states, confirming correct sort order, coloured borders, and decision banners.

**Acceptance Scenarios**:

1. **Given** a clause with findings of mixed severity, **When** the findings panel renders, **Then** findings are sorted RED → YELLOW → GREEN.
2. **Given** a finding that has been triaged as "Accept", **When** the reviewer views the finding card, **Then** a green "Accepted" banner appears at the top of the card with the reviewer name and time.
3. **Given** a finalized analysis, **When** the reviewer views any finding card, **Then** cards display in a muted, read-only style with a lock overlay and triage buttons are removed.
4. **Given** a finding card, **When** the reviewer looks at the left edge, **Then** a vertical colour stripe (red, amber, or green) indicates the finding's risk level, accompanied by a text severity label (e.g. "High", "Medium", "Low") so the information is accessible without colour vision.

---

### User Story 4 — Structured Negotiation Strategy (Priority: P2)

Today the negotiation strategy is a single Markdown blob at the bottom of the page. The enhanced version should instruct the AI to return negotiation items as **structured priority items** and display them in a modern, scannable layout:

- The AI returns negotiation strategy as a JSON array of priority items, each with a priority level (P1 / P2 / P3), a title, a description, and optionally a related clause reference.
- The UI renders these as a numbered priority list with colour-coded priority badges (P1 = red, P2 = amber, P3 = green/blue).
- Each item is an expandable card: the title and priority badge are always visible; clicking expands to reveal the full description and linked clause.
- Items are sorted by priority (P1 first).
- A small summary header above the list shows counts per priority level (e.g. "2 Critical · 3 Important · 1 Nice-to-have").

**Why this priority**: The negotiation strategy is a secondary output consumed after triage. Structuring it by priority makes it actionable for the legal team and far more useful than a wall of text.

**Independent Test**: Can be tested by running an analysis and confirming the negotiation strategy displays as structured priority cards instead of raw Markdown.

**Acceptance Scenarios**:

1. **Given** an analysis with a negotiation strategy, **When** the reviewer scrolls to the Negotiation Strategy section, **Then** they see priority cards sorted P1 → P2 → P3, each with a coloured badge and a title.
2. **Given** a negotiation priority item, **When** the reviewer clicks the card, **Then** the full description and related clause reference (if any) are revealed.
3. **Given** the negotiation strategy section, **When** the reviewer views the header, **Then** a summary bar shows counts per priority level.
4. **Given** an analysis with no negotiation strategy content, **When** the reviewer views the page, **Then** the Negotiation Strategy section is hidden entirely.

---

### User Story 5 — Overall Page Polish & Legal Aesthetic (Priority: P2)

Across the entire contract analysis page, apply professional legal-application styling:

- Refine the analysis header bar: group the "Overall Risk", finding counts, playbook badge, and triage progress into a clean, horizontal status strip with clear visual separation (dividers or grouped card-like sections).
- Use a consistent colour palette: deep navy, slate grey, muted reds/ambers/greens (not bright neon) to evoke a professional legal tool.
- Apply subtle visual cues such as thin borders, soft shadows, and consistent spacing to all cards and panels.
- Ensure the three-panel layout uses the full available height and has consistent card header styling (uppercase tracking labels already present, but ensure alignment and visual consistency).

**Why this priority**: These are cosmetic refinements that improve the overall impression but don't change functionality. They build on the structural changes in P1.

**Independent Test**: Can be tested by visually inspecting the page layout, colour palette, and spacing on desktop viewports.

**Acceptance Scenarios**:

1. **Given** a completed analysis, **When** the reviewer views the page, **Then** all three panels, the header bar, and the executive summary card share a consistent visual style with refined spacing and subtle borders.
2. **Given** the analysis header bar, **When** the reviewer views it, **Then** metrics (risk, finding counts, triage progress, playbook badge) are grouped into visually distinct sections separated by dividers.

---

### Edge Cases

- What happens when a clause has findings but none have been triaged yet? → The clause list shows the finding count badge but no triage indicator.
- What happens when a legacy analysis has no `NegotiationItem` rows but has a Markdown `negotiationStrategy` string? → The section falls back to rendering the Markdown string as plain formatted text (pre-existing behaviour). No migration is performed.
- What happens when the negotiation strategy from the AI is empty or malformed? → The section is hidden entirely; no error is shown.
- What happens when the AI returns negotiation items without a priority field? → Default to P3 (lowest) and render normally.
- How does the highlighted clause text work if the AI's `excerpt` field doesn't exactly match a substring in the clause text? → Highlights are best-effort; if no exact match is found for a finding's `excerpt`, no highlight is rendered for that finding (graceful fallback, no error).
- What happens on narrow/mobile viewports? → The three-panel layout collapses into a single column with tab-based navigation (existing responsive behaviour is preserved).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The clause list panel MUST display the triage progress for each clause (ratio of triaged findings to total findings).
- **FR-002**: The clause list panel MUST visually distinguish fully-triaged clauses from partially-triaged and untouched clauses.
- **FR-003**: The clause text panel MUST display the clause number and name in a prominent, legal-style header.
- **FR-004**: The clause text panel MUST show a risk summary banner for the selected clause (highest risk level + finding count).
- **FR-005**: The clause text panel MUST use a system serif font stack (`Georgia, 'Times New Roman', serif`) for the clause body text to achieve a legal-document appearance with zero external font dependencies.
- **FR-006**: The findings panel MUST sort findings by severity: RED first, then YELLOW, then GREEN.
- **FR-007**: Each finding card MUST display a risk-coloured left border stripe.
- **FR-008**: Triaged findings MUST display a full-width decision banner (Accept/Needs Review/Reject) with reviewer name and timestamp.
- **FR-009**: Finding cards in a finalized analysis MUST appear in a locked, read-only style.
- **FR-014**: The AI prompt MUST instruct the model to return an `excerpt` field per finding — a verbatim substring copied from the clause text that triggered the finding. This field MUST be persisted on the `AnalysisFinding` model.
- **FR-015**: The clause text panel MUST highlight each finding's `excerpt` within the rendered clause text using the finding's risk colour. If no exact match is found, no highlight is rendered (graceful fallback).
- **FR-010**: The negotiation strategy section MUST display structured priority items (P1/P2/P3) as expandable cards instead of raw Markdown. Items are loaded from the `NegotiationItem` database model.
- **FR-011**: The AI prompt for negotiation strategy MUST instruct the model to return a JSON array of priority items with priority, title, description, and optional clause reference. The analysis pipeline MUST persist each item as a `NegotiationItem` row linked to the analysis.
- **FR-012**: The negotiation strategy header MUST show a summary count per priority level.
- **FR-013**: The analysis header bar MUST group metrics into visually distinct sections with clear separation.
- **FR-016**: For legacy analyses with no `NegotiationItem` rows, the negotiation strategy section MUST fall back to rendering the existing Markdown `negotiationStrategy` field as formatted text. No data migration is required.
- **FR-017**: All colour-coded risk indicators (severity borders, risk banners, triage decision banners, priority badges) MUST be paired with a text label and/or icon so that no information is conveyed by colour alone. This applies to the clause list, clause text panel, findings panel, and negotiation strategy cards.

### Key Entities

- **NegotiationItem** (new Prisma model): Represents a single negotiation priority point stored as an individual database row. Fields: `id` (cuid), `analysisId` (FK → ContractAnalysis), `priority` (String: "P1" | "P2" | "P3"), `title` (String), `description` (String), `clauseRef` (String?, optional clause name or number reference), `position` (Int, sort order). Enables per-item querying and future features like item-level annotation.

## Clarifications

### Session 2026-02-11

- Q: Should NegotiationPriorityItems be stored as JSON in the existing text column, as a new Prisma model with individual rows, or as a separate JSON column? → A: New `NegotiationItem` Prisma model with individual rows per priority item (Option B).
- Q: How should the frontend know which substring of the clause text to highlight for each finding? → A: The AI will return an explicit `excerpt` field per finding — a verbatim substring from the clause text. The frontend highlights by exact string match (Option A).
- Q: How should existing analyses with only a Markdown negotiation strategy be handled? → A: Legacy analyses render the Markdown string as-is (existing behaviour). Only new analyses produce `NegotiationItem` rows and get structured priority cards (Option A).
- Q: How should colour-coded risk indicators (red/amber/green) handle colour-blind accessibility? → A: Always pair colours with text labels and/or icons (e.g. "High" label, warning icon for "Medium", checkmark for "Low") so no information is conveyed by colour alone (Option A).
- Q: What typeface strategy should the clause text panel use for the serif/document font? → A: System serif stack (`Georgia, 'Times New Roman', serif`) — zero network requests, no layout shift, available on all platforms.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A reviewer can identify which clauses still need triage within 3 seconds of opening the page, without clicking into individual clauses.
- **SC-002**: Triage state (decision + reviewer) is visible on every finding card without expanding or hovering.
- **SC-003**: Findings are presented in severity order so the most critical items are always visible first without scrolling past low-risk items.
- **SC-004**: The negotiation strategy is scannable — a reviewer can identify all P1 (critical) items within 5 seconds by reading only titles and priority badges.
- **SC-005**: The contract text panel reads like a legal document, not a code editor or plain text dump.
- **SC-006**: The page achieves a visually consistent, professional legal-application aesthetic with no jarring colour or spacing inconsistencies across panels.
