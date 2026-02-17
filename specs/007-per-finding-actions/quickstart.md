# Quickstart: Per-Finding Decision Actions

**Feature**: 007-per-finding-actions

## Prerequisites

- Feature 006 (Clause Decision Actions) fully implemented and working
- Node.js 20+, npm
- SQLite database with existing schema

## Implementation Order

### Phase 1: Schema Migration

```bash
# 1. Update prisma/schema.prisma (add findingId to ClauseDecision, add relation to AnalysisFinding)
# 2. Push schema changes
npx prisma db push
# 3. Regenerate Prisma client
npx prisma generate
```

**Verify**: `npx prisma studio` → ClauseDecision table has `findingId` column (nullable)

### Phase 2: Type Updates

Update `src/types/decisions.ts`:
- Add `FindingStatusValue` type
- Add `FindingStatusEntry` interface
- Add `DerivedClauseStatus` type (PENDING | PARTIALLY_RESOLVED | RESOLVED | ESCALATED | NO_ISSUES)
- Extend `ProjectionResult` with `findingStatuses`, `resolvedCount`, `totalFindingCount`
- Change `effectiveStatus` type from `ClauseStatus` to `DerivedClauseStatus`

### Phase 3: Projection Engine

Rewrite `src/lib/projection.ts`:
- Filter out legacy decisions (findingId=null) from projection computation
- Group decisions by findingId
- Add `computeFindingStatuses()` — replays per-finding decisions independently
- Add `deriveClauseStatus()` — aggregates finding statuses into clause status
- Return enhanced `ProjectionResult` with `findingStatuses`, `resolvedCount`, `totalFindingCount`

### Phase 4: Permissions

Update `src/lib/permissions.ts`:
- Add `canMakeDecisionOnFinding()` that checks:
  - User has REVIEW_CONTRACTS
  - If THIS finding is escalated: only assigned approver or admin can decide
  - Other findings remain actionable regardless

### Phase 5: API Routes

Update `src/app/api/clauses/[id]/decisions/route.ts`:
- POST: **Require** `findingId` (return 400 if missing)
- POST: Validate finding exists and belongs to clause
- POST: Finding-level escalation lock check (only check THIS finding's status)
- GET: Include `findingId`, finding info, and `isLegacy` flag in response

Update `src/app/api/clauses/[id]/projection/route.ts`:
- GET: Return `findingStatuses`, `resolvedCount`, `totalFindingCount` (computed by projection engine)

### Phase 6: UI Components

1. Create `src/app/(app)/contracts/[id]/_components/finding-actions.tsx`:
   - Per-finding action button group (Accept, Apply Fallback, Escalate, Note, Undo, Revert)
   - Loading states, permission checks, escalation lock per finding
   - Status badges (Accepted, Escalated, Fallback Applied)

2. Update `findings-panel.tsx`:
   - Import and render `FindingActions` on each finding card
   - Pass `projection.findingStatuses` to each finding
   - Add "Accept All" and "Reset All" shortcut buttons above findings list
   - Remove reference to old `decision-buttons.tsx`

3. Remove/replace `decision-buttons.tsx`:
   - Clause-level buttons no longer needed
   - May keep the file but gut the content, or delete and update imports

4. Update `clause-list.tsx`:
   - Add resolution progress indicator: `{resolvedCount}/{totalFindingCount}` per clause
   - Add green checkmark for fully resolved clauses
   - Add warning icon for clauses with escalated findings
   - Add "No issues" label for zero-finding clauses
   - Add resolution status filter (All | Pending | In Progress | Resolved | Escalated)

5. Update `decision-history-log.tsx`:
   - Add finding filter dropdown
   - Show finding badge (title + risk level) on each decision
   - Show "Legacy" label for decisions with null findingId
   - Disable undo for legacy decisions

6. Update `page.tsx`:
   - Pass `findingStatuses`, `resolvedCount`, `totalFindingCount` to child components
   - Pass projection data to `clause-list.tsx` for resolution progress display

## Verification Steps

1. **Schema**: Open Prisma Studio, verify `findingId` column exists on ClauseDecision
2. **API**: POST a decision without `findingId` → expect 400 error
3. **API**: POST a finding-level decision → verify `findingId` stored correctly
4. **Projection**: GET projection → verify `findingStatuses` map and `resolvedCount`/`totalFindingCount`
5. **UI**: Click Accept on a finding card → only that finding shows Accepted badge
6. **Clause list**: Verify `{resolved}/{total}` updates after accepting a finding
7. **Full resolution**: Accept all findings in a clause → clause shows green "Resolved" in left panel
8. **Undo**: Undo a finding decision → `resolvedCount` decrements, clause status changes back
9. **Accept All**: Click Accept All → all non-escalated findings accepted, clause resolves
10. **Reset All**: Click Reset All → all findings revert to PENDING
11. **Escalation**: Escalate one finding → only that finding locked, others actionable
12. **Legacy**: Existing clause-level decisions show "Legacy" label in history, don't affect projection

## Key Files

| File | Change Type | Description |
|------|-------------|-------------|
| `prisma/schema.prisma` | Modify | Add findingId, relation, index |
| `src/types/decisions.ts` | Modify | Add FindingStatus, DerivedClauseStatus types; extend ProjectionResult |
| `src/lib/projection.ts` | Modify | Finding-only projection, deriveClauseStatus(), skip legacy |
| `src/lib/permissions.ts` | Modify | Finding-level escalation lock |
| `src/app/api/clauses/[id]/decisions/route.ts` | Modify | Require findingId, validate, store |
| `src/app/api/clauses/[id]/projection/route.ts` | Modify | Return findingStatuses, resolvedCount, totalFindingCount |
| `src/app/(app)/contracts/[id]/_components/finding-actions.tsx` | New | Per-finding action buttons |
| `src/app/(app)/contracts/[id]/_components/findings-panel.tsx` | Modify | Render FindingActions, add Accept All/Reset All |
| `src/app/(app)/contracts/[id]/_components/decision-buttons.tsx` | Remove/Replace | Clause-level buttons removed |
| `src/app/(app)/contracts/[id]/_components/clause-list.tsx` | Modify | Resolution progress, status filter |
| `src/app/(app)/contracts/[id]/_components/decision-history-log.tsx` | Modify | Finding filter, badges, legacy label |
| `src/app/(app)/contracts/[id]/page.tsx` | Modify | Pass resolution data to components |
