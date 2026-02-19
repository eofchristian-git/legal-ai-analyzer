# Research: Collabora Viewer Reliability & UX Fixes

**Feature**: 011-collabora-viewer-fixes
**Date**: 2026-02-19

---

## R1 — Read-Only Mode vs. UNO Programmatic Commands

**Question**: Can Collabora UNO commands (`.uno:ExecuteSearch`, `.uno:CharBackColor`, etc.) work when `UserCanWrite: false` is set in the WOPI CheckFileInfo response?

**Decision**: Keep `UserCanWrite: true` in WOPI. Do NOT set `UserCanWrite: false`.

**Rationale**: Collabora's programmatic command channel (postMessage `Send_UNO_Command`) operates within the Collabora document session. When `UserCanWrite: false`, Collabora opens the document in a pure view mode that disables document mutation APIs — including the search-and-format UNO dispatch commands used for highlighting, redlines, and anchor embedding. Removing write permission would break all six programmatic features this feature depends on. The Feature 010 research (R3) already documented this trade-off and confirmed `UserCanWrite: true` is required.

**Alternative Rejected**: `UserCanWrite: false` + read-only URL parameter → breaks programmatic commands, cannot be used.

**Read-Only Enforcement Strategy**: Two-layer approach that does NOT rely on WOPI write permissions:

1. **`ReadOnly: true` WOPI CheckFileInfo flag** — A separate WOPI property that instructs Collabora to present the document in view mode (no editing toolbar, no cursor-in-document editing) while still allowing the host app's postMessage command channel to function. This is distinct from `UserCanWrite`.
   - *Empirical validation required*: Test in the running Collabora CODE instance that `ReadOnly: true` (or Collabora's equivalent presentation-mode flag) suppresses the edit cursor while `.uno:ExecuteSearch` still works via postMessage.
   - Collabora CODE documentation: `ReadOnly` in CheckFileInfo is listed as a supported WOPI property in WOPI protocol spec §3.3.5.
   - If validation fails: remove this flag, rely on layer 2 only.

2. **Transparent interaction guard overlay** — A `div` with `position: absolute; inset: 0; z-index: 2; pointer-events: auto; cursor: default` is placed over the iframe at all times. This:
   - Prevents the iframe from receiving mouse click events that would give it keyboard focus
   - Does NOT prevent scrolling (wheel events pass through to the iframe via the `overflow: auto` scroll container beneath)
   - Does NOT affect postMessage communication (postMessage is not event-driven from the DOM)
   - The overlay itself does not capture keyboard events since focus never enters the iframe

**Alternatives Considered**:

| Approach | Verdict | Reason |
|----------|---------|--------|
| `UserCanWrite: false` | Rejected | Breaks UNO programmatic commands |
| `iframe sandbox` attribute blocking typing | Rejected | Breaks postMessage channel entirely |
| CSS `pointer-events: none` on iframe | Rejected | Would also block scroll events |
| Keyboard event interception on `window` | Partial | Unreliable when iframe has focus; not needed if overlay prevents focus |

---

## R2 — Bookmark Anchor UNO Commands via PostMessage

**Question**: Does Collabora's postMessage `Send_UNO_Command` support `.uno:InsertBookmark` and `.uno:GoToBookmark`? What are the exact argument schemas?

**Decision**: ❌ **ABANDONED** — `.uno:InsertBookmark` is a dialog-based command. Use enhanced text-search navigation with extended normalization instead.

**Empirical validation result (T002)**: **FAILED**. When `.uno:InsertBookmark` is dispatched via `Send_UNO_Command` postMessage, Collabora Online opens the native "Insert Bookmark" dialog UI to the user instead of silently inserting a bookmark. The `Args` array with `Bookmark.Name` is not consumed programmatically — Collabora treats this as the interactive menu command. There is no non-dialog programmatic alternative available through the Collabora postMessage channel.

**Tested command** (fails — opens dialog):

```javascript
// ❌ OPENS DIALOG — do not use
{
  MessageId: 'Send_UNO_Command',
  Values: {
    Command: '.uno:InsertBookmark',
    Args: [{ Name: 'Bookmark.Name', Value: 'clause-<clauseId>', Type: 'string' }]
  }
}
```

**Consequence**: All bookmark functions in `src/lib/collabora/anchor.ts` are converted to no-ops that return `null`. Bookmark embedding removed from highlighting hook. Bookmark navigation removed from navigation hook. The `AnchorEmbedResult` type is unused.

**Active strategy — Enhanced text-search navigation** with extended normalization in `navigation.ts` (T005):
- Unicode NFC normalization
- Hyphen/en-dash/em-dash equivalence (`-`, `–`, `—` treated as interchangeable)
- Smart quote normalization (`"`, `"`, `'`, `'` → straight equivalents)
- Collapsing all whitespace variants (NBSP, thin-space, etc.) to single space
- Navigation success target: 95%+ of clauses (up from current intermittent failures)
- Progressive fallback: full excerpt → shorter excerpt → first sentence
- On complete failure: `onNavigationFailed(clauseId)` shows indicator in clause list

---

## R3 — Root Cause: Undo Character Deletion Bug

**Question**: Why does `use-undo-redline.ts` sometimes remove unexpected characters?

**Root Cause**: Phase 1 of the undo operation uses `GoLeft` UNO command to select the previously inserted fallback text by moving the cursor left by `insertedText.length` characters. This count is wrong for:

1. **Unicode multi-codepoint characters**: An en-dash (`–`, U+2013) is 1 character in JavaScript `String.length` but may be treated differently by LibreOffice's cursor movement (some builds count UTF-16 code units, others Unicode scalar values).
2. **The leading space**: When the fallback text is inserted, it is prepended with a space (` ` + fallback). The `GoLeft` count in `use-undo-redline.ts` may or may not include this leading space consistently.
3. **Cursor position after Phase 2 formatting**: If Phase 2 (restoring original) runs before Phase 1 is fully settled, the cursor may drift.

**Decision**: Replace `GoLeft`-based selection with `ExecuteSearch` for the exact `insertedText` value. The inserted text is stored verbatim in `FindingUndoRedlineData.insertedText` — searching for it exactly finds and selects the right range regardless of character counting semantics.

**Search string for undo Phase 1**: `insertedText` stripped of any leading/trailing space added by the redline hook during insertion. Stored in `FindingUndoRedlineData` as the exact string that was inserted (without the leading space prefix), so the caller knows exactly what to search for.

**Rationale for alternatives rejected**:

| Alternative | Reason Rejected |
|-------------|----------------|
| Fix the `GoLeft` count | Requires knowing LibreOffice's exact character counting model — unreliable across Collabora versions |
| Store insertion byte offset | WOPI does not expose cursor position APIs |
| Undo via LibreOffice's native Ctrl+Z | Would undo ALL changes including highlights — unacceptable |

---

## R4 — Root Cause: Fallback Redline Intermittent Failure

**Question**: Why does `use-fallback-redline.ts` sometimes fail to show the correct strikethrough + insertion?

**Root Cause Analysis**: The 11-step sequence uses a combination of:
- `ExecuteSearch` to find and select the original text (step 1)
- `GoRight` by 0 to collapse cursor to end of selection (step 4)
- `Action_Dispatch: InsertText` to insert fallback (step 5)
- `GoLeft` by `replacementText.length` to re-select the inserted text (step 6)
- Apply formatting to the selected insertion (steps 7–10)

Failure modes observed:
1. **Step 4 timing**: If `GoRight` fires before the selection from step 1 has settled, it collapses to the wrong position.
2. **Step 6 character counting**: Same Unicode issue as R3 — `GoLeft` count may be wrong for non-ASCII characters in the fallback text.
3. **Step 6 selects across word boundary**: If the fallback text is exactly at the end of a paragraph, `GoLeft` wraps to the previous line.

**Decision**: Rewrite the sequence to eliminate all cursor-arithmetic steps:

```
Step 1: ExecuteSearch(originalExcerpt) → selects original text
Step 2: Apply strikethrough to selection
Step 3: Apply gray text color to selection
Step 4: Action_Dispatch GoToEndOfSel (collapse cursor to end of current selection)
Step 5: InsertText(replacementText) → cursor moves to end of inserted text
Step 6: ExecuteSearch(replacementText) → select the just-inserted text
Step 7: Apply green background to selection
Step 8: Apply bold to selection
Step 9: Apply dark green text color to selection
Step 10: Remove strikethrough from selection (it should not be set, but ensure clean state)
Step 11: Action_Save
```

Key change: **Step 6 uses ExecuteSearch on the replacement text** instead of `GoLeft`. This is deterministic — it searches from the beginning of the document and finds the inserted text regardless of cursor position or character encoding.

**Edge case**: If the replacement text already exists elsewhere in the document (e.g., a common legal phrase), `ExecuteSearch` will find the first occurrence. Mitigation: search for the replacement text starting from the cursor position (Collabora's `ExecuteSearch` with `SearchItem.SearchBackwards: false` and command type 1 "find next from cursor"). If this is unavailable, search for the full replacement text and use occurrence index from the existing disambiguation logic.

**Delay budget**: Increase all inter-step delays to 500ms uniformly (from current 350ms) to match the proven reliability of `use-undo-redline.ts` which already uses 500ms delays successfully.

---

## R5 — Collabora `ReadOnly` URL Parameter vs. UserCanWrite

**Question**: Does adding `ReadOnly=1` or similar to the Collabora iframe URL prevent user editing while preserving the postMessage UNO command channel?

**Decision**: Use `ReadOnly: true` in the WOPI CheckFileInfo response body (not a URL parameter) as the preferred mechanism. Supplement with transparent overlay (see R1).

**Rationale**: Collabora Online supports `ReadOnly` as a standard WOPI CheckFileInfo property. When set, Collabora renders the document in presentation/view mode — toolbars are hidden, the document cursor does not activate on click, and the user cannot type. The postMessage host application channel remains active (it is authenticated separately via `PostMessageOrigin`, not via write permissions).

**Important distinction**:
- `UserCanWrite: true` — WOPI permission: "the WOPI client (host app) is allowed to send PutFile requests to save document changes." Required for our programmatic saves.
- `ReadOnly: true` — WOPI CheckFileInfo flag: "present the document in read-only/view mode to the end user." Does not affect WOPI client permissions.

Both can be `true` simultaneously: the host app can write programmatically (`UserCanWrite: true`) while the end user sees a read-only UI (`ReadOnly: true`).

**Validation**: Test in the running Collabora CODE container that:
1. Setting `ReadOnly: true` in CheckFileInfo produces a view-mode presentation
2. `.uno:ExecuteSearch` postMessage commands still execute and return replies
3. The user cannot type when clicking in the document

If test 2 fails: remove `ReadOnly: true`; rely on transparent overlay + existing UI stripping for the read-only UX appearance.

---

## R6 — Empty-Object Args & Wrong Arg Names in UNO Commands (partial fix)

**Question**: Why do formatting commands (`.uno:Strikeout`, `.uno:Color`, etc.) open Collabora dialogs instead of applying silently when dispatched via `Send_UNO_Command` postMessage?

**Decision**: Fix `executeUnoCommand` infrastructure to filter empty objects `{}`, and correct wrong argument names.

**Root Cause (initial hypothesis)**: Two issues identified:

1. **Empty object `{}` as Args causes dialog dispatch.** When `executeUnoCommand(".uno:Strikeout", {})` is called, the `{}` is truthy in Collabora's `sendUnoCommand(command, json)` handler, which serializes it as `uno .uno:Strikeout {}`. The LibreOffice core receives a non-empty args string, attempts to parse parameters, finds no valid parameters matching the slot definition, and falls back to the **dialog execution path** — opening the Character dialog (Font Effects tab) for Strikeout, or the color picker for Color commands.

2. **Wrong argument names.** `.uno:Color` is called with `{"FontColor.Color": ...}` but the correct `SfxInt32Item` parameter name is `FontColor` (no `.Color` suffix). When the core finds no matching parameter, it opens the dialog.

**Evidence**:
- `.uno:CharBackColor` with `{CharBackColor: {type: "long", value: N}}` **WORKS** — clause risk highlights are visible and correctly applied (confirmed in running instance)
- `.uno:Strikeout` with `{}` (empty object) **OPENS DIALOG** — Character dialog appears on Font Effects tab with "Strikethrough: Single" (confirmed by screenshot during fallback redline)
- `.uno:InsertBookmark` with args **OPENS DIALOG** — previously confirmed (V2 failure)
- The pattern: commands with **correct, non-empty args** → silent execution; commands with **empty `{}` or wrong arg names** → dialog fallback

**Fixes applied**:

- **Infrastructure fix**: `executeUnoCommand` in `use-collabora-postmessage.ts` now filters empty objects (`Object.keys(args).length === 0`) — sends `Args: ""` instead of `Args: {}`.
- **Arg name fix**: `.uno:Color` changed from `"FontColor.Color"` to `"FontColor"`.
- **Empty args removal**: Toggle/cursor commands (`.uno:Strikeout`, `.uno:Bold`, `.uno:GoToStartOfDoc`, `.uno:GoToEndOfSel`, `.uno:Delete`) no longer pass `{}`.

**Complete UNO command audit (at R6 stage)**:

| Command | Hook | Old Args | Status | R6 Fix |
|---------|------|----------|--------|--------|
| `.uno:ExecuteSearch` | All hooks | SearchItem args | ✅ Works | No change |
| `.uno:CharBackColor` | Highlighting, Redline, Undo | `{CharBackColor: {type: "long", value: N}}` | ✅ Works | No change |
| `.uno:GoToStartOfDoc` | Undo | `{}` | ⚠️ Risky | Removed `{}` — pass no args |
| `.uno:Strikeout` | Redline (ON/OFF), Undo (OFF) | `{}` | ❌ Dialog | Removed `{}` — pass no args |
| `.uno:Color` | Redline (gray), Undo (black) | `{"FontColor.Color": ...}` | ❌ Wrong name | Fixed to `{FontColor: {type: "long", value: N}}` |
| `.uno:Bold` | Redline | `{}` | ⚠️ Risky | Removed `{}` — pass no args |
| `.uno:GoToEndOfSel` | Redline | `{}` | ⚠️ Risky | Removed `{}` — pass no args |
| `.uno:InsertText` | Redline | `{Text: {type: "string", value: "..."}}` | ✅ Works | No change |
| `.uno:Delete` | Undo | `{}` | ⚠️ Risky | Removed `{}` — pass no args |

**Outcome**: ❌ **INSUFFICIENT** — After applying these fixes, the Character dialog (Font Effects tab) still appeared when running fallback + undo. See **R7** for the complete fix.

---

## R7 — Replace Dialog Commands with Property-Setter Commands (complete fix)

**Question**: Why does the Character dialog still appear even after the R6 fixes (empty-object filtering + arg name corrections)?

**Decision**: Replace all dialog-triggering UNO commands with their **property-setter equivalents** (`.uno:CharStrikeout`, `.uno:CharColor`, `.uno:CharWeight`). These follow the same `{PropertyName: {type, value}}` pattern as `.uno:CharBackColor` which is confirmed working.

**Root Cause**: Commands like `.uno:Strikeout`, `.uno:Color`, and `.uno:Bold` are **inherently dialog-based** in Collabora Online's `Send_UNO_Command` postMessage dispatch path. They ALWAYS open the Character dialog regardless of arguments (empty `{}`, no args, or correctly typed args). These are "slot" commands tied to UI menu items, not silent property setters.

LibreOffice has a separate set of **property-setter commands** (`.uno:CharXxx`) that directly set character attributes without any UI. `.uno:CharBackColor` is one of these — and it's the one we already confirmed works.

**Evidence (iterative testing across R6 → R7)**:
1. `.uno:CharBackColor` with `{CharBackColor: {type: "long", value: N}}` **WORKS** ✅ — confirmed by visible clause highlights
2. `.uno:Strikeout` with `{}` → **OPENS Character dialog** ❌ (screenshot 1: before R6)
3. `.uno:Strikeout` with no args (R6 fix) → **STILL OPENS Character dialog** ❌ (screenshot 2: after R6)
4. `.uno:Color` with `{FontColor: {type: "long", value: N}}` (R6 fix) → **STILL OPENS Character dialog** ❌ (screenshot 2: after R6)
5. `.uno:InsertBookmark` → **OPENS dialog** ❌ (V2 failure)

**Conclusion**: The "toolbar/slot" commands (`.uno:Strikeout`, `.uno:Color`, `.uno:Bold`) are intercepted by Collabora's dispatch layer and routed to dialogs. The "property" commands (`.uno:CharStrikeout`, `.uno:CharColor`, `.uno:CharWeight`, `.uno:CharBackColor`) bypass this and set values directly.

**Complete UNO command mapping — dialog → property setter**:

| Dialog Command (❌ always opens dialog) | Property Setter (✅ silent) | Args Format | Values |
|---|---|---|---|
| `.uno:Strikeout` | `.uno:CharStrikeout` | `{CharStrikeout: {type: "unsigned short", value: N}}` | 0=NONE, 1=SINGLE, 2=DOUBLE |
| `.uno:Color` | `.uno:CharColor` | `{CharColor: {type: "long", value: N}}` | Decimal RGB color |
| `.uno:Bold` | `.uno:CharWeight` | `{CharWeight: {type: "float", value: N}}` | 100=NORMAL, 150=BOLD |
| `.uno:CharBackColor` | `.uno:CharBackColor` | `{CharBackColor: {type: "long", value: N}}` | ✅ Already a property setter |

**Commands that work without args (cursor/action — no dialog variant)**:

| Command | Purpose | Args |
|---------|---------|------|
| `.uno:GoToStartOfDoc` | Cursor to document start | No args |
| `.uno:GoToEndOfSel` | Collapse selection to end | No args |
| `.uno:Delete` | Delete current selection | No args |
| `.uno:InsertText` | Insert text at cursor | `{Text: {type: "string", value: "..."}}` |
| `.uno:ExecuteSearch` | Find & select text | SearchItem.* args |

**Side-by-side: old code → new code**:

### `use-fallback-redline.ts`

| Step | OLD (❌ dialog) | NEW (✅ silent) |
|------|----------------|-----------------|
| 2 — Strikeout ON | `executeUnoCommand(".uno:Strikeout")` | `executeUnoCommand(".uno:CharStrikeout", { CharStrikeout: { type: "unsigned short", value: 1 } })` |
| 3 — Gray text | `executeUnoCommand(".uno:Color", { FontColor: { type: "long", value: GRAY_TEXT } })` | `executeUnoCommand(".uno:CharColor", { CharColor: { type: "long", value: GRAY_TEXT } })` |
| 8 — Green text | `executeUnoCommand(".uno:Color", { FontColor: { type: "long", value: DARK_GREEN_TEXT } })` | `executeUnoCommand(".uno:CharColor", { CharColor: { type: "long", value: DARK_GREEN_TEXT } })` |
| 9 — Bold | `executeUnoCommand(".uno:Bold")` | `executeUnoCommand(".uno:CharWeight", { CharWeight: { type: "float", value: 150 } })` |
| 10 — Strikeout OFF | `executeUnoCommand(".uno:Strikeout")` | `executeUnoCommand(".uno:CharStrikeout", { CharStrikeout: { type: "unsigned short", value: 0 } })` |

### `use-undo-redline.ts`

| Step | OLD (❌ dialog) | NEW (✅ silent) |
|------|----------------|-----------------|
| 6 — Strikeout OFF | `executeUnoCommand(".uno:Strikeout")` | `executeUnoCommand(".uno:CharStrikeout", { CharStrikeout: { type: "unsigned short", value: 0 } })` |
| 7 — Black text | `executeUnoCommand(".uno:Color", { FontColor: { type: "long", value: 0x000000 } })` | `executeUnoCommand(".uno:CharColor", { CharColor: { type: "long", value: 0x000000 } })` |

### `use-collabora-postmessage.ts` (infrastructure — unchanged between R6 and R7)

```javascript
// OLD — sent empty {} as Args, causing dialog dispatch
sendMessage({ MessageId: "Send_UNO_Command", Values: { Command: command, Args: args } });

// NEW — filters empty objects, sends "" instead
const hasArgs = args && Object.keys(args).length > 0;
sendMessage({ MessageId: "Send_UNO_Command", Values: { Command: command, Args: hasArgs ? args : "" } });
```

**Validation required (V3)**: After applying the property-setter fixes:
1. Apply fallback on a clause → no dialog popups at any step
2. Confirm strikethrough + gray text on original excerpt
3. Confirm green bg + bold + dark green text on replacement
4. Undo the fallback → no dialog popups, text reverted cleanly
5. Re-check highlighting → still works correctly

---

## Summary of Decisions

| ID | Decision | Confidence | Validation |
|----|----------|-----------|------------|
| R1 | Keep `UserCanWrite: true`; add `ReadOnly: true` + transparent overlay | High | ✅ V1 passed — `ReadOnly: true` preserves postMessage channel |
| R2 | ~~Use `.uno:InsertBookmark` / `.uno:GoToBookmark` for anchors~~ → **ABANDONED**: use enhanced text-search navigation | N/A | ❌ V2 failed — `.uno:InsertBookmark` opens dialog, not programmable via postMessage |
| R3 | Replace `GoLeft` selection with `ExecuteSearch` in undo hook | High | Low risk — search-based selection is used throughout existing hooks successfully |
| R4 | Rewrite fallback redline to use `ExecuteSearch` for re-selection; 500ms delays | High | Low risk — follows proven pattern from undo hook |
| R5 | `ReadOnly: true` in CheckFileInfo is safe with `UserCanWrite: true` | High | ✅ Validated — works correctly in running instance |
| R6 | Fix empty-object args `{}` and wrong arg names; fix `executeUnoCommand` infrastructure | Medium | ❌ Insufficient — dialog still appeared (see R7) |
| R7 | Replace dialog commands (`.uno:Strikeout`, `.uno:Color`, `.uno:Bold`) with property setters (`.uno:CharStrikeout`, `.uno:CharColor`, `.uno:CharWeight`) | High | Pending V3 validation |