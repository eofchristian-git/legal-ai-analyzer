# Implementation Plan: Collabora Viewer Reliability & UX Fixes

**Branch**: `011-collabora-viewer-fixes` | **Date**: 2026-02-19 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `specs/011-collabora-viewer-fixes/spec.md`

---

## Summary

Fix six reliability and UX issues in the existing Collabora Online document viewer (Feature 010). The fixes target: (1) enforcing true read-only mode without breaking programmatic UNO commands, (2) applying clause highlights before the document is shown to the reviewer, (3) fixing fallback redline rendering (strikethrough + insertion), (4) fixing undo correctness (partial character deletion bug), (5) enhanced text-search clause navigation with extended normalization, and (6) a pending change queue so decision actions taken while the viewer is closed are applied when the viewer next opens.

**Note**: Named bookmark anchors (`.uno:InsertBookmark`) were originally planned for navigation (Fix 5) but abandoned after empirical testing — the command opens a dialog in Collabora Online instead of silently inserting a bookmark (V2 validation failed). Navigation uses enhanced text-search exclusively.

All changes are purely within the existing Collabora viewer subsystem. No schema migrations, no new API routes, no new npm packages required.

---

## Technical Context

**Language/Version**: TypeScript 5.x, Node.js 20+, Next.js 16 (App Router)
**Primary Dependencies**: Collabora Online CODE (Docker), WOPI protocol, `jsonwebtoken`, React hooks — no new packages
**Storage**: Prisma/SQLite — no schema changes in this feature
**Testing**: No test framework; manual verification against running Collabora instance
**Target Platform**: Web (Next.js server + Collabora Docker sidecar)
**Performance Goals**: Document preparation (highlighting) completes in < 15 seconds for typical contracts; navigation response < 300ms after text search
**Constraints**: `UserCanWrite: true` in WOPI must be preserved (required for UNO programmatic commands); pending queue is SPA-state only (not persisted across page refresh)
**Scale/Scope**: Single-user contract review sessions; no concurrent edit scenarios

---

## Constitution Check

| Principle | Status | Notes |
|-----------|--------|-------|
| **I. Data Integrity** | ✅ Pass | No new data mutations; pending queue is transient client state; WOPI PutFile saves remain unchanged |
| **II. Simplicity** | ✅ Pass | No new npm packages; no new DB tables; fixes are isolated to the existing viewer hook subsystem; pending queue is a single new hook |
| **III. AI-Assisted, Human-Controlled** | ✅ Pass | Feature does not touch AI prompts or analysis logic; only affects document rendering layer |
| **Type safety (`any` usage)** | ✅ Pass | All new types added to `src/types/collabora.ts`; no `any` introduced |
| **shadcn/ui primitives** | ✅ Pass | Loading overlay uses existing shadcn components; toast uses existing `sonner` setup |
| **Path alias `@/*`** | ✅ Pass | All new imports follow `@/` convention |

**Gate**: PASSED — proceed to Phase 0.

---

## Project Structure

### Documentation (this feature)

```text
specs/011-collabora-viewer-fixes/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
└── tasks.md             # Phase 2 output (/speckit.tasks)
```

### Source Code (files touched by this feature)

```text
src/
├── types/
│   └── collabora.ts                              # MODIFY — add PendingDocumentChange
│
├── lib/
│   └── collabora/
│       ├── navigation.ts                         # MODIFY — extended text normalization (NFC, dashes, quotes)
│       └── anchor.ts                             # NEW — no-op stubs (V2 failed; bookmark commands open dialog)
│
└── app/
    ├── api/
    │   └── wopi/
    │       └── files/[fileId]/
    │           └── route.ts                      # MODIFY — add ReadOnly flag to CheckFileInfo
    │
    └── (app)/contracts/[id]/
        ├── page.tsx                              # MODIFY — wrap with CollaboraPendingQueueProvider
        └── _components/
            └── collabora-viewer/
                ├── collabora-document-viewer.tsx # MODIFY — preparation phase, queue drain on mount
                ├── use-collabora-postmessage.ts  # MODIFY — read-only overlay, UI strip improvements
                ├── use-clause-highlighting.ts    # MODIFY — hidden-iframe mode for preparation phase
                ├── use-clause-navigation.ts      # MODIFY — enhanced text-search navigation, failure callback
                ├── use-fallback-redline.ts       # MODIFY — fix timing, fix search-based text selection
                ├── use-undo-redline.ts           # MODIFY — fix inserted-text deletion via search, not cursor count
                └── use-pending-document-queue.ts # NEW — SPA-level pending change queue + context
```

---

## Complexity Tracking

> No constitution violations. Complexity table provided for reference only.

| Component | Change | Justification |
|-----------|--------|---------------|
| `use-pending-document-queue.ts` (new hook) | +1 hook | Unavoidable: viewer must be mounted to apply UNO changes; queue bridges the mounted/unmounted boundary |
| `anchor.ts` (new lib file) | +1 lib module | Contains no-op stubs (V2 failed); retained for documentation of the failed bookmark approach |

---

## Phase 0: Research

**Output**: [`research.md`](./research.md)

### Research Questions

| ID | Question | Resolution |
|----|----------|------------|
| R1 | Can Collabora UNO commands work when `UserCanWrite: false` in CheckFileInfo? | → See research.md §R1 |
| R2 | Does Collabora's postMessage `Send_UNO_Command` support `.uno:InsertBookmark` and `.uno:GoToBookmark`? What are the exact argument schemas? | → See research.md §R2 — ❌ FAILED |
| R3 | What is the root cause of the undo character deletion bug? | → See research.md §R3 |
| R4 | What is the root cause of intermittent fallback redline failures? | → See research.md §R4 |
| R5 | Does the `ReadOnly=1` URL parameter in Collabora iframe URL disable user editing while preserving postMessage UNO command channels? | → See research.md §R5 |
| R6 | Why do `.uno:Strikeout` and `.uno:Color` open dialogs instead of applying silently? | → See research.md §R6 — Empty `{}` args + wrong arg names cause dialog dispatch |

---

## Phase 1: Design & Contracts

### Fix 1 — Read-Only Viewer Mode

**Problem**: Users can type into the document. UI chrome stripping already works, but keyboard input is not blocked.

**Design**:

Two-layer enforcement:
1. **WOPI `ReadOnly: true`** flag in CheckFileInfo — instructs Collabora to open in view mode. This is a separate flag from `UserCanWrite` and controls the viewer UX mode, not the WOPI write permission.
2. **Transparent interaction guard** — A `pointer-events: none` overlay div is placed over the iframe to absorb accidental clicks that would focus the iframe for keyboard input. The overlay is `position: absolute, inset: 0, z-index: 1` and passes scroll events through. Navigation clicks from the left panel use programmatic postMessage rather than iframe focus.

**Critical assumption** (validated in R1/R5): `UserCanWrite: true` is retained in WOPI so that `.uno:ExecuteSearch` and all other programmatic UNO commands continue to work. `ReadOnly: true` is an *additional* WOPI flag that controls the editing UI but does not block the programmatic command channel.

If R5 shows that `ReadOnly=1` breaks UNO commands, fall back to: keep current `UserCanWrite: true`, retain the transparent overlay, and rely on existing UI stripping for visual read-only appearance.

**Files changed**:
- `src/app/api/wopi/files/[fileId]/route.ts` — add `ReadOnly: true` to `CheckFileInfoResponse`
- `src/app/(app)/contracts/[id]/_components/collabora-viewer/collabora-document-viewer.tsx` — add transparent overlay div over iframe
- `src/types/collabora.ts` — add `ReadOnly?: boolean` to `CheckFileInfoResponse`

---

### Fix 2 — Highlights Before First Display

**Problem**: Highlights are applied after the document is visible, causing visible sequential coloring.

**Design**:

Add a `preparationPhase` state to `collabora-document-viewer.tsx`:

```
States:
  'idle'         → initial, no session
  'loading'      → session fetching + iframe loading
  'preparing'    → document loaded, highlights running (overlay shown)
  'ready'        → preparation complete, document visible
  'error'        → timeout or failure
```

The iframe is mounted immediately when the session is ready (Collabora needs the DOM to load the document), but an opaque loading overlay (`position: absolute, inset: 0`) sits on top showing "Preparing document…" until preparation completes.

`useClauseHighlighting` already fires `onHighlightingComplete` — this callback transitions state from `'preparing'` → `'ready'`, removing the overlay.

The `highlightsApplied` flag (already persisted on `Document` model via the existing WOPI save path) is used to skip preparation on subsequent opens — the overlay is shown briefly but transitions immediately to `'ready'` once the flag is confirmed.

**Files changed**:
- `collabora-document-viewer.tsx` — add preparation phase state machine, overlay component
- `use-clause-highlighting.ts` — ensure hook runs even if iframe is not yet visually shown (behind preparation overlay)

---

### Fix 3 — Enhanced Text-Search Navigation

**Problem**: Navigation relies on text search which fails when extracted text differs from document text (Unicode mismatches, dash/quote variants, whitespace differences).

**Original design (abandoned)**: Named bookmark anchors via `.uno:InsertBookmark` — abandoned after V2 validation revealed the command opens a dialog in Collabora Online instead of silently inserting a bookmark. See research.md §R2.

**Active design**:

Enhanced text-search navigation with extended normalization applied to both the search string and the document text comparison:

1. **Unicode NFC normalization** — canonicalize composed/decomposed characters
2. **Dash equivalence** — en-dash (–), em-dash (—), and hyphen (-) treated as interchangeable
3. **Smart quote normalization** — "curly" quotes ("", '') converted to straight equivalents
4. **Whitespace collapsing** — NBSP, thin-space, zero-width characters all collapsed to single space
5. **Progressive fallback** — full excerpt → shorter excerpt → first sentence
6. **Occurrence indexing** — for duplicate text, navigate to the correct Nth occurrence
7. **Failure reporting** — `onNavigationFailed(clauseId)` triggers UI indicator in clause list

**File: `src/lib/collabora/anchor.ts`**: Retained as no-op stubs with documentation of the failed bookmark approach. Functions return `null`.

**Modified: `src/lib/collabora/navigation.ts`** — extended normalization functions (T005).

**Modified: `use-clause-navigation.ts`** — text-search-only navigation with progressive fallback and `onNavigationFailed` callback.

**Modified: `collabora-document-viewer.tsx`** — `onNavigationFailed` handler sets per-clause `navigationFailed` flag for UI indicator.

**Files changed**:
- `src/lib/collabora/anchor.ts` — no-op stubs (bookmark functions return `null`)
- `src/lib/collabora/navigation.ts` — extended normalization (Unicode NFC, hyphen/dash equivalence, smart-quote normalization)
- `src/app/(app)/contracts/[id]/_components/collabora-viewer/use-clause-navigation.ts` — text-search navigation with progressive fallback, failure callback
- `src/types/collabora.ts` — `onNavigationFailed` prop added to `CollaboraViewerProps`

---

### Fix 4 — Fallback Redline Reliability

**Problem**: Two issues: (1) the 11-step UNO sequence intermittently fails to show strikethrough + insertion, and (2) several UNO formatting commands open dialogs instead of applying silently (confirmed: `.uno:Strikeout` with `{}` opens Character dialog — see R6).

**Root causes**:
- (R4): `GoRight`/`GoLeft` cursor movement is fragile for re-selecting text after formatting
- (R6): **Empty object `{}` as Args** causes Collabora to send `uno .uno:Cmd {}` which triggers the dialog execution path in LibreOffice core. **Wrong arg name** `FontColor.Color` doesn't match the expected `FontColor` parameter.

**Design**:

Replace cursor-movement-based selection with search-based selection, AND fix all UNO command argument issues:

1. **Original text**: `ExecuteSearch` → select → apply strikethrough (no args, toggle) → set gray font color (`{FontColor: {type: "long", value: N}}`) → collapse to end via `.uno:GoToEndOfSel` (no args)
2. **Type insertion**: `.uno:InsertText` with `{Text: {type: "string", value: "..."}}` at the collapsed cursor position
3. **Re-select inserted text**: `ExecuteSearch` for the inserted text → apply green bg (`CharBackColor`), dark green font color (`FontColor`), bold (toggle, no args), remove strikethrough (toggle, no args)

**Critical UNO command fixes** (R6):

| Step | Command | Old Args (broken) | New Args (fixed) |
|------|---------|-------------------|-------------------|
| 2 | `.uno:Strikeout` | `{}` → opens dialog | No args (toggle) |
| 3 | `.uno:Color` | `{"FontColor.Color": ...}` → wrong name | `{FontColor: {type: "long", value: N}}` |
| 4 | `.uno:GoToEndOfSel` | `{}` → risky | No args |
| 8 | `.uno:Color` | `{"FontColor.Color": ...}` → wrong name | `{FontColor: {type: "long", value: N}}` |
| 9 | `.uno:Bold` | `{}` → risky | No args (toggle) |
| 10 | `.uno:Strikeout` | `{}` → opens dialog | No args (toggle) |

**Infrastructure fix**: Modify `executeUnoCommand` in `use-collabora-postmessage.ts` to filter empty objects — when `args` is `{}`, send `Args: ""` instead of `Args: {}`.

Delay budget: 500ms inter-step delays (unchanged from T011).

**Files changed**:
- `use-fallback-redline.ts` — fix all UNO command args, search-based selection
- `use-collabora-postmessage.ts` — filter empty objects in `executeUnoCommand`

---

### Fix 5 — Undo Correctness

**Problem**: Two issues: (1) undo sometimes removes stray characters due to `GoLeft` character counting, and (2) formatting removal commands (`.uno:Strikeout`, `.uno:Color`) open dialogs instead of applying silently (same root cause as Fix 4 — see R6).

**Root causes**:
- (R3): `GoLeft` count is wrong for Unicode multi-codepoint characters
- (R6): Empty `{}` args and wrong arg names trigger dialog dispatch

**Design**:

Replace `GoLeft`-based selection with search-based approach, AND fix all UNO command argument issues:

1. **Phase 1 (delete inserted text)**: `ExecuteSearch` → select → `.uno:Delete` (no args)
2. **Phase 2 (restore original)**: `ExecuteSearch` → select → `.uno:Strikeout` (no args, toggle OFF) → `.uno:Color` with `{FontColor: {type: "long", value: 0x000000}}` → `.uno:CharBackColor` with `{CharBackColor: {type: "long", value: riskColor}}`
3. **Phase 3**: Save

**UNO command fixes** (R6):

| Step | Command | Old Args (broken) | New Args (fixed) |
|------|---------|-------------------|-------------------|
| 1,4,9 | `.uno:GoToStartOfDoc` | `{}` → risky | No args |
| 3 | `.uno:Delete` | `{}` → risky | No args |
| 6 | `.uno:Strikeout` | `{}` → opens dialog | No args (toggle) |
| 7 | `.uno:Color` | `{"FontColor.Color": ...}` → wrong name | `{FontColor: {type: "long", value: N}}` |

If the inserted text search fails, surface a non-blocking error toast and leave document unchanged (FR-025).

**Files changed**:
- `use-undo-redline.ts` — fix UNO command args, search-based selection, failure toast

---

### Fix 6 — Pending Document Change Queue

**Problem**: When decision actions (fallback accept, undo) are taken while the viewer is not mounted, the UNO commands are never executed and the document is not updated.

**Design**:

New React context + hook: `CollaboraPendingQueueContext`

**Location**: `src/app/(app)/contracts/[id]/_components/collabora-viewer/use-pending-document-queue.ts`

**Provider**: Mounted at the contract detail page level (`page.tsx`), so the queue persists across SPA navigation within the page (but not across hard refreshes — FR-023 accepted scope).

**Queue entry type** (added to `collabora.ts`):

```typescript
type PendingChangeType = 'APPLY_FALLBACK' | 'UNDO_FALLBACK';

interface PendingDocumentChange {
  id: string;                   // uuid, for deduplication
  clauseId: string;
  type: PendingChangeType;
  payload: FindingRedlineData | FindingUndoRedlineData;
  decidedAt: string;            // ISO timestamp, for ordering
  status: 'pending' | 'applying' | 'complete' | 'failed';
  failureReason?: string;
}
```

**Queue behaviour**:

- `enqueueChange(change)` — adds to queue; if viewer is currently mounted, triggers immediate application
- `drainQueue(applyFn)` — called by the viewer on mount; processes all `'pending'` entries in `decidedAt` order; marks each `'applying'` → `'complete'` or `'failed'`
- `retryFailed()` — on next viewer open, failed entries are retried once before the document is shown
- Queue is an array in React state; `useReducer` for atomic updates

**Integration with decision buttons** (clause decision actions UI):

The existing decision buttons call `onDecisionApplied` callbacks. These callbacks must now also call `enqueueChange` when the decision type maps to a document change (APPLY_FALLBACK → `FindingRedlineData`, UNDO → `FindingUndoRedlineData`). If the viewer is mounted, the queue immediately drains (no visible delay). If not mounted, changes wait.

**Viewer mount flow**:

```
Viewer mounts
  → drainQueue(applyRedlineOrUndo)
  → [show "Preparing document…" overlay during drain]
  → preparation complete (highlights + anchors if first open, pending changes applied)
  → overlay removed, document visible
```

**Files changed**:
- `use-pending-document-queue.ts` — new hook + context
- `collabora.ts` — add `PendingDocumentChange`, `PendingChangeType`
- `page.tsx` — wrap with `CollaboraPendingQueueProvider`
- `collabora-document-viewer.tsx` — call `drainQueue` on mount, pass `enqueueChange` up via context
- Decision button component — call `enqueueChange` on each decision that maps to a document change

---

## Ordering & Dependencies

```
Fix 1 (Read-only)           ← independent; can be done first
Fix 2 (Highlight timing)    ← independent after Fix 1
Fix 3 (Text-search nav)     ← independent (R2 failed; uses text-search normalization only)
Fix 4 (Redline reliability) ← independent after foundation types
Fix 5 (Undo correctness)    ← independent of other fixes
Fix 6 (Pending queue)       ← depends on Fix 4 + Fix 5 (reliable redline/undo before queuing)
```

Recommended implementation order: **Fix 1 → Fix 5 → Fix 4 → Fix 3 → Fix 2 → Fix 6**

Rationale: Fix individual bugs (1, 5, 4) first so they are verified before being wrapped in the pending queue (6) and preparation phase (2). Fix 3 (navigation) is now independent since bookmarks were abandoned — it only requires the T005 text normalizations.

---

## Risk Register

| Risk | Probability | Impact | Mitigation |
|------|------------|--------|------------|
| ~~`.uno:InsertBookmark` not available via postMessage~~ | ~~Medium~~ | ~~High~~ | **MATERIALIZED** — command opens dialog. Abandoned; using text-search navigation with extended normalization |
| ~~UNO formatting commands open dialogs instead of applying silently~~ | ~~High~~ | ~~High~~ | **MATERIALIZED** (R6) — empty `{}` args and wrong arg names cause dialog dispatch. Fixed: filter empty objects in `executeUnoCommand`, correct all arg names |
| `ReadOnly: true` WOPI flag blocks UNO commands | ~~Medium~~ Resolved | ~~High~~ | ✅ Validated — `ReadOnly: true` works correctly alongside `UserCanWrite: true` |
| Search-based undo (Fix 5) fails when inserted text contains regex-special chars | Low | Medium | Escape the search string before sending to `ExecuteSearch` |
| Text-search navigation fails for clauses with heavily divergent text | Medium | Medium | Progressive fallback (full → short → first sentence) + `onNavigationFailed` indicator |
| Pending queue drains in wrong order if `decidedAt` timestamps collide | Very Low | Low | Sort by `decidedAt` + queue insertion index as tiebreaker |
