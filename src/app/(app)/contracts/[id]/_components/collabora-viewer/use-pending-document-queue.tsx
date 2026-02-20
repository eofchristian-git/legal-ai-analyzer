/**
 * Collabora Pending Document Queue
 * Feature 011 T020: SPA-level transient queue for document changes that need
 * to be applied via UNO commands — even when the viewer was not mounted when
 * the decision was made.
 *
 * Architecture:
 * - React context mounted at contract page level (page.tsx, T021)
 * - useReducer manages the queue state (plain React state, no localStorage)
 * - enqueueChange() adds a change; drainQueue() processes all pending entries
 * - T027: Detects 'in_progress' entries on drain start and resets them to 'pending'
 *   (partial redline detection — viewer unmount mid-operation)
 *
 * Entries are processed in ascending decidedAt order (T020).
 */

"use client";

import {
  createContext,
  useContext,
  useReducer,
  useState,
  useCallback,
  useRef,
  useLayoutEffect,
  ReactNode,
} from "react";
import type { PendingDocumentChange, PendingChangeStatus } from "@/types/collabora";

// ─── Queue Reducer ────────────────────────────────────────────────────────────

type QueueAction =
  | { type: 'ENQUEUE'; change: PendingDocumentChange }
  | { type: 'SET_STATUS'; id: string; status: PendingChangeStatus; failureReason?: string }
  | { type: 'CLEAR_COMPLETE' }
  | { type: 'RESET_IN_PROGRESS' }; // T027: reset 'in_progress' entries to 'pending'

interface QueueState {
  changes: PendingDocumentChange[];
}

function queueReducer(state: QueueState, action: QueueAction): QueueState {
  switch (action.type) {
    case 'ENQUEUE':
      return { changes: [...state.changes, action.change] };

    case 'SET_STATUS':
      return {
        changes: state.changes.map((c) =>
          c.id === action.id
            ? { ...c, status: action.status, failureReason: action.failureReason }
            : c
        ),
      };

    case 'CLEAR_COMPLETE':
      return { changes: state.changes.filter((c) => c.status !== 'complete') };

    case 'RESET_IN_PROGRESS':
      // T027: On drain start, reset any 'in_progress' entries to 'pending'.
      // These are entries where the viewer unmounted mid-UNO-sequence.
      // The drain will re-process them from scratch.
      return {
        changes: state.changes.map((c) =>
          c.status === 'in_progress' ? { ...c, status: 'pending' } : c
        ),
      };

    default:
      return state;
  }
}

// ─── Context ──────────────────────────────────────────────────────────────────

interface CollaboraPendingQueueHook {
  enqueueChange: (change: Omit<PendingDocumentChange, 'id' | 'status'>) => void;
  drainQueue: (applyFn: (change: PendingDocumentChange) => Promise<void>) => Promise<void>;
  pendingCount: number;
  isDraining: boolean;
  markInProgress: (id: string) => void;
}

// Default no-op implementation used when provider is not mounted
const defaultQueueHook: CollaboraPendingQueueHook = {
  enqueueChange: () => {},
  drainQueue: async () => {},
  pendingCount: 0,
  isDraining: false,
  markInProgress: () => {},
};

const CollaboraPendingQueueContext = createContext<CollaboraPendingQueueHook>(defaultQueueHook);

// ─── Provider ─────────────────────────────────────────────────────────────────

interface CollaboraPendingQueueProviderProps {
  contractId: string;
  children: ReactNode;
}

export function CollaboraPendingQueueProvider({
  contractId: _contractId,
  children,
}: CollaboraPendingQueueProviderProps) {
  const [state, dispatch] = useReducer(queueReducer, { changes: [] });
  const [isDraining, setIsDraining] = useState(false);
  const isDrainingRef = useRef(false); // used for sync guard inside drainQueue
  const stateRef = useRef(state);

  // Sync latest state into ref after each render (React 19: outside render body)
  useLayoutEffect(() => { stateRef.current = state; }, [state]);

  const enqueueChange = useCallback(
    (change: Omit<PendingDocumentChange, 'id' | 'status'>) => {
      const fullChange: PendingDocumentChange = {
        ...change,
        id: crypto.randomUUID(),
        status: 'pending',
      };
      console.log('[PendingQueue] Enqueuing change:', {
        id: fullChange.id,
        type: fullChange.type,
        clauseId: fullChange.clauseId,
        decidedAt: fullChange.decidedAt,
      });
      dispatch({ type: 'ENQUEUE', change: fullChange });
    },
    []
  );

  const markInProgress = useCallback((id: string) => {
    dispatch({ type: 'SET_STATUS', id, status: 'in_progress' });
  }, []);

  const drainQueue = useCallback(
    async (applyFn: (change: PendingDocumentChange) => Promise<void>) => {
      if (isDrainingRef.current) {
        console.log('[PendingQueue] Already draining — skipping');
        return;
      }
      isDrainingRef.current = true;
      setIsDraining(true);

      // T027: Reset any in_progress entries to pending before drain starts
      dispatch({ type: 'RESET_IN_PROGRESS' });

      // Small delay to let the RESET_IN_PROGRESS action propagate
      await new Promise<void>((resolve) => setTimeout(resolve, 50));

      const currentChanges = stateRef.current.changes;

      // Filter to entries that need processing (pending or failed)
      const toProcess = currentChanges
        .filter((c) => c.status === 'pending' || c.status === 'failed')
        .sort((a, b) => {
          // Sort by decidedAt ascending (T020: chronological order)
          const timeDiff = new Date(a.decidedAt).getTime() - new Date(b.decidedAt).getTime();
          if (timeDiff !== 0) return timeDiff;
          // Tiebreaker: insertion order (by array index — already preserved by sort stability)
          return currentChanges.indexOf(a) - currentChanges.indexOf(b);
        });

      console.log(`[PendingQueue] Draining ${toProcess.length} pending entries`);

      for (const change of toProcess) {
        dispatch({ type: 'SET_STATUS', id: change.id, status: 'applying' });

        try {
          await applyFn(change);
          dispatch({ type: 'SET_STATUS', id: change.id, status: 'complete' });
          console.log(`[PendingQueue] ✓ Applied change ${change.id} (${change.type})`);
        } catch (error) {
          const reason = error instanceof Error ? error.message : 'Unknown error';
          console.error(`[PendingQueue] ✗ Failed change ${change.id}:`, error);
          dispatch({
            type: 'SET_STATUS',
            id: change.id,
            status: 'failed',
            failureReason: reason,
          });
          // FR-025: continue with remaining entries despite failure
        }
      }

      // Prune completed entries to keep queue small
      dispatch({ type: 'CLEAR_COMPLETE' });

      isDrainingRef.current = false;
      setIsDraining(false);
      console.log('[PendingQueue] Drain complete');
    },
    []
  );

  const pendingCount = state.changes.filter(
    (c) => c.status === 'pending' || c.status === 'failed'
  ).length;

  return (
    <CollaboraPendingQueueContext.Provider
      value={{ enqueueChange, drainQueue, pendingCount, isDraining, markInProgress }}
    >
      {children}
    </CollaboraPendingQueueContext.Provider>
  );
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useCollaboraPendingQueue(): CollaboraPendingQueueHook {
  return useContext(CollaboraPendingQueueContext);
}
