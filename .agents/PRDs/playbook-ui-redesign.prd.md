# Playbook UI Redesign

## Problem Statement

The legal team manages contract playbook rules through a flat, unstructured list UI that feels like a prototype rather than a professional legal ops tool. Rules lack categorical organization, the country filter has no flag icons, the risk level filter is a plain dropdown, and the unsaved changes banner awkwardly pops over rule content. As the rule count grows, finding and managing rules by domain becomes increasingly painful.

## Key Hypothesis

We believe grouping rules into 7 legal domain categories with inline editing, flag-enriched dropdowns, and a polished unsaved-changes UX will make the playbook feel like a professional legal tool the team trusts and enjoys using.
We'll know we're right when the UI feels structured, efficient, and visually sufficient for daily legal ops work.

## Users

**Primary User**: Legal team members (admin, legal roles) who create, edit, and organize contract playbook rules daily.

**Job to Be Done**: When managing contract rules, I want to browse and edit them by category inline, so I can maintain the playbook efficiently without friction.

**Non-Users**: Compliance-role users (read-only access to playbook). External stakeholders.

## Solution

Transform the playbook from a flat rule list into a grouped, accordion-based interface organized by 7 predefined legal domain categories. Each group is collapsible and contains its rules. Rule creation and editing happen inline within the group context (not in a separate modal). The page header gets professional branding ("Global Playbook v.6"), country dropdowns show flag icons everywhere, and the unsaved changes indicator moves to a persistent sticky bottom bar instead of an intrusive inline banner.

### MVP Scope

| # | Priority | Capability | Rationale |
|---|----------|------------|-----------|
| 1 | Must | **Rule Groups DB model** — Add `PlaybookGroup` model with 7 seeded categories (Core Legal, Compliance, Commercial, Operational, Contract Lifecycle, Legal Framework, Boilerplate). Add `groupId` FK to `PlaybookRule`. Seed script populates groups on first run. | Foundation for all grouped UI. Without this, no grouping is possible. |
| 2 | Must | **Grouped accordion UI** — Replace flat rule list with collapsible group sections. Each group header shows group name, rule count, and expand/collapse toggle. Expanding a group reveals its rules. | Core UX improvement — the main ask. |
| 3 | Must | **Inline rule create/edit** — Replace modal dialog with an inline form that appears inside the group when "Add Rule" or "Edit" is clicked. Form fields remain the same but render within the group context. The group context auto-sets the group association. | Eliminates context-switching. Rules are created "in place" under their category. |
| 4 | Must | **Page header rebrand** — Replace "Legal Playbook" / "Version 6" with a professional title like "Global Playbook v.6". Redesign the version info bar to feel more polished. | Quick win, sets professional tone. Suggested format: "Global Playbook" as title, "v.6" as version badge beside it. |
| 5 | Must | **Country flag icons in dropdowns** — Add flag emoji/icons to the country filter dropdown AND the rule form's country select. Currently flags exist in the data (`countries.ts`) but the filter dropdown doesn't render them. | Visual polish — legal teams work across jurisdictions and flags provide instant recognition. |
| 6 | Must | **Country flag display fix on rules** — Ensure country flags render correctly on rule cards/rows, not just as tooltips. | Bug fix — flags should be visible, not hidden behind hover. |
| 7 | Should | **Risk level filter redesign** — Replace the plain risk level dropdown with a more engaging UI: segmented toggle buttons (pill-style) with color-coded indicators (emerald/amber/orange/red) so the user can see and click risk levels visually. | Feels more interactive and professional than a generic dropdown. Provides instant visual mapping to risk severity. |
| 8 | Must | **Unsaved changes — sticky bottom bar** — Replace the amber inline banner that pops above rules with a sticky bottom bar (fixed to viewport bottom). Shows change summary (added/edited/removed counts), "Discard" and "Save" actions. Slides up when dirty, slides down when clean. Does not interfere with rule content. | Modern pattern used by Figma, Notion, VS Code settings. Non-intrusive, always accessible, doesn't push content around. |
| 9 | Should | **Snapshot/history compatibility** — Update save and restore flows to persist `groupId` on rules. Snapshot rules should carry their group association so restoring a version preserves grouping. | Without this, restoring an old version would lose group assignments. |
| 10 | Won't | **Custom user-defined groups** — Users cannot create/rename/delete groups in MVP. The 7 groups are fixed/seeded. | Keep scope manageable. Can add later if needed. |
| 11 | Won't | **Drag-and-drop reordering** — Moving rules between groups or reordering within groups via drag. | Nice-to-have but adds significant complexity. Revisit post-MVP. |
| 12 | Won't | **Group-level permissions** — Different roles for different groups. | Over-engineering for current team size. |

## Design Decisions

### Unsaved Changes — Sticky Bottom Bar (Recommended)

**Why not the current inline banner?** It pushes content down, competes with rules for attention, and feels jarring when it appears/disappears.

**Recommended: Sticky bottom action bar**
- Fixed to viewport bottom, full width of content area
- Subtle slide-up animation on first dirty change
- Shows: change summary text + "Discard" (ghost) + "Save Playbook" (primary)
- Translucent/frosted-glass backdrop for modern feel
- Disappears (slides down) after save or discard
- Precedent: Figma's unsaved indicator, VS Code settings, Shopify admin

### Group Accordion Behavior

- All groups collapsed by default on page load
- Click group header to expand/collapse
- Expanded group shows its rules as collapsible cards (existing card pattern)
- "Add Rule" button inside each group header (visible when expanded)
- Empty groups show a subtle empty state: "No rules in this category yet. Add one."
- Filter bar still works — filters apply within groups, empty groups auto-hide when filtering

### Inline Create/Edit Form

- Clicking "Add Rule" in a group header inserts a form card at the top of that group's rule list
- Clicking "Edit" on a rule replaces the rule card with the edit form in-place
- Only one form can be open at a time (opening a new form closes any existing one)
- Cancel button reverts to normal view
- Form fields identical to current modal, minus group selection (auto-assigned)

### Risk Level Filter — Segmented Pill Toggle

- Horizontal row of 4 pill buttons: LOW | MEDIUM | HIGH | CRITICAL
- Each pill color-coded to match risk level palette
- Click to toggle filter (active = filled, inactive = outline)
- "All" state = no pills selected (or a separate "All" pill)
- Replaces the `<Select>` dropdown entirely

## DB Schema Changes

```prisma
model PlaybookGroup {
  id          String         @id @default(cuid())
  name        String         @unique
  slug        String         @unique
  sortOrder   Int            @default(0)
  description String?
  createdAt   DateTime       @default(now())
  updatedAt   DateTime       @updatedAt
  rules       PlaybookRule[]
}

model PlaybookRule {
  // ... existing fields ...
  groupId     String?              // nullable for migration safety
  group       PlaybookGroup?       @relation(fields: [groupId], references: [id])
}

model PlaybookSnapshotRule {
  // ... existing fields ...
  groupId     String?              // preserve group association in snapshots
  groupName   String?              // denormalized for snapshot independence
}
```

### Seed Data

| # | Name | Slug | Sort Order | Description |
|---|------|------|------------|-------------|
| 1 | Core Legal | core-legal | 1 | Fundamental legal provisions — liability, indemnification, IP, warranties |
| 2 | Compliance | compliance | 2 | Regulatory and compliance requirements — data protection, anti-bribery, export controls |
| 3 | Commercial | commercial | 3 | Business and financial terms — pricing, payment, SLAs, performance |
| 4 | Operational | operational | 4 | Day-to-day operational clauses — reporting, audit rights, subcontracting |
| 5 | Contract Lifecycle | contract-lifecycle | 5 | Term, renewal, termination, transition, and exit provisions |
| 6 | Legal Framework | legal-framework | 6 | Governing law, dispute resolution, jurisdiction, force majeure |
| 7 | Boilerplate | boilerplate | 7 | Standard clauses — notices, amendments, severability, entire agreement |

## Success Metrics

| Metric | Target | How Measured |
|--------|--------|--------------|
| UI feels professional and structured | Subjective approval from user | User feedback ("I love it") |
| Rules are findable by category | All rules assigned to a group | DB query — no orphan rules |
| Inline editing reduces friction | No modal context-switching | No dialog/modal for create/edit |
| Unsaved changes are non-intrusive | Bottom bar doesn't overlap content | Visual inspection |

## Resolved Questions

- [x] **Existing rules migration**: Auto-assign to "Boilerplate" as default group.
- [x] **Group filter control**: Accordion expand/collapse is sufficient — no separate group filter needed.
- [x] **Title linking**: No — "Global Playbook" is just a label, not a link.
- [x] **Snapshot restore grouping**: Keep original group assignment. Group names are stable and won't change.

## Implementation Phases

| # | Phase | Description | Status | Depends |
|---|-------|-------------|--------|---------|
| 1 | DB schema + seed | Add `PlaybookGroup` model, add `groupId` to `PlaybookRule` and `PlaybookSnapshotRule`, create seed script, run migration | pending | - |
| 2 | API updates | Update GET/POST playbook endpoints to include group data, update save flow to persist groupId, update snapshot to store groupName | pending | 1 |
| 3 | Page header + version bar | Rebrand to "Global Playbook v.X", polish version info section | pending | - |
| 4 | Grouped accordion UI | Replace flat list with group-based accordion sections, wire up expand/collapse, render rules within groups | pending | 1, 2 |
| 5 | Inline create/edit forms | Replace modal with inline form inside group context, auto-assign groupId | pending | 4 |
| 6 | Country flags everywhere | Add flag rendering to country filter dropdown, rule form select, and rule display | pending | - |
| 7 | Risk level pill toggle | Replace risk dropdown with segmented color-coded pill buttons | pending | - |
| 8 | Sticky bottom bar | Replace unsaved changes banner with fixed bottom action bar, add slide animation | pending | - |
| 9 | Snapshot compatibility | Update save/restore to handle groupId and groupName in snapshots | pending | 1, 2 |
| 10 | Polish + QA | Visual consistency pass, edge cases (empty groups, filter interactions, responsive behavior) | pending | 3-9 |

---

*Generated: 2026-02-10*
*Status: APPROVED — ready for implementation*
