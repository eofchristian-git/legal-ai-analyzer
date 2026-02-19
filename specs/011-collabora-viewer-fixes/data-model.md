# Data Model: Collabora Viewer Reliability & UX Fixes

**Feature**: 011-collabora-viewer-fixes
**Date**: 2026-02-19

---

## Database Schema Changes

**None.** This feature makes no changes to `prisma/schema.prisma`. All state managed by this feature is either:
- Persisted in the DOCX file itself (highlights, redlines) via the existing WOPI PutFile path
- Transient client-side state in React (pending queue, preparation phase)
- Already stored in existing DB tables (`Document.updatedAt`, `ClauseDecision` event log)

---

## New TypeScript Types (`src/types/collabora.ts` additions)

### `PendingDocumentChange`

SPA-level transient state representing a document change that has been requested but not yet applied via UNO commands.

```typescript
type PendingChangeType = 'APPLY_FALLBACK' | 'UNDO_FALLBACK';
type PendingChangeStatus = 'pending' | 'applying' | 'in_progress' | 'complete' | 'failed';
// 'in_progress': UNO command sequence started but viewer unmounted before completion (FR-026).

interface PendingDocumentChange {
  id: string;                                        // UUID — deduplication key
  clauseId: string;                                  // References AnalysisClause.id
  type: PendingChangeType;
  payload: FindingRedlineData | FindingUndoRedlineData; // Existing types, unchanged
  decidedAt: string;                                 // ISO-8601; used for ordering
  status: PendingChangeStatus;
  failureReason?: string;                            // Set if status === 'failed'
}
```

**Lifecycle**:
```
enqueueChange()  →  status: 'pending'
drainQueue()     →  status: 'applying'     (while UNO commands execute)
markInProgress() →  status: 'in_progress' (if viewer unmounts mid-sequence; FR-026)
                 →  status: 'complete'    (after Action_Save confirms)
                 →  status: 'failed'      (on UNO error or save failure)
drainQueue()     →  status: 'pending'     (resets 'in_progress' entries after partial cleanup)
retryFailed()    →  status: 'pending'     (for status === 'failed' entries on next viewer open;
                                           handled implicitly by drainQueue processing all non-complete entries)
```

**Ordering rule**: Entries are processed in ascending `decidedAt` order. If two entries share the same `decidedAt` timestamp, queue insertion order is used as tiebreaker.

---

### ~~`AnchorEmbedResult`~~ (Removed)

~~Tracks whether a clause anchor was successfully embedded during document preparation.~~

**Removed**: `.uno:InsertBookmark` opens a dialog in Collabora Online (V2 validation failed). No bookmark anchoring occurs. The type definition remains in `src/types/collabora.ts` but is unused. Navigation uses text-search exclusively.

---

### `CollaboraViewerProps` additions

New optional props added to the existing `CollaboraViewerProps` interface:

```typescript
interface CollaboraViewerProps {
  // ... existing props unchanged ...

  // Called when text-search navigation fails for a clause after all fallback attempts
  onNavigationFailed?: (clauseId: string) => void;

  // Called on programmatic save failure (FR-025)
  onSaveFailed?: (reason: string) => void;
}
```

---

### `CheckFileInfoResponse` addition

New optional field added to the existing WOPI type:

```typescript
interface CheckFileInfoResponse {
  // ... existing fields unchanged ...

  // Instructs Collabora to open document in view/read-only presentation mode
  // Does NOT affect UserCanWrite or programmatic command channels
  ReadOnly?: boolean;
}
```

---

## Client State Model (React)

### Preparation Phase State Machine

Managed in `collabora-document-viewer.tsx` via `useState`:

```
'idle'        Initial state; no session loaded
'loading'     Session fetch in progress or iframe loading
'preparing'   Document loaded; highlights running
              (loading overlay shown: "Preparing document…")
'ready'       Preparation complete; document visible to reviewer
'reloading'   Post-decision reload (existing state, unchanged)
'error'       Timeout or unrecoverable failure
```

Transitions:
```
idle       → loading     (on session fetch start)
loading    → preparing   (on isDocumentLoaded = true AND highlightsApplied = false)
loading    → ready       (on isDocumentLoaded = true AND highlightsApplied = true)
loading    → draining    (on isDocumentLoaded = true AND pendingQueue.length > 0)
preparing  → ready       (on onHighlightingComplete callback)
draining   → ready       (on queue drain complete)
*          → error       (on timeout or session error)
```

### Pending Queue State

Managed by `useCollaboraPendingQueue` hook via `useReducer`:

```typescript
type QueueAction =
  | { type: 'ENQUEUE'; change: PendingDocumentChange }
  | { type: 'SET_STATUS'; id: string; status: PendingChangeStatus; failureReason?: string }
  | { type: 'CLEAR_COMPLETE' }  // Prune completed entries to keep queue small

interface QueueState {
  changes: PendingDocumentChange[];
}
```

---

## ~~Anchor Naming Convention~~ (Unused)

~~Clause anchors embedded in the DOCX follow a deterministic naming scheme: `clause-{clauseId}`.~~

**Not in use**: Bookmark anchoring was abandoned after V2 validation failed (`.uno:InsertBookmark` opens a dialog). The naming convention is retained in `anchor.ts` → `clauseAnchorName()` for potential future use if Collabora adds silent bookmark insertion support.

---

## Data Flow Summary

```
User clicks "Accept Fallback"
    ↓
ClauseDecision event written to DB (existing flow, unchanged)
    ↓
enqueueChange({ type: 'APPLY_FALLBACK', clauseId, payload })
    ↓
  If viewer mounted:        If viewer not mounted:
  ↓                         ↓
  applyRedline()            change remains 'pending' in queue
  (immediate)               ↓
                            User opens viewer
                            ↓
                            drainQueue() runs (overlay shown)
                            ↓
                            applyRedline() for each pending entry
                            ↓
                            Action_Save → WOPI PutFile → change 'complete'
                            ↓
                            Overlay removed, document visible
```
