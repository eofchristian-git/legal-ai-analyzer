# Quickstart: Collabora Viewer Reliability & UX Fixes

**Feature**: 011-collabora-viewer-fixes
**Date**: 2026-02-19

---

## Prerequisites

- Collabora CODE running via Docker (`docker-compose up`)
- Next.js dev server running (`npm run dev`)
- A contract with completed analysis and at least one clause with a fallback suggestion loaded

---

## Empirical Validations (Do First)

These validations must be performed against the running Collabora instance **before** implementing the fixes that depend on them. Each takes < 5 minutes.

### V1 — Validate `ReadOnly: true` in CheckFileInfo (Research R1/R5)

1. Temporarily add `ReadOnly: true` to the `CheckFileInfoResponse` returned by `GET /api/wopi/files/[fileId]`
2. Open any contract in the viewer
3. **Check A**: Can you type anywhere in the document? (Expected: no)
4. **Check B**: Open browser devtools → Network tab → look for postMessage traffic → trigger a clause click (navigation) → does `ExecuteSearch` command succeed?
5. **Check C**: Do the existing risk-level highlights still appear correctly?

**If A=no, B=yes, C=yes** → `ReadOnly: true` is safe. Proceed with implementation.
**If B=no** → Do NOT add `ReadOnly: true`. Use transparent overlay only (already planned as layer 2).

### V2 — Validate Bookmark UNO Commands (Research R2) — ❌ FAILED

**Result**: `.uno:InsertBookmark` dispatched via `Send_UNO_Command` postMessage opens the native "Insert Bookmark" dialog to the user instead of silently inserting a bookmark. The `Args` with `Bookmark.Name` are not consumed programmatically. There is no non-dialog alternative available through the Collabora postMessage channel.

**Consequence**: All bookmark-based navigation abandoned. Navigation uses enhanced text-search with extended normalization (T005) exclusively. `anchor.ts` functions are no-ops. See research.md §R2.

### V3 — Validate Formatting UNO Commands (Research R6)

**Background**: `.uno:Strikeout` dispatched with empty `{}` args opens the Character dialog instead of toggling strikethrough. `.uno:Color` with wrong arg name `FontColor.Color` may also open a dialog. Root cause: Collabora's `sendUnoCommand()` sends `uno .uno:Cmd {}` to LibreOffice core, which interprets `{}` as "args provided but empty" → dialog dispatch path.

**Fix applied**:
1. `executeUnoCommand` in `use-collabora-postmessage.ts` now filters empty objects — sends `Args: ""` instead of `Args: {}`
2. Toggle commands (`.uno:Strikeout`, `.uno:Bold`) called with no args
3. `.uno:Color` arg name fixed from `FontColor.Color` to `FontColor`

**Validation after fix**:
1. Open a contract, apply "Accept Fallback" on a clause
2. **Check A**: No dialog popups appear during the entire 11-step redline sequence
3. **Check B**: Strikethrough + gray text appears on original excerpt
4. **Check C**: Green bg + bold + dark green text appears on replacement
5. Undo the fallback
6. **Check D**: No dialog popups during undo sequence
7. **Check E**: Original text restored with risk highlight, no stray characters

**If any dialogs appear** → The specific command is still dialog-based. Document which command and find the correct silent alternative.

---

## Implementation Order

Follow this order to verify each fix independently before integrating:

### Step 1: Fix Undo Bug (Fix 5)
File: `use-undo-redline.ts`

Replace the `GoLeft`-based insertion selection in Phase 1 with `ExecuteSearch(insertedText)`. Test:
- Apply fallback to a clause → undo → confirm original text intact, no extra characters
- Test with fallback text containing en-dashes, curly quotes, and long phrases

### Step 2: Fix Redline Reliability (Fix 4)
File: `use-fallback-redline.ts`

Replace `GoLeft`-based re-selection in step 6 with `ExecuteSearch(replacementText)`. Increase delays to 500ms. Test:
- Apply fallback → confirm strikethrough + green insertion appears every time (test 5+ times)
- Test with short clause excerpts (< 20 chars) and long excerpts (> 200 chars)

### Step 3: Read-Only Mode (Fix 1)
Files: `route.ts` (WOPI), `collabora-document-viewer.tsx` (overlay div)

Add `ReadOnly: true` (if V1 passed) + transparent overlay div. Test:
- Click in document → confirm cannot type
- Scroll document → confirm still works
- Click clause in left panel → confirm navigation still works

### Step 4: Enhanced Text-Search Navigation (Fix 3)
Files: `anchor.ts` (no-ops), `navigation.ts`, `use-clause-navigation.ts`

Implement extended text normalization and progressive fallback. No bookmark embedding (V2 failed). Test:
- Open contract → click each clause → confirm navigation reaches correct location via text search
- Test a clause with en-dashes or smart quotes → confirm normalization handles mismatches
- Test a clause where navigation fails → confirm "Not found" indicator shown in left panel

### Step 5: Preparation Phase (Fix 2)
Files: `collabora-document-viewer.tsx`

Add preparation state machine and "Preparing document…" overlay. Test:
- Open contract for first time → overlay shown → disappears when ready
- Open same contract again → overlay shown very briefly (or not at all if highlights cached)

### Step 6: Pending Queue (Fix 6)
Files: `use-pending-document-queue.ts` (new), `page.tsx`, decision button component

Implement queue and drain-on-mount. Test:
- Apply fallback while viewer panel is collapsed/hidden → open viewer → confirm redline appears
- Apply multiple decisions while viewer closed → open viewer → all applied in order

---

## Verification Checklist

After all fixes are implemented, verify end-to-end:

- [ ] Open contract → no editing toolbars visible on first render
- [ ] Open contract → risk highlights present on first visible frame (no flash)
- [ ] Click all 5+ clauses in left panel → 95%+ navigate correctly (text-search with normalization)
- [ ] Accept fallback on 3 different clauses → strikethrough + insertion correct every time
- [ ] Undo those 3 fallbacks → all revert cleanly, no stray characters
- [ ] Apply fallback while viewer closed → open viewer → redline present
- [ ] Cause a save failure (temporarily break WOPI endpoint) → error toast appears → change retried on reopen
- [ ] Navigate between contract pages (SPA navigation) and return → pending queue intact
- [ ] Hard refresh page → pending queue cleared (expected behavior, not a bug)

---

## Key Files Reference

| File | Change |
|------|--------|
| `src/types/collabora.ts` | Add `PendingDocumentChange`, `ReadOnly` to CheckFileInfo (`AnchorEmbedResult` unused) |
| `src/lib/collabora/anchor.ts` | NEW — no-op stubs (V2 failed; bookmark commands open dialog) |
| `src/lib/collabora/navigation.ts` | Extended text normalization (Unicode NFC, dashes, quotes) |
| `src/app/api/wopi/files/[fileId]/route.ts` | Add `ReadOnly: true` (conditional on V1) |
| `collabora-document-viewer.tsx` | Preparation phase state machine, overlay, pending queue drain |
| `use-collabora-postmessage.ts` | Transparent interaction guard overlay |
| `use-clause-highlighting.ts` | Run on hidden iframe during preparation phase |
| `use-clause-navigation.ts` | Enhanced text-search navigation, progressive fallback, failure callback |
| `use-fallback-redline.ts` | Search-based re-selection, 500ms delays |
| `use-undo-redline.ts` | Search-based deletion, failure toast |
| `use-pending-document-queue.ts` | NEW — SPA pending change queue + React context |
| `page.tsx` (contract detail) | Wrap with `CollaboraPendingQueueProvider` |
