# Internal Contracts: Hook & Context Interfaces

**Feature**: 011-collabora-viewer-fixes
**Date**: 2026-02-19

No new external API routes are introduced by this feature. All changes are internal to the Collabora viewer subsystem. This document describes the internal component contracts (hook signatures, context interfaces, callback shapes) that define the boundaries between the modified modules.

---

## `useCollaboraPendingQueue` (new hook)

**File**: `src/app/(app)/contracts/[id]/_components/collabora-viewer/use-pending-document-queue.ts`

### Context Provider

```typescript
// Mount at contract page level (page.tsx)
<CollaboraPendingQueueProvider contractId={contractId}>
  {children}
</CollaboraPendingQueueProvider>
```

### Hook Return Value

```typescript
interface CollaboraPendingQueueHook {
  // Add a change to the queue. If viewer is mounted, apply immediately.
  enqueueChange: (change: Omit<PendingDocumentChange, 'id' | 'status'>) => void;

  // Drain all pending entries by calling applyFn for each in decidedAt order.
  // Marks each entry 'applying' → 'complete' | 'failed'.
  drainQueue: (applyFn: (change: PendingDocumentChange) => Promise<void>) => Promise<void>;

  // Count of pending + failed entries (for UI badge / loading indicator)
  pendingCount: number;

  // Whether the queue is currently draining
  isDraining: boolean;
}
```

### Usage by decision buttons

```typescript
const { enqueueChange } = useCollaboraPendingQueue();

// On APPLY_FALLBACK decision:
enqueueChange({
  clauseId,
  type: 'APPLY_FALLBACK',
  payload: { excerpt, replacementText } satisfies FindingRedlineData,
  decidedAt: new Date().toISOString(),
});

// On UNDO decision (that reverts a fallback):
enqueueChange({
  clauseId,
  type: 'UNDO_FALLBACK',
  payload: { excerpt, insertedText, riskLevel } satisfies FindingUndoRedlineData,
  decidedAt: new Date().toISOString(),
});
```

---

## `useClauseHighlighting` — return value

**File**: `use-clause-highlighting.ts`

### Return value

```typescript
interface ClauseHighlightingResult {
  // No return values — bookmark anchoring removed (V2 failed).
  // Highlighting is fire-and-forget; completion is signaled via onHighlightingComplete callback.
}
```

~~`anchorResults` was previously consumed by `useClauseNavigation`.~~ **Removed**: Bookmark anchoring abandoned after V2 validation failed.

---

## `useClauseNavigation` — modified signature

**File**: `use-clause-navigation.ts`

### Props

```typescript
interface UseClauseNavigationProps {
  // ... existing props unchanged ...

  // Called when navigation fails after all text-search fallback attempts
  onNavigationFailed?: (clauseId: string) => void;
}
```

~~`anchorResults` prop removed~~ — no bookmarks are embedded.

### Navigation strategy (text-search only)

```
1. Enhanced text search with normalization (NFC, dash/quote equivalence, whitespace collapsing)
   → ExecuteSearch with progressive fallback strings (full excerpt → shorter → first sentence)
   → occurrence indexing for duplicate text

2. If all fallback strings fail → call onNavigationFailed(clauseId)
```

---

## `anchor.ts` — exported functions (NO-OPS)

**File**: `src/lib/collabora/anchor.ts`

**Status**: All functions are **no-ops** — `.uno:InsertBookmark` opens a dialog in Collabora Online (V2 validation failed).

```typescript
// Canonical bookmark name for a clause (retained for potential future use)
export function clauseAnchorName(clauseId: string): string;
// → 'clause-{clauseId}'

// NO-OP: returns null, logs warning. InsertBookmark opens dialog.
export function buildInsertBookmarkMessage(clauseId: string): null;

// NO-OP: returns null, logs warning. GoToBookmark depends on bookmarks being inserted.
export function buildGoToBookmarkMessage(clauseId: string): null;
```

Callers must check for `null` before sending (or simply not call these functions).

---

## `executeUnoCommand` — infrastructure fix (R6)

**File**: `use-collabora-postmessage.ts`

### Problem

1. **Empty object safety**: Empty `{}` as Args causes Collabora to open dialogs.
2. **Dialog-based commands**: `.uno:Strikeout`, `.uno:Color`, `.uno:Bold` are **inherently dialog commands** — they ALWAYS open the Character dialog regardless of argument format. The empty-object fix alone is NOT sufficient.

### Fix — infrastructure (safety net)

```typescript
const executeUnoCommand = useCallback(
  (command: string, args?: Record<string, unknown>) => {
    if (!isDocumentLoaded) return;
    const hasArgs = args && Object.keys(args).length > 0;
    sendMessage({
      MessageId: "Send_UNO_Command",
      Values: {
        Command: command,
        Args: hasArgs ? args : "",
      },
    });
  },
  [sendMessage, isDocumentLoaded]
);
```

### Fix — replace dialog commands with property setters

Dialog commands MUST be replaced with their property-setter equivalents. These follow the **same pattern** as `.uno:CharBackColor` (confirmed working).

| Dialog Command (❌ opens dialog) | Property Setter (✅ silent) | Args |
|---|---|---|
| `.uno:Strikeout` | `.uno:CharStrikeout` | `{CharStrikeout: {type: "unsigned short", value: N}}` — 0=NONE, 1=SINGLE |
| `.uno:Color` | `.uno:CharColor` | `{CharColor: {type: "long", value: N}}` — decimal RGB |
| `.uno:Bold` | `.uno:CharWeight` | `{CharWeight: {type: "float", value: N}}` — 100=NORMAL, 150=BOLD |

### Commands that work as-is (no dialog variant)

| Command | Args | Notes |
|---------|------|-------|
| `.uno:CharBackColor` | `{CharBackColor: {type: "long", value: N}}` | ✅ Already a property setter |
| `.uno:GoToStartOfDoc` | No args | Cursor command — no dialog |
| `.uno:GoToEndOfSel` | No args | Cursor command — no dialog |
| `.uno:Delete` | No args | Action command — no dialog |
| `.uno:InsertText` | `{Text: {type: "string", value: "..."}}` | ✅ Works with args |
| `.uno:ExecuteSearch` | `{SearchItem.*: {...}}` | ✅ Works with args |

---

## `collabora-document-viewer.tsx` — preparation phase props

### Updated `onNavigationFailed` integration

```typescript
// In collabora-document-viewer.tsx internal state:
const [failedNavigationClauseIds, setFailedNavigationClauseIds] = useState<Set<string>>(new Set());

const handleNavigationFailed = useCallback((clauseId: string) => {
  setFailedNavigationClauseIds(prev => new Set(prev).add(clauseId));
  // Also call props.onNavigationFailed if provided
  props.onNavigationFailed?.(clauseId);
}, [props.onNavigationFailed]);
```

`failedNavigationClauseIds` is passed to the clause list panel so it can render an inline "Not found in document" indicator on affected clause items.

---

## `CheckFileInfoResponse` — WOPI contract change

**File**: `src/app/api/wopi/files/[fileId]/route.ts`

Added field to the response body (conditional on research validation R1/R5):

```typescript
{
  // ... existing fields ...
  UserCanWrite: true,          // Unchanged — required for programmatic commands
  ReadOnly: true,              // NEW — instructs Collabora to present view-only UI
  HideSaveOption: true,        // Unchanged
  UserCanNotWriteRelative: true, // Unchanged
}
```

**Gate**: Only add `ReadOnly: true` if empirical testing (R5) confirms it does not break postMessage UNO commands. If it does, omit this field.

---

## Overlay Component Contract

A new `DocumentPreparationOverlay` component renders during the `'preparing'` and `'draining'` phases:

```typescript
interface DocumentPreparationOverlayProps {
  visible: boolean;
  message?: string;  // Default: "Preparing document…"
}
```

**Rendered as**: A `div` with `position: absolute; inset: 0; z-index: 10; background: white/95` containing a centered spinner and the message text. Uses shadcn `Skeleton` or a simple spinner consistent with the existing loading overlay pattern in `collabora-document-viewer.tsx`.

---

## Save Failure Toast Contract

On any `Action_Save` failure or WOPI PutFile error:

```typescript
// Uses existing sonner toast setup
import { toast } from 'sonner';

toast.error('Document save failed', {
  description: 'Your change has been queued and will be retried when you reopen the viewer.',
  duration: 8000,
});
```

This is the FR-025 compliance implementation. The pending change is retained with `status: 'failed'` and retried on next viewer mount.
