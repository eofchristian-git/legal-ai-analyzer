# Tasks: Contract Review — Professional Legal UI/UX

**Input**: Design documents from `/specs/002-contract-review-ux/`
**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅, contracts/ ✅, quickstart.md ✅

**Tests**: Not requested — no test tasks included.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Database schema changes required by all user stories

- [x] T001 Update Prisma schema — add `NegotiationItem` model and `excerpt` field on `AnalysisFinding` in `prisma/schema.prisma`
- [x] T002 Run Prisma migration to create `NegotiationItem` table and add `excerpt` column on `AnalysisFinding`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Backend AI prompt, parser, API route, and type changes that MUST be complete before any UI story begins

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [x] T003 [P] Update AI prompt to add `excerpt` field per finding and restructure `negotiationStrategy` as JSON array in `src/lib/prompts.ts`
- [x] T004 [P] Update analysis parser to handle `excerpt` on findings and parse `negotiationStrategy` as array (with string fallback) in `src/lib/analysis-parser.ts`
- [x] T005 [P] Update TypeScript types — add `excerpt` on `Finding`, add `NegotiationItem` interface, add `negotiationItems` on `AnalysisWithClauses` in `src/app/(app)/contracts/[id]/_components/types.ts`
- [x] T006 Update analyze route to persist `excerpt` on each `AnalysisFinding` and create `NegotiationItem` rows in `src/app/api/contracts/[id]/analyze/route.ts`
- [x] T007 [P] Update GET contract endpoint to include `negotiationItems` (ordered by position) in response in `src/app/api/contracts/[id]/route.ts`

**Checkpoint**: Foundation ready — all backend data flows support excerpt highlighting and structured negotiation items. UI story implementation can now begin.

---

## Phase 3: User Story 1 — Clause List with Triage Visibility (Priority: P1) 🎯 MVP

**Goal**: Clause list shows triage progress per clause — reviewer can instantly see which clauses still need attention without clicking into each one.

**Independent Test**: Triage one finding, then verify the parent clause row updates its progress indicator in the list. Verify finalized analyses show locked state on all clauses.

### Implementation for User Story 1

- [x] T008 [US1] Add triage progress indicators (ratio badge, completion checkmark, green border accent) and finalized lock style to `src/app/(app)/contracts/[id]/_components/clause-list.tsx`

**Checkpoint**: Clause list now shows triage state — "2/3 triaged" progress, ✓ for fully triaged, lock icon when finalized.

---

## Phase 4: User Story 2 — Professional Clause Text Panel (Priority: P1)

**Goal**: Clause text panel looks like a professional legal document — serif font, risk summary banner, highlighted finding excerpts within the clause body.

**Independent Test**: Select a clause with RED findings and verify: serif font rendering, risk banner shows "High" with count, finding excerpts are highlighted in red within the clause text. Select a clause with zero findings and verify clean display with no highlights or banner.

### Implementation for User Story 2

- [x] T009 [US2] Enhance clause text panel — system serif font stack, legal-style header, risk summary banner, and inline excerpt highlighting with risk-coloured marks in `src/app/(app)/contracts/[id]/_components/clause-text.tsx`

**Checkpoint**: Clause text reads like a legal document. Finding excerpts glow in risk colours. Risk banner gives instant severity context.

---

## Phase 5: User Story 3 — Refined Findings & Triage Panel (Priority: P1)

**Goal**: Findings panel shows severity-sorted cards with coloured risk borders, prominent triage decision banners, and locked read-only style when finalized.

**Independent Test**: View findings for a clause with mixed severities — confirm RED → YELLOW → GREEN sort order, coloured left borders, and triage decision banners with reviewer name/time. Verify finalized analysis shows muted locked cards with no triage buttons.

### Implementation for User Story 3

- [x] T010 [P] [US3] Update severity badge with accessible text labels — "High" / "Medium" / "Low" alongside icons in `src/components/shared/severity-badge.tsx`
- [x] T011 [US3] Enhance findings panel — severity sort, risk-coloured left border stripes, full-width triage decision banners, and finalized locked/read-only card style in `src/app/(app)/contracts/[id]/_components/findings-panel.tsx`
- [x] T012 [P] [US3] Update triage controls to fully hide buttons when analysis is finalized in `src/app/(app)/contracts/[id]/_components/triage-controls.tsx`

**Checkpoint**: Findings are scannable by severity. Triage decisions are prominent. Finalized analyses are visually locked.

---

## Phase 6: User Story 4 — Structured Negotiation Strategy (Priority: P2)

**Goal**: Negotiation strategy displays as structured, expandable priority cards (P1/P2/P3) instead of a raw Markdown blob. Legacy analyses fall back to Markdown rendering.

**Independent Test**: Run a new analysis and verify negotiation strategy shows as priority cards sorted P1 → P2 → P3 with colour-coded badges, expandable descriptions, and summary header counts. Load a legacy analysis and verify the Markdown fallback renders correctly.

### Implementation for User Story 4

- [x] T013 [US4] Create `negotiation-strategy.tsx` component — priority cards with expand/collapse, summary header with per-priority counts, legacy Markdown fallback in `src/app/(app)/contracts/[id]/_components/negotiation-strategy.tsx`
- [x] T014 [US4] Wire `NegotiationStrategy` component into page replacing `MarkdownViewer` for negotiation section in `src/app/(app)/contracts/[id]/page.tsx`

**Checkpoint**: Negotiation strategy is structured and scannable. P1 items jump out. Legacy analyses still work.

---

## Phase 7: User Story 5 — Overall Page Polish & Legal Aesthetic (Priority: P2)

**Goal**: Consistent professional legal-application styling across the entire contract analysis page — refined header bar, muted professional colour palette, subtle borders and shadows.

**Independent Test**: Visually inspect the page on desktop viewport — header bar groups metrics with dividers, colour palette is consistent (deep navy/slate/muted risk colours), all panels share consistent card styling and spacing.

### Implementation for User Story 5

- [x] T015 [US5] Refine analysis header bar — group metrics into distinct sections with vertical dividers, apply legal colour palette, and ensure consistent spacing across all panels in `src/app/(app)/contracts/[id]/page.tsx`

**Checkpoint**: Page looks like a professional legal review tool. No neon colours, no jarring spacing. Consistent aesthetic.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Export updates and build verification that span multiple user stories

- [x] T016 [P] Add `excerpt` column to CSV export in `src/lib/export/csv-export.ts`
- [x] T017 [P] Add `excerpt` column to PDF export in `src/lib/export/pdf-export.ts`
- [x] T018 Update export API route to pass `excerpt` field in export data in `src/app/api/contracts/[id]/export/route.ts`
- [x] T019 Build verification — run `npm run build` and `npm run lint` to confirm zero errors

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion — BLOCKS all user stories
- **User Stories (Phase 3–7)**: All depend on Foundational phase completion
  - US1, US2, US3 (P1 stories) can proceed in parallel after Phase 2
  - US4 depends on Phase 2 (needs NegotiationItem types + data)
  - US5 depends on US4 completion (both modify `page.tsx`)
- **Polish (Phase 8)**: Depends on Phase 2 completion (needs excerpt field available); can run in parallel with UI stories

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Phase 2 — modifies `clause-list.tsx` only
- **User Story 2 (P1)**: Can start after Phase 2 — modifies `clause-text.tsx` only
- **User Story 3 (P1)**: Can start after Phase 2 — modifies `findings-panel.tsx`, `triage-controls.tsx`, `severity-badge.tsx`
- **User Story 4 (P2)**: Can start after Phase 2 — creates `negotiation-strategy.tsx`, modifies `page.tsx`
- **User Story 5 (P2)**: Depends on US4 (T014 modifies `page.tsx` first) — modifies `page.tsx`

### Within Each User Story

- Types/models before UI components
- Core component before page integration
- Story complete before moving to next priority

### Parallel Opportunities

**Phase 2 (Foundational)**:
```
Parallel batch 1: T003, T004, T005, T007 (all different files)
Sequential: T006 (depends on T003 + T004 for parser/prompt alignment)
```

**P1 User Stories (after Phase 2 completes)**:
```
Parallel: T008 (US1, clause-list.tsx)
          T009 (US2, clause-text.tsx)
          T010 (US3, severity-badge.tsx)
          T011 (US3, findings-panel.tsx)
          T012 (US3, triage-controls.tsx)
```

**Phase 8 (Polish)**:
```
Parallel: T016 (csv-export.ts), T017 (pdf-export.ts)
Sequential: T018 (depends on T016/T017 interface alignment)
```

---

## Parallel Example: All P1 Stories at Once

```bash
# After Phase 2 completes, launch all P1 stories simultaneously:
T008: "Add triage progress indicators to clause-list.tsx"         # US1
T009: "Enhance clause text panel with serif font + highlights"     # US2
T010: "Update severity-badge.tsx with accessible labels"           # US3
T011: "Enhance findings-panel.tsx with severity sort + borders"    # US3
T012: "Update triage-controls.tsx hide when finalized"             # US3
```

---

## Implementation Strategy

### MVP First (User Stories 1 + 2 + 3)

1. Complete Phase 1: Setup (schema + migration)
2. Complete Phase 2: Foundational (prompt, parser, API, types)
3. Complete Phase 3–5: US1 + US2 + US3 (all P1 stories, parallel)
4. **STOP and VALIDATE**: Test all three P1 stories independently
5. Deploy/demo — core legal UX is live

### Incremental Delivery

1. Setup + Foundational → Backend ready
2. US1 + US2 + US3 → P1 complete → Deploy (legal document aesthetic + triage visibility)
3. US4 → Structured negotiation → Deploy (actionable priority cards)
4. US5 → Page polish → Deploy (consistent professional aesthetic)
5. Polish → Export updates + verification → Final deployment

### File Modification Map

| File | Tasks |
|------|-------|
| `prisma/schema.prisma` | T001 |
| `src/lib/prompts.ts` | T003 |
| `src/lib/analysis-parser.ts` | T004 |
| `src/app/(app)/contracts/[id]/_components/types.ts` | T005 |
| `src/app/api/contracts/[id]/analyze/route.ts` | T006 |
| `src/app/api/contracts/[id]/route.ts` | T007 |
| `src/app/(app)/contracts/[id]/_components/clause-list.tsx` | T008 |
| `src/app/(app)/contracts/[id]/_components/clause-text.tsx` | T009 |
| `src/components/shared/severity-badge.tsx` | T010 |
| `src/app/(app)/contracts/[id]/_components/findings-panel.tsx` | T011 |
| `src/app/(app)/contracts/[id]/_components/triage-controls.tsx` | T012 |
| `src/app/(app)/contracts/[id]/_components/negotiation-strategy.tsx` | T013 (NEW) |
| `src/app/(app)/contracts/[id]/page.tsx` | T014, T015 |
| `src/lib/export/csv-export.ts` | T016 |
| `src/lib/export/pdf-export.ts` | T017 |
| `src/app/api/contracts/[id]/export/route.ts` | T018 |

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story is independently completable and testable
- No new npm dependencies required (system serif font stack, existing shadcn/ui primitives)
- Legacy analyses with no `NegotiationItem` rows fall back to Markdown rendering — no migration needed
- `excerpt` defaults to `""` for existing findings — backward compatible
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
