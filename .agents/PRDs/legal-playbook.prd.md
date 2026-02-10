# Legal Playbook Management System

## Problem Statement

Legal counsel currently manages contract negotiation positions through a single markdown document with no structure, no per-rule audit trail, and no versioned snapshots. When a contract is analyzed, there's no way to know which version of the playbook was used, who changed what, or when rules were modified. As the number of rules grows, the markdown blob becomes unmaintainable, unsearchable, and unauditable.

## Key Hypothesis

We believe structured, versioned playbook rules with audit trails will replace the current markdown-based playbook for legal counsel.
We'll know we're right when legal teams can create, filter, and version individual rules through a clean UI, and every contract analysis is traceable to a specific playbook version.

## Users

**Primary User**: Legal counsel — responsible for defining and maintaining the organization's standard contract positions, NDA criteria, and review policies.

**Job to Be Done**: When reviewing or updating our contract positions, I want to manage individual rules with clear audit trails, so I can ensure every contract analysis uses approved, traceable standards.

**Non-Users**: General employees without legal/admin roles (read-only access to playbook is not in scope).

## Solution

Replace the current single-document markdown playbook with a structured rule management system. Each rule has defined fields (title, description, country, risk level, standard position, acceptable range, escalation trigger, negotiation guidance). When the legal team confirms the playbook, a versioned snapshot is created that captures all rules at that point in time. The system tracks who created and last modified each rule. A version history sidebar lets users browse past snapshots. Filtering enables quick lookup by title, description, country, and risk level.

### MVP Scope

| Priority | Capability | Rationale |
|----------|------------|-----------|
| Must | **Structured rules with defined fields** — Title, Description (business context), Country (optional), Risk Level (Low/Medium/High/Critical), Standard Position, Acceptable Range, Escalation Trigger, Negotiation Guidance | Core data model; replaces unstructured markdown |
| Must | **CRUD for rules** — Create, edit, delete individual playbook rules via dialogs/forms | Legal counsel needs to manage rules individually |
| Must | **Versioned snapshots on save** — Each "Save Playbook" creates an immutable snapshot of all current rules and increments the version number | Enables traceability; know exactly which rules were active at any point |
| Must | **Audit trail** — Track which user created each rule and when; track which user last modified the playbook | Accountability and compliance requirement |
| Must | **Version history** — Sidebar showing all playbook versions with date, author, and version number; ability to view past snapshots | Legal teams need to review historical positions |
| Must | **Filtering** — Filter rules by title, description, country, and risk level | Quick lookup in growing rule sets |
| Must | **Integration with contract analysis** — Structured rules are serialized and passed to Claude during analysis; track which playbook version was used per analysis | Core value prop; AI analysis must use current approved rules |
| Must | **Recent Contract Analysis section** — Show which contracts used which version | Deferred; analysis tracking exists elsewhere |
| Should | **Version info bar** — Show current version, last updated date, and who last saved | Quick context for legal counsel |
| Should | **Diff view between versions** — Visual comparison of rule changes across versions | Nice to have; deferred to future iteration |
| Won't | **Approval workflow** — Submit for review → approved flow | Nice to have; deferred |
| Won't | **Export as PDF/markdown** — Download playbook in other formats | Nice to have; deferred |
| Won't | **Rule duplication** — Copy an existing rule as a starting point | Low priority convenience feature |

## Success Metrics

| Metric | Target | How Measured |
|--------|--------|--------------|
| Rule manageability | Legal counsel can create/edit/delete rules in < 30 seconds each | UI interaction flow |
| Audit completeness | 100% of rules have creator + creation timestamp; 100% of versions have author | Database constraints |
| Version reliability | Every "Save" produces an immutable snapshot with incremented version | Snapshot integrity check |
| Filter effectiveness | Rules filterable by all 4 dimensions (title, description, country, risk) | UI functionality |
| Analysis traceability | Every contract analysis references the playbook version used | Foreign key in analysis records |

## Resolved Decisions

- [x] **Versioning scheme**: Simple integer incrementing (v1, v2, v3) — straightforward, no ambiguity about major/minor/patch semantics for a legal document
- [x] **Restore historical version**: Yes — users can restore a past snapshot as the current draft (copies snapshot rules back to active rules)
- [x] **Rule deletion**: Soft-delete — rules are marked as deleted (hidden from UI) but preserved in the database for audit purposes
- [x] **Prompt serialization**: Structured rules serialized as markdown for the Claude prompt — consistent with existing skill file format and readable in prompts
- [x] **Country field**: Predefined dropdown with country list and flag icons — ensures consistency and enables reliable filtering

## Data Model

### New/Modified Prisma Models

```
PlaybookRule (active rules — mutable)
├── id                  String   @id @default(cuid())
├── title               String
├── description         String   (business context)
├── country             String?  (optional — ISO 3166-1 alpha-2 code from predefined list)
├── riskLevel           Enum     (LOW, MEDIUM, HIGH, CRITICAL)
├── standardPosition    String
├── acceptableRange     String
├── escalationTrigger   String
├── negotiationGuidance String
├── deleted             Boolean  @default(false)  ← soft-delete flag
├── createdBy           String   (user ID)
├── createdAt           DateTime @default(now())
├── updatedBy           String   (user ID)
├── updatedAt           DateTime @updatedAt
└── playbook            Playbook (relation)

Playbook (header — tracks current version, singleton)
├── id              String   @id @default(cuid())
├── version         Int      @default(0)  ← increments on each save; 0 = never saved
├── updatedBy       String?  (user ID — who last saved)
├── createdAt       DateTime @default(now())
├── updatedAt       DateTime @updatedAt
├── rules           PlaybookRule[]
└── snapshots       PlaybookSnapshot[]

PlaybookSnapshot (immutable version snapshot)
├── id              String   @id @default(cuid())
├── playbook        Playbook (relation)
├── version         Int      (version number at time of save)
├── createdBy       String   (user ID — who saved this version)
├── createdAt       DateTime @default(now())
└── rules           PlaybookSnapshotRule[]

PlaybookSnapshotRule (immutable copy of a rule at snapshot time)
├── id                  String   @id @default(cuid())
├── snapshot            PlaybookSnapshot (relation)
├── title               String
├── description         String
├── country             String?  (ISO 3166-1 alpha-2)
├── riskLevel           Enum
├── standardPosition    String
├── acceptableRange     String
├── escalationTrigger   String
├── negotiationGuidance String
├── originalRuleId      String   (reference to the source PlaybookRule at time of snapshot)
├── createdBy           String   (original rule creator)
├── originalCreatedAt   DateTime (when the original rule was created)
└── createdAt           DateTime @default(now()) (when snapshot was taken)
```

### Country Dropdown

Country field uses ISO 3166-1 alpha-2 codes (e.g., "US", "GB", "DE") stored as a string. The UI renders a predefined dropdown with country name + flag emoji (e.g., "🇺🇸 United States", "🇬🇧 United Kingdom"). A shared `COUNTRIES` constant provides the list.

### Soft-Delete Behavior

- `PlaybookRule.deleted` defaults to `false`
- DELETE endpoint sets `deleted = true` instead of removing the row
- All queries for active rules filter by `deleted = false`
- Snapshots preserve rules regardless of current soft-delete status (they capture point-in-time state)

### Version Restore

Restoring a historical version:
1. Soft-deletes all current active rules
2. Copies all rules from the selected snapshot back as new active `PlaybookRule` records
3. Does NOT increment the version (user must explicitly "Save Playbook" to create a new version from the restored state)

### Migration from Current Model

The existing `Playbook` model (single `content` field) will be replaced. A data migration is needed if any playbook data exists. The `content` field is dropped in favor of the `PlaybookRule` relation.

## API Design

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/api/playbook` | Get current playbook with all active rules (filtered by `deleted=false`) | All authenticated |
| POST | `/api/playbook/rules` | Create a new rule | admin, legal |
| PUT | `/api/playbook/rules/[id]` | Update an existing rule | admin, legal |
| DELETE | `/api/playbook/rules/[id]` | Soft-delete a rule (sets `deleted=true`) | admin, legal |
| POST | `/api/playbook/save` | Save playbook — create snapshot, increment version | admin, legal |
| GET | `/api/playbook/history` | Get all snapshots (version history) | All authenticated |
| GET | `/api/playbook/history/[version]` | Get a specific snapshot with its rules | All authenticated |
| POST | `/api/playbook/history/[version]/restore` | Restore a historical snapshot as the current draft | admin, legal |
| GET | `/api/playbook/analyses` | Get recent contract analyses with playbook version used | All authenticated |

## UI Structure

### Main Page (`/playbook`)

Based on the provided design reference:

1. **Page Header** — Title "Legal Playbook", description, "Version History" button, "Save Playbook" button
2. **Version Info Bar** — Current version badge, last updated date + author
3. **Filter Bar** — Search by title/description, country dropdown, risk level filter
4. **Rules List** — Collapsible cards, each rule shows:
   - Title with risk level badge (color-coded: green/yellow/orange/red)
   - Description (business context)
   - Country (if set)
   - Standard Position, Acceptable Range, Escalation Trigger, Negotiation Guidance
   - Edit and Delete action buttons
   - Created by / last modified metadata
5. **Add Rule** — Button opens a dialog/form with all rule fields
6. **Version History Sidebar** — Slide-out panel listing all versions with date, author, version number

### Rule Form (Dialog)

Fields:
- Title (required, text input)
- Description — Business Context (required, textarea)
- Country (optional, predefined dropdown with flag icons — ISO 3166-1 alpha-2 codes)
- Risk Level (required, select: Low / Medium / High / Critical)
- Standard Position (required, textarea)
- Acceptable Range (required, textarea)
- Escalation Trigger (required, textarea)
- Negotiation Guidance (required, textarea)

## Implementation Phases

| # | Phase | Description | Status | Depends |
|---|-------|-------------|--------|---------|
| 1 | **Database Schema** | Create new Prisma models (PlaybookRule, PlaybookSnapshot, PlaybookSnapshotRule), update Playbook model with soft-delete support, add playbook version FK to analysis models, run migration | pending | - |
| 2 | **API Layer — Rules CRUD** | Implement POST/PUT/DELETE (soft-delete) for rules, update GET for structured rules with filtering support | pending | 1 |
| 3 | **API Layer — Versioning** | Implement save (snapshot + version increment), history listing, snapshot detail, and restore endpoints | pending | 1 |
| 4 | **UI — Rules Management** | Rules list with collapsible cards, create/edit/delete dialogs, risk badges, country dropdown with flags, filtering bar (title, description, country, risk level) | pending | 2 |
| 5 | **UI — Versioning & History** | Save button, version info bar, version history sidebar with snapshot viewing and restore action | pending | 3, 4 |
| 6 | **Analysis Integration** | Update contract/NDA analysis to serialize structured rules as markdown for Claude prompt; store playbook version on analysis records; recent analysis endpoint | pending | 2 |
| 7 | **UI — Recent Analysis Section** | Section on playbook page showing recent contract analyses with which playbook version was used | pending | 6 |
| 8 | **UI — Diff View (Should)** | Visual comparison of rule changes between two playbook versions | pending | 5 |

---

*Generated: 2026-02-10*
*Updated: 2026-02-10 — all open questions resolved*
*Status: DRAFT - ready for approval*
