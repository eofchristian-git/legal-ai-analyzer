# Plan: Legal Playbook Management System

## Summary

Replace the existing single-document markdown playbook with a structured rule management system. Each rule has defined fields (title, description, country, risk level, standard position, acceptable range, escalation trigger, negotiation guidance). The system supports full CRUD, versioned snapshots on save, audit trails, version history with restore, filtering, and integration with contract/NDA analysis. The UI follows the existing collapsible-card design reference with risk badges, a filter bar, and a version history sheet sidebar.

## User Story

As a **legal counsel**
I want to **manage individual playbook rules with clear audit trails and versioned snapshots**
So that **every contract analysis uses approved, traceable standards**

## Metadata

| Field | Value |
|-------|-------|
| Type | ENHANCEMENT (replaces existing feature) |
| Complexity | HIGH |
| Systems Affected | Prisma schema, Playbook API, Playbook UI, Contract analysis, NDA triage, Prompts builder |
| PRD | `.agents/PRDs/legal-playbook.prd.md` |
| Status | **COMPLETED** |
| Completed | 2026-02-10 |
| Branch | `ivku/playbook` |

---

## Completion Summary

All 16 tasks were implemented successfully. The playbook system was fully rebuilt from a single markdown document into a structured rule management system with CRUD, versioning, snapshots, restore, filtering, audit trails, and integration with contract/NDA analysis prompts.

### What Was Done

| Task | Description | Status |
|------|-------------|--------|
| Task 1 | Updated Prisma schema — added `PlaybookRule`, `PlaybookSnapshot`, `PlaybookSnapshotRule` models; replaced old `Playbook` model; added `playbookVersionId` to `ContractAnalysis` | DONE |
| Task 2 | Generated Prisma client with new models | DONE |
| Task 3 | Created `src/lib/countries.ts` — 30 business jurisdictions with ISO codes and flag emojis | DONE |
| Task 4 | Created `src/components/shared/risk-level-badge.tsx` — LOW/MEDIUM/HIGH/CRITICAL badges with color coding | DONE |
| Task 5 | Rewrote `src/app/api/playbook/route.ts` — GET with filtering (search, country, riskLevel), removed old PUT | DONE |
| Task 6 | Created `src/app/api/playbook/rules/route.ts` — POST for rule creation with auth + validation | DONE |
| Task 7 | Created `src/app/api/playbook/rules/[id]/route.ts` — PUT for updates, DELETE for soft-delete | DONE |
| Task 8 | Created `src/app/api/playbook/save/route.ts` — POST to create snapshot + increment version (atomic transaction) | DONE |
| Task 9 | Created `src/app/api/playbook/history/route.ts` and `[version]/route.ts` — list snapshots + detail view | DONE |
| Task 10 | Created `src/app/api/playbook/history/[version]/restore/route.ts` — restore snapshot as draft | DONE |
| Task 11 | Created `src/app/api/playbook/analyses/route.ts` — recent analyses with playbook version info | DONE |
| Task 12 | Rewrote `src/app/(app)/playbook/page.tsx` — full UI with rules list, filters, create/edit/delete dialogs, version history sheet, version info bar | DONE |
| Task 13 | Updated `src/lib/prompts.ts` — `PlaybookRuleForPrompt` type, `serializePlaybookRules()`, updated both prompt builders | DONE |
| Task 14 | Updated `src/app/api/contracts/[id]/analyze/route.ts` — structured playbook rules + version tracking | DONE |
| Task 15 | Updated `src/app/api/nda-triage/route.ts` — structured playbook rules integration | DONE |
| Task 16 | Final validation | DONE |

### Files Changed

| File | Action |
|------|--------|
| `prisma/schema.prisma` | UPDATED — new models |
| `src/lib/countries.ts` | CREATED |
| `src/components/shared/risk-level-badge.tsx` | CREATED |
| `src/app/api/playbook/route.ts` | UPDATED — rewritten |
| `src/app/api/playbook/rules/route.ts` | CREATED |
| `src/app/api/playbook/rules/[id]/route.ts` | CREATED |
| `src/app/api/playbook/save/route.ts` | CREATED |
| `src/app/api/playbook/history/route.ts` | CREATED |
| `src/app/api/playbook/history/[version]/route.ts` | CREATED |
| `src/app/api/playbook/history/[version]/restore/route.ts` | CREATED |
| `src/app/api/playbook/analyses/route.ts` | CREATED |
| `src/app/(app)/playbook/page.tsx` | UPDATED — complete rewrite |
| `src/lib/prompts.ts` | UPDATED — structured rules |
| `src/app/api/contracts/[id]/analyze/route.ts` | UPDATED — structured playbook |
| `src/app/api/nda-triage/route.ts` | UPDATED — structured playbook |

### Acceptance Criteria

- [x] Prisma schema has PlaybookRule, PlaybookSnapshot, PlaybookSnapshotRule models
- [x] Rules CRUD: create, read, edit, soft-delete all work via API
- [x] Save creates an immutable snapshot with all current rules and increments version
- [x] Version history lists all snapshots with author and date
- [x] Restore copies snapshot rules back as active draft rules
- [x] Filtering works for title/description search, country, and risk level
- [x] Audit trail: every rule has createdBy + createdAt, playbook has updatedBy
- [x] Contract analysis uses structured rules serialized as markdown
- [x] ContractAnalysis records store the playbook version used
- [x] NDA triage uses structured rules
- [x] UI shows version info bar, rules list, filter bar, rule dialogs, version history sheet
- [x] All role restrictions maintained (admin/legal for mutations)

---

*Generated: 2026-02-10*
*Completed: 2026-02-10*
*Status: COMPLETED*
