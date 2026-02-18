/**
 * Collabora Document Viewer — Main Component
 * Feature 010 T013: Embeds Collabora Online in contract detail page via iframe.
 *
 * Handles:
 * - Session initialization (fetch iframe URL + WOPI token)
 * - iframe rendering with read-only, minimal-chrome configuration
 * - PostMessage communication for UI stripping and navigation
 * - Document reload with version-token cache busting (T019)
 * - Re-navigation after reload (T020)
 * - Loading overlay during reload (T021)
 * - Error fallback when Collabora is unavailable (T022)
 */

"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { Loader2, FileDown, RefreshCcw, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import type {
  CollaboraViewerProps,
  CreateSessionResponse,
} from "@/types/collabora";
import { useCollaboraPostMessage } from "./use-collabora-postmessage";
import { useClauseNavigation } from "./use-clause-navigation";
import { useClauseHighlighting } from "./use-clause-highlighting";
import { useFallbackRedline } from "./use-fallback-redline";
import { useUndoRedline } from "./use-undo-redline";

interface ViewerState {
  status: "loading" | "ready" | "error" | "reloading";
  error: string | null;
  session: CreateSessionResponse | null;
}

export function CollaboraDocumentViewer({
  contractId,
  contractTitle,
  fileType,
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
}: CollaboraViewerProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [state, setState] = useState<ViewerState>({
    status: "loading",
    error: null,
    session: null,
  });
  const prevReloadTriggerRef = useRef(reloadTrigger);

  // ─── Stable refs for callback props ─────────────────────────────────
  // Prevents initSession / hooks from being recreated on every parent render
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
      setState({ status: "ready", error: null, session });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to initialize Collabora viewer";
      console.error("[Collabora] Session initialization error:", error);
      setState({ status: "error", error: message, session: null });
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

  const handleNavigationFailed = useCallback((clauseId: string) => {
    toast.warning("Could not locate clause in document", {
      description: `Clause navigation failed for clause ${clauseId}`,
    });
  }, []);

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

  // ─── Clause navigation hook ────────────────────────────────────────
  useClauseNavigation({
    selectedClauseId: selectedClauseId ?? null,
    clauses,
    isDocumentLoaded,
    executeUnoCommand,
    onNavigationFailed: handleNavigationFailed,
  });

  // ─── Clause highlighting hook (risk-level colors) ─────────────────
  const onHighlightingCompleteRef = useRef(onHighlightingComplete);
  onHighlightingCompleteRef.current = onHighlightingComplete;
  const handleHighlightingComplete = useCallback(() => {
    onHighlightingCompleteRef.current?.();
  }, []);

  useClauseHighlighting({
    clauses,
    isDocumentLoaded,
    executeUnoCommand,
    sendMessage,
    highlightsAlreadyApplied: highlightsApplied,
    onHighlightingComplete: handleHighlightingComplete,
  });

  // ─── Fallback redline hook (strikethrough + insert) ──────────────
  const onRedlineAppliedRef = useRef(onRedlineApplied);
  onRedlineAppliedRef.current = onRedlineApplied;
  const handleRedlineApplied = useCallback(() => {
    onRedlineAppliedRef.current?.();
  }, []);

  useFallbackRedline({
    isDocumentLoaded,
    executeUnoCommand,
    sendMessage,
    pendingRedline: pendingRedline ?? null,
    onRedlineApplied: handleRedlineApplied,
  });

  // ─── Undo redline hook (revert fallback) ──────────────────────────
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
  });

  // ─── Reload on trigger change (T019) ───────────────────────────────
  useEffect(() => {
    if (reloadTrigger > 0 && reloadTrigger !== prevReloadTriggerRef.current) {
      prevReloadTriggerRef.current = reloadTrigger;
      // Show reloading state
      setState((prev) => ({ ...prev, status: "reloading" }));
      resetPostMessage();
      // Re-initialize session with fresh token (new version)
      initSession().then(() => {
        // Session state will update, triggering iframe re-render
      });
    }
  }, [reloadTrigger, initSession, resetPostMessage]);

  // ─── Error Fallback UI (T022) ──────────────────────────────────────
  if (state.status === "error") {
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
              setState({ status: "loading", error: null, session: null });
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

  // ─── Timeout Fallback (T025) ───────────────────────────────────────
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
            setState({ status: "loading", error: null, session: null });
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

  // ─── Loading state ─────────────────────────────────────────────────
  if (state.status === "loading" || !state.session) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          Connecting to document viewer…
        </p>
      </div>
    );
  }

  // ─── Viewer (iframe) ───────────────────────────────────────────────
  return (
    <div className="relative h-full w-full">
      {/* Loading / Reloading overlay (T021) */}
      {(isCollaboraLoading || state.status === "reloading") && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/50 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              {state.status === "reloading"
                ? "Updating document…"
                : "Loading document…"}
            </p>
          </div>
        </div>
      )}

      {/* Collabora iframe
          NOTE: We open Collabora with UserCanWrite: true so that
          .uno:ExecuteSearch works via postMessage (read-only mode blocks
          search commands). The editing UI is stripped via postMessage
          (Hide_Menubar, Collapse_Notebookbar, etc.). The document is
          safe because we don't implement the PutFile WOPI endpoint,
          so no changes can ever be saved back. */}
      <iframe
        ref={iframeRef}
        src={state.session.iframeUrl}
        className="h-full w-full border-0"
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"
        allow="clipboard-read; clipboard-write"
        title={`Document: ${contractTitle}`}
      />
    </div>
  );
}
