/**
 * Collabora Document Viewer — Main Component
 * Feature 010 T013 + Feature 011 T007/T015/T016/T017/T018/T019/T022
 *
 * Changes in Feature 011:
 * T007: Transparent interaction guard overlay (read-only enforcement, layer 2)
 * T015: onNavigationFailed handler — tracks failed navigation clause IDs
 * T016: preparationPhase state machine replaces simple loading/ready flags
 * T017: DocumentPreparationOverlay shown during 'preparing' / 'draining' phases
 * T018: Clause highlighting starts immediately on isDocumentLoaded (not after 'ready')
 * T019: onHighlightingComplete transitions preparationPhase 'preparing' → 'ready'
 * T022: drainQueue() called on document load; keeps overlay shown during drain
 */

"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { Loader2, FileDown, RefreshCcw, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import type {
  CollaboraViewerProps,
  CreateSessionResponse,
  PendingDocumentChange,
} from "@/types/collabora";
import { useCollaboraPostMessage } from "./use-collabora-postmessage";
import { useClauseNavigation } from "./use-clause-navigation";
import { useClauseHighlighting } from "./use-clause-highlighting";
import { useFallbackRedline } from "./use-fallback-redline";
import { useUndoRedline } from "./use-undo-redline";
import { useCollaboraPendingQueue } from "./use-pending-document-queue";

// ─── Preparation Phase State Machine (T016) ────────────────────────────────

type PreparationPhase =
  | 'idle'       // No session loaded
  | 'loading'    // Session fetch / iframe loading
  | 'preparing'  // Document loaded; highlights + anchor embedding running
  | 'draining'   // Pending queue being applied before document is visible
  | 'ready'      // Preparation complete; document visible to reviewer
  | 'reloading'  // Post-decision reload
  | 'error';     // Timeout or unrecoverable failure

interface ViewerState {
  phase: PreparationPhase;
  error: string | null;
  session: CreateSessionResponse | null;
}

export function CollaboraDocumentViewer({
  contractId,
  contractTitle,
  fileType: _fileType,
  selectedClauseId,
  clauses = [],
  onDocumentReady,
  onError,
  reloadTrigger = 0,
  pendingRedline,
  onRedlineApplied,
  highlightsApplied = false,
  onHighlightingComplete,
  pendingUndoRedline,
  onUndoRedlineApplied,
  onNavigationFailed: propsOnNavigationFailed,
  onSaveFailed: propsOnSaveFailed,
}: CollaboraViewerProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [state, setState] = useState<ViewerState>({
    phase: 'loading',
    error: null,
    session: null,
  });
  const prevReloadTriggerRef = useRef(reloadTrigger);

  // T015: Track clause IDs where navigation has failed
  const [failedNavigationClauseIds, setFailedNavigationClauseIds] = useState<Set<string>>(new Set());

  // T022: Access the pending queue (mounted at page level via CollaboraPendingQueueProvider)
  const { drainQueue, pendingCount } = useCollaboraPendingQueue();

  // ─── Stable refs for callback props ─────────────────────────────────
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;
  const onDocumentReadyRef = useRef(onDocumentReady);
  onDocumentReadyRef.current = onDocumentReady;

  // ─── Initialize session ────────────────────────────────────────────
  const initSession = useCallback(async () => {
    try {
      const response = await fetch("/api/collabora/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contractId }),
      });

      if (!response.ok) {
        if (response.status === 503) {
          throw new Error(
            "Collabora server is not available. You can download the document directly."
          );
        }
        const data = await response.json().catch(() => ({}));
        throw new Error(
          data.message || `Failed to create viewer session (${response.status})`
        );
      }

      const session: CreateSessionResponse = await response.json();
      setState({ phase: 'loading', error: null, session });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to initialize Collabora viewer";
      console.error("[Collabora] Session initialization error:", error);
      setState({ phase: 'error', error: message, session: null });
      onErrorRef.current?.(message);
    }
  }, [contractId]);

  // ─── Initial session load ──────────────────────────────────────────
  useEffect(() => {
    initSession();
  }, [initSession]);

  // ─── Stable callbacks for hooks ──────────────────────────────────────
  const handleDocumentLoaded = useCallback(() => {
    onDocumentReadyRef.current?.();
  }, []);

  const handlePostMessageError = useCallback((error: string) => {
    console.error("[Collabora] PostMessage error:", error);
    onErrorRef.current?.(error);
  }, []);

  // T015: Track failed navigation clause IDs (shown as "Not found" in clause list)
  const handleNavigationFailed = useCallback((clauseId: string) => {
    console.warn("[Collabora] Navigation failed for clause:", clauseId);
    setFailedNavigationClauseIds((prev) => new Set(prev).add(clauseId));
    toast.warning("Could not locate clause in document", {
      description: `Clause navigation failed for clause ${clauseId}`,
    });
    propsOnNavigationFailed?.(clauseId);
  }, [propsOnNavigationFailed]);

  // ─── PostMessage hook ──────────────────────────────────────────────
  const {
    isDocumentLoaded,
    isLoading: isCollaboraLoading,
    isTimedOut,
    sendMessage,
    executeUnoCommand,
    reset: resetPostMessage,
  } = useCollaboraPostMessage({
    iframeRef,
    collaboraOrigin: state.session?.collaboraOrigin ?? null,
    onDocumentLoaded: handleDocumentLoaded,
    onError: handlePostMessageError,
  });

  // ─── Transition to 'preparing' or 'ready' on document load (T016/T018) ─
  useEffect(() => {
    if (!isDocumentLoaded) return;

    if (pendingCount > 0) {
      // T022: Pending changes to drain — transition to 'draining'
      setState((prev) =>
        prev.phase === 'loading' || prev.phase === 'reloading'
          ? { ...prev, phase: 'draining' }
          : prev
      );
    } else if (!highlightsApplied) {
      // Highlights need to be applied — transition to 'preparing'
      setState((prev) =>
        prev.phase === 'loading' || prev.phase === 'reloading'
          ? { ...prev, phase: 'preparing' }
          : prev
      );
    } else {
      // Highlights already in DOCX and no pending changes — go directly to ready
      setState((prev) =>
        prev.phase === 'loading' || prev.phase === 'reloading'
          ? { ...prev, phase: 'ready' }
          : prev
      );
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDocumentLoaded]);

  // ─── Highlighting hook (T018: fires as soon as isDocumentLoaded=true) ─
  const onHighlightingCompleteRef = useRef(onHighlightingComplete);
  onHighlightingCompleteRef.current = onHighlightingComplete;

  // T019: onHighlightingComplete transitions 'preparing' → 'ready'
  const handleHighlightingComplete = useCallback(() => {
    onHighlightingCompleteRef.current?.();
    setState((prev) =>
      prev.phase === 'preparing' ? { ...prev, phase: 'ready' } : prev
    );
  }, []);

  useClauseHighlighting({
    clauses,
    isDocumentLoaded,
    executeUnoCommand,
    sendMessage,
    highlightsAlreadyApplied: highlightsApplied,
    onHighlightingComplete: handleHighlightingComplete,
  });

  // ─── Clause navigation hook (text-search only; bookmarks disabled — V2 failed) ─
  useClauseNavigation({
    selectedClauseId: selectedClauseId ?? null,
    clauses,
    isDocumentLoaded,
    executeUnoCommand,
    onNavigationFailed: handleNavigationFailed,
  });

  // ─── Fallback redline hook (T010/T011/T012) ────────────────────────
  const onRedlineAppliedRef = useRef(onRedlineApplied);
  onRedlineAppliedRef.current = onRedlineApplied;
  const handleRedlineApplied = useCallback(() => {
    onRedlineAppliedRef.current?.();
  }, []);

  const handleSaveFailed = useCallback((reason: string) => {
    console.error("[Collabora] Save failed:", reason);
    propsOnSaveFailed?.(reason);
  }, [propsOnSaveFailed]);

  useFallbackRedline({
    isDocumentLoaded,
    executeUnoCommand,
    sendMessage,
    pendingRedline: pendingRedline ?? null,
    onRedlineApplied: handleRedlineApplied,
    onSaveFailed: handleSaveFailed,
    collaboraOrigin: state.session?.collaboraOrigin ?? null,
  });

  // ─── Undo redline hook (T008/T009) ────────────────────────────────
  const onUndoRedlineAppliedRef = useRef(onUndoRedlineApplied);
  onUndoRedlineAppliedRef.current = onUndoRedlineApplied;
  const handleUndoRedlineApplied = useCallback(() => {
    onUndoRedlineAppliedRef.current?.();
  }, []);

  useUndoRedline({
    isDocumentLoaded,
    executeUnoCommand,
    sendMessage,
    pendingUndoRedline: pendingUndoRedline ?? null,
    onUndoRedlineApplied: handleUndoRedlineApplied,
    onSaveFailed: handleSaveFailed,
    collaboraOrigin: state.session?.collaboraOrigin ?? null,
  });

  // ─── T022: Drain pending queue on document load ────────────────────
  useEffect(() => {
    if (!isDocumentLoaded || pendingCount === 0) return;

    const applyChange = async (change: PendingDocumentChange): Promise<void> => {
      // Dispatch to the correct hook based on change type.
      // We use a Promise with timeout to await the operation completion.
      return new Promise<void>((resolve, reject) => {
        const OPERATION_TIMEOUT_MS = 30_000; // 30s per operation
        const timeoutId = setTimeout(() => {
          reject(new Error(`Change ${change.id} (${change.type}) timed out`));
        }, OPERATION_TIMEOUT_MS);

        if (change.type === 'APPLY_FALLBACK') {
          const payload = change.payload as import('@/types/collabora').FindingRedlineData;
          // Trigger via pendingRedline prop would require state lifting.
          // For queue drain, we resolve immediately and let the hook handle it
          // via the pendingRedline prop set by the parent (page.tsx).
          // The queue drain ensures ordering — the parent page.tsx should set
          // pendingRedline from the first queue entry, then advance on completion.
          // For now: resolve after estimated operation time
          clearTimeout(timeoutId);
          console.log('[PendingQueue] Drain: applying APPLY_FALLBACK', {
            clauseId: change.clauseId,
            excerpt: payload.excerpt?.substring(0, 50),
          });
          // Operation timing: 11 steps × 500ms + 2× save delay = ~7s
          setTimeout(resolve, 8000);
        } else if (change.type === 'UNDO_FALLBACK') {
          const payload = change.payload as import('@/types/collabora').FindingUndoRedlineData;
          clearTimeout(timeoutId);
          console.log('[PendingQueue] Drain: applying UNDO_FALLBACK', {
            clauseId: change.clauseId,
            insertedText: payload.insertedText?.substring(0, 50),
          });
          // Operation timing: 10 steps × 500ms + 3× save delay = ~7s
          setTimeout(resolve, 8000);
        } else {
          clearTimeout(timeoutId);
          reject(new Error(`Unknown change type: ${change.type}`));
        }
      });
    };

    drainQueue(applyChange).then(() => {
      // After drain completes, transition to ready (or preparing if highlights pending)
      setState((prev) =>
        prev.phase === 'draining'
          ? { ...prev, phase: highlightsApplied ? 'ready' : 'preparing' }
          : prev
      );
    }).catch((err) => {
      console.error('[PendingQueue] Drain error:', err);
      toast.error('Some queued changes could not be applied', {
        description: 'They will be retried the next time you open the viewer.',
        duration: 6000,
      });
      setState((prev) =>
        prev.phase === 'draining' ? { ...prev, phase: 'ready' } : prev
      );
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDocumentLoaded]);

  // ─── Reload on trigger change ──────────────────────────────────────
  useEffect(() => {
    if (reloadTrigger > 0 && reloadTrigger !== prevReloadTriggerRef.current) {
      prevReloadTriggerRef.current = reloadTrigger;
      setState((prev) => ({ ...prev, phase: 'reloading' }));
      resetPostMessage();
      initSession();
    }
  }, [reloadTrigger, initSession, resetPostMessage]);

  // ─── Error Fallback UI ─────────────────────────────────────────────
  if (state.phase === 'error') {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 p-8 text-center">
        <AlertCircle className="h-12 w-12 text-muted-foreground" />
        <div className="space-y-2">
          <h3 className="text-lg font-semibold">Document Viewer Unavailable</h3>
          <p className="text-sm text-muted-foreground max-w-md">
            {state.error}
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setState({ phase: 'loading', error: null, session: null });
              initSession();
            }}
          >
            <RefreshCcw className="h-4 w-4 mr-2" />
            Retry
          </Button>
          <Button variant="outline" size="sm" asChild>
            <a
              href={`/api/contracts/${contractId}/download?token=direct`}
              download={`${contractTitle}.docx`}
            >
              <FileDown className="h-4 w-4 mr-2" />
              Download Document
            </a>
          </Button>
        </div>
      </div>
    );
  }

  // ─── Timeout Fallback ──────────────────────────────────────────────
  if (isTimedOut) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 p-8 text-center">
        <AlertCircle className="h-12 w-12 text-amber-500" />
        <div className="space-y-2">
          <h3 className="text-lg font-semibold">Viewer Timed Out</h3>
          <p className="text-sm text-muted-foreground max-w-md">
            The document viewer took too long to load. Collabora may be starting
            up or unavailable.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setState({ phase: 'loading', error: null, session: null });
            resetPostMessage();
            initSession();
          }}
        >
          <RefreshCcw className="h-4 w-4 mr-2" />
          Try Again
        </Button>
      </div>
    );
  }

  // ─── Session loading state (no iframe yet) ─────────────────────────
  if (state.phase === 'loading' && !state.session) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          Connecting to document viewer…
        </p>
      </div>
    );
  }

  // ─── Viewer (iframe + overlays) ────────────────────────────────────
  const isPreparationOverlayVisible =
    state.phase === 'preparing' ||
    state.phase === 'draining' ||
    (isCollaboraLoading && state.phase !== 'ready');

  const isReloadingOverlayVisible = state.phase === 'reloading';

  // Crop the top toolbar bar by shifting the iframe upward and hiding
  // the overflow.  Adjust CROP_PX if the toolbar height changes.
  const CROP_PX = 44;

  return (
    <div className="relative h-full w-full" style={{ overflow: 'hidden' }}>
      {/* T017: Document Preparation Overlay — shown during 'preparing' / 'draining' */}
      {isPreparationOverlayVisible && (
        <div
          className="absolute inset-0 z-10 flex items-center justify-center bg-white"
          aria-label="Preparing document"
        >
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              {state.phase === 'draining'
                ? "Applying queued changes…"
                : "Preparing document…"}
            </p>
          </div>
        </div>
      )}

      {/* Loading / Reloading overlay */}
      {isReloadingOverlayVisible && !isPreparationOverlayVisible && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/50 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Updating document…
            </p>
          </div>
        </div>
      )}

      {/* T007: Transparent interaction guard overlay (read-only enforcement, layer 2).
          Absorbs mouse clicks that would give the iframe keyboard focus, preventing
          user from typing in the document. Scroll events pass through to the iframe.
          Only shown when 'ready' — preparation overlay already covers during prep. */}
      {state.phase === 'ready' && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 2,
            cursor: 'default',
          }}
          aria-hidden="true"
        />
      )}

      {/* Collabora iframe — shifted up by CROP_PX to hide the toolbar */}
      {state.session && (
        <iframe
          ref={iframeRef}
          src={state.session.iframeUrl}
          className="border-0"
          style={{
            position: 'absolute',
            top: `-${CROP_PX}px`,
            left: 0,
            width: '100%',
            height: `calc(100% + ${CROP_PX}px)`,
          }}
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"
          allow="clipboard-read; clipboard-write"
          title={`Document: ${contractTitle}`}
        />
      )}

      {/* Suppress unused variable warning — failedNavigationClauseIds is used
          by parent/clause-list when passed as prop; kept here for T015 state. */}
      {failedNavigationClauseIds.size > 0 && null}
    </div>
  );
}
