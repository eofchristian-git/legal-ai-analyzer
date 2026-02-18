"use client";

/**
 * OnlyOffice Document Viewer — Main Component
 * Feature 009 T013: Embeds ONLYOFFICE Document Editor in contract detail page
 * Provides high-fidelity document rendering with formatting preservation
 */

import { useEffect, useState, useCallback, useRef } from "react";
import { DocumentEditor } from "@onlyoffice/document-editor-react";
import { Loader2, AlertTriangle, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SessionManager } from "./session-manager";
import { FindingComments } from "./finding-comments";
import { TrackedChanges } from "./tracked-changes";
import type { TokenResponse, OnlyOfficeViewerProps, FindingCommentData, TrackChangeData } from "@/types/onlyoffice";

/**
 * ONLYOFFICE Connector API (Developer/Enterprise Edition only).
 * executeMethod is callback-based, NOT Promise-based.
 * Use the execMethod() helper in injectors to wrap in a Promise.
 */
export type OOConnector = {
  executeMethod: (
    method: string,
    args?: unknown[],
    callback?: (result: unknown) => void
  ) => void;
};

interface ViewerState {
  loading: boolean;
  error: string | null;
  serverAvailable: boolean;
  sessionData: TokenResponse | null;
}

interface ExtendedViewerProps extends OnlyOfficeViewerProps {
  /** Findings to inject as comments */
  findings?: FindingCommentData[];
  /** Finding ID to navigate to in the document */
  navigateToFindingId?: string | null;
  /** Clause ID to navigate to — jumps to the first finding comment in that clause */
  selectedClauseId?: string | null;
  /** Track changes from clause decisions */
  trackChanges?: TrackChangeData[];
}

export function OnlyOfficeDocumentViewer({
  contractId,
  contractTitle,
  fileType,
  mode = "view",
  onDocumentReady,
  onError,
  findings = [],
  navigateToFindingId,
  selectedClauseId,
  trackChanges = [],
}: ExtendedViewerProps) {
  const [state, setState] = useState<ViewerState>({
    loading: true,
    error: null,
    serverAvailable: true,
    sessionData: null,
  });
  const initCalledRef = useRef(false);
  const [documentReady, setDocumentReady] = useState(false);
  const [connector, setConnector] = useState<OOConnector | null>(null);

  // Initialize session by requesting tokens from our API
  const initializeSession = useCallback(async () => {
    setState((prev) => ({ ...prev, loading: true, error: null }));

    try {
      const response = await fetch("/api/onlyoffice/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contractId, mode }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || `Failed to create session (${response.status})`);
      }

      const sessionData: TokenResponse = await response.json();

      setState({
        loading: false,
        error: null,
        serverAvailable: true,
        sessionData,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to initialize ONLYOFFICE viewer";
      console.error("[ONLYOFFICE] Session initialization error:", error);

      setState({
        loading: false,
        error: message,
        serverAvailable: false,
        sessionData: null,
      });

      onError?.(message);
    }
  }, [contractId, mode, onError]);

  useEffect(() => {
    if (initCalledRef.current) return;
    initCalledRef.current = true;
    initializeSession();
  }, [initializeSession]);

  /**
   * Handle app ready — fires before onDocumentReady with the editor instance.
   * This is the correct place to create the Connector (Developer/Enterprise Edition).
   * The instance is passed directly by the React wrapper from window.DocEditor.instances[id].
   */
  const handleAppReady = useCallback((editorInstance: unknown) => {
    try {
      const instance = editorInstance as Record<string, unknown> | undefined;
      if (!instance) {
        console.info("[ONLYOFFICE] onAppReady: editor instance is null — cannot create connector");
        return;
      }

      if (typeof instance.createConnector === "function") {
        const conn = (instance.createConnector as () => OOConnector)();
        if (conn && typeof conn.executeMethod === "function") {
          setConnector(conn);
          console.log("[ONLYOFFICE] Connector created (Developer/Enterprise Edition)");
        } else {
          console.warn("[ONLYOFFICE] createConnector() returned an invalid connector");
        }
      } else {
        console.info(
          "[ONLYOFFICE] createConnector() not available. " +
          "Comment injection and tracked changes require ONLYOFFICE Developer/Enterprise Edition. " +
          "Findings are still visible in the sidebar panel."
        );
      }
    } catch (err) {
      console.debug("[ONLYOFFICE] Failed to create connector:", err);
    }
  }, []);

  // Handle document ready event from ONLYOFFICE
  const handleDocumentReady = useCallback(() => {
    console.log("[ONLYOFFICE] Document ready");
    setDocumentReady(true);
    onDocumentReady?.();
  }, [onDocumentReady]);

  // Handle ONLYOFFICE errors
  const handleError = useCallback(
    (event: object) => {
      const ev = event as { data?: { errorCode?: number; errorDescription?: string } };
      const errorMsg = `ONLYOFFICE error: ${ev.data?.errorDescription ?? "Unknown"} (code: ${ev.data?.errorCode ?? "?"})`;
      console.error("[ONLYOFFICE]", errorMsg);
      setState((prev) => ({ ...prev, error: errorMsg }));
      onError?.(errorMsg);
    },
    [onError]
  );

  // Handle session token refresh
  const handleTokenRefreshed = useCallback(
    (_newToken: string) => {
      console.log("[ONLYOFFICE] Token refreshed");
    },
    []
  );

  // Handle session refresh error
  const handleRefreshError = useCallback(
    (error: string) => {
      console.error("[ONLYOFFICE] Session refresh failed:", error);
      setState((prev) => ({
        ...prev,
        error: "Session expired. Please reload the page.",
      }));
      onError?.("Session expired");
    },
    [onError]
  );

  // Download fallback
  const handleDownload = useCallback(() => {
    if (state.sessionData?.downloadUrl) {
      window.open(state.sessionData.downloadUrl, "_blank");
    }
  }, [state.sessionData?.downloadUrl]);

  // ─── Loading State ─────────────────────────────────────────────────────────
  if (state.loading) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 p-8">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Loading document viewer…</p>
      </div>
    );
  }

  // ─── Error / Fallback State ────────────────────────────────────────────────
  if (state.error || !state.serverAvailable || !state.sessionData) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 p-8">
        <AlertTriangle className="h-10 w-10 text-amber-500" />
        <div className="text-center space-y-2">
          <p className="text-sm font-medium text-slate-800">
            Document viewer unavailable
          </p>
          <p className="text-xs text-muted-foreground max-w-md">
            {state.error || "ONLYOFFICE Document Server is not available. You can download the document directly."}
          </p>
        </div>
        <div className="flex gap-2">
          {state.sessionData?.downloadUrl && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleDownload}
              className="gap-1.5"
            >
              <Download className="h-4 w-4" />
              Download Document
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={initializeSession}>
            Retry
          </Button>
        </div>
      </div>
    );
  }

  // ─── ONLYOFFICE Viewer (Read-Only) ─────────────────────────────────────────
  const serverUrl = process.env.NEXT_PUBLIC_ONLYOFFICE_SERVER_URL || "http://localhost:8080";

  return (
    <div className="flex flex-col h-full">
      {/* ONLYOFFICE Document — fills the entire panel */}
      <div className="flex-1 relative">
        <DocumentEditor
          id="onlyoffice-editor"
          documentServerUrl={serverUrl}
          config={state.sessionData.config as unknown as Record<string, unknown>}
          events_onAppReady={handleAppReady}
          events_onDocumentReady={handleDocumentReady}
          events_onError={handleError}
          height="100%"
          width="100%"
        />
      </div>

      {/* Session Manager — handles automatic token refresh */}
      <SessionManager
        sessionId={state.sessionData.sessionId}
        expiresAt={state.sessionData.expiresAt}
        onTokenRefreshed={handleTokenRefreshed}
        onRefreshError={handleRefreshError}
      />

      {/* Finding Comments — injects findings as ONLYOFFICE comments */}
      {findings.length > 0 && (
        <FindingComments
          connector={connector}
          findings={findings}
          documentReady={documentReady}
          navigateToFindingId={navigateToFindingId}
          navigateToClauseId={selectedClauseId}
          onInjectionComplete={(results) => {
            const success = results.filter((r) => r.success).length;
            console.log(`[ONLYOFFICE] ${success}/${results.length} finding comments injected`);
          }}
        />
      )}

      {/* Track Changes — displays triage decisions as tracked changes */}
      {trackChanges.length > 0 && (
        <TrackedChanges
          connector={connector}
          changes={trackChanges}
          documentReady={documentReady}
          showToggle={true}
        />
      )}
    </div>
  );
}
