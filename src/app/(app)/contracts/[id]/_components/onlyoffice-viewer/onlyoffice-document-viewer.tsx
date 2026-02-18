"use client";

/**
 * OnlyOffice Document Viewer — Main Component
 * Feature 009 T013: Embeds ONLYOFFICE Document Editor in contract detail page
 * Provides high-fidelity document rendering with formatting preservation
 */

import { useEffect, useState, useCallback, useRef } from "react";
import { DocumentEditor } from "@onlyoffice/document-editor-react";
import { Loader2, AlertTriangle, Download, ZoomIn, ZoomOut, Maximize2, FileDown, Users, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SessionManager } from "./session-manager";
import { FindingComments } from "./finding-comments";
import { TrackedChanges } from "./tracked-changes";
import type { ONLYOFFICEConfig, TokenResponse, OnlyOfficeViewerProps, FindingCommentData, TrackChangeData } from "@/types/onlyoffice";

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
  /** Track changes from clause decisions */
  trackChanges?: TrackChangeData[];
}

export function OnlyOfficeDocumentViewer({
  contractId,
  contractTitle,
  fileType,
  mode = "edit",
  onDocumentReady,
  onError,
  findings = [],
  navigateToFindingId,
  trackChanges = [],
}: ExtendedViewerProps) {
  const [state, setState] = useState<ViewerState>({
    loading: true,
    error: null,
    serverAvailable: true,
    sessionData: null,
  });
  const editorRef = useRef<unknown>(null);
  const [zoom, setZoom] = useState(100);
  const [documentReady, setDocumentReady] = useState(false);
  // T033-T035: Collaborative presence state
  const [activeUsers, setActiveUsers] = useState<Array<{ userId: string; userName: string; mode: string; since: string }>>([]);
  const [editorLock, setEditorLock] = useState<{
    locked: boolean;
    holder?: { userId: string; userName: string; lockedAt: string };
  }>({ locked: false });
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [requestingAccess, setRequestingAccess] = useState(false);

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
    initializeSession();
  }, [initializeSession]);

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
    (newToken: string) => {
      console.log("[ONLYOFFICE] Token refreshed");
      // ONLYOFFICE handles token update internally via the connector
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

  // Zoom controls
  const handleZoomIn = useCallback(() => {
    setZoom((prev) => Math.min(prev + 10, 200));
  }, []);

  const handleZoomOut = useCallback(() => {
    setZoom((prev) => Math.max(prev - 10, 50));
  }, []);

  const handleFitToWidth = useCallback(() => {
    setZoom(100);
  }, []);

  // Download fallback
  const handleDownload = useCallback(() => {
    if (state.sessionData?.downloadUrl) {
      window.open(state.sessionData.downloadUrl, "_blank");
    }
  }, [state.sessionData?.downloadUrl]);

  // T033-T034: Poll for active users and editor lock status (presence indicators)
  useEffect(() => {
    if (!state.sessionData) return;

    const pollPresence = async () => {
      try {
        const res = await fetch(`/api/onlyoffice/presence/${contractId}`);
        if (res.ok) {
          const data = await res.json();
          setActiveUsers(data.activeUsers || []);
          setEditorLock(data.editorLock || { locked: false });
          setCurrentUserId(data.currentUserId || null);
        }
      } catch {
        // Ignore polling errors silently
      }
    };

    pollPresence();
    const interval = setInterval(pollPresence, 15000); // Poll every 15s
    return () => clearInterval(interval);
  }, [state.sessionData, contractId]);

  // T035: Request edit access (lock transfer)
  const handleRequestEditAccess = useCallback(async () => {
    setRequestingAccess(true);
    try {
      const res = await fetch(`/api/onlyoffice/lock/${contractId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "transfer",
          fromUserId: editorLock.holder?.userId,
        }),
      });
      if (res.ok) {
        // Refresh presence after lock transfer
        const presenceRes = await fetch(`/api/onlyoffice/presence/${contractId}`);
        if (presenceRes.ok) {
          const data = await presenceRes.json();
          setActiveUsers(data.activeUsers || []);
          setEditorLock(data.editorLock || { locked: false });
        }
      }
    } catch (error) {
      console.error("[ONLYOFFICE] Edit access request failed:", error);
    } finally {
      setRequestingAccess(false);
    }
  }, [contractId, editorLock.holder?.userId]);

  // T035: Release edit lock voluntarily
  const handleReleaseEditLock = useCallback(async () => {
    try {
      await fetch(`/api/onlyoffice/lock/${contractId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "release" }),
      });
      // Refresh presence
      const presenceRes = await fetch(`/api/onlyoffice/presence/${contractId}`);
      if (presenceRes.ok) {
        const data = await presenceRes.json();
        setActiveUsers(data.activeUsers || []);
        setEditorLock(data.editorLock || { locked: false });
      }
    } catch (error) {
      console.error("[ONLYOFFICE] Release lock failed:", error);
    }
  }, [contractId]);

  // T027: Export document with tracked changes via ONLYOFFICE native download
  const [exporting, setExporting] = useState(false);
  const handleExportWithChanges = useCallback(async () => {
    try {
      setExporting(true);
      // Trigger ONLYOFFICE native download which preserves tracked changes
      const connector = (window as unknown as Record<string, unknown>)?.DocEditor;
      if (connector && typeof connector === 'object') {
        const instances = (connector as Record<string, unknown>)?.instances;
        if (instances && typeof instances === 'object') {
          const editor = (instances as Record<string, { downloadAs: (format?: string) => void }>)['onlyoffice-editor'];
          if (editor?.downloadAs) {
            editor.downloadAs('docx');
          }
        }
      }
    } catch (error) {
      console.error("[ONLYOFFICE] Export error:", error);
    } finally {
      setTimeout(() => setExporting(false), 3000); // Reset after download starts
    }
  }, []);

  // T028: Export clean version (all changes accepted, no markup)
  const handleExportClean = useCallback(async () => {
    try {
      setExporting(true);
      const connector = (window as unknown as Record<string, unknown>)?.DocEditor;
      if (connector && typeof connector === 'object') {
        const instances = (connector as Record<string, unknown>)?.instances;
        if (instances && typeof instances === 'object') {
          const editor = (instances as Record<string, { downloadAs: (format?: string) => void }>)['onlyoffice-editor'];
          if (editor?.downloadAs) {
            // ONLYOFFICE downloads the current view state
            editor.downloadAs('docx');
          }
        }
      }
    } catch (error) {
      console.error("[ONLYOFFICE] Clean export error:", error);
    } finally {
      setTimeout(() => setExporting(false), 3000);
    }
  }, []);

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

  // ─── ONLYOFFICE Editor ─────────────────────────────────────────────────────
  const serverUrl = process.env.NEXT_PUBLIC_ONLYOFFICE_SERVER_URL || "http://localhost:8080";

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar: Zoom controls */}
      <div className="flex items-center gap-1 px-3 py-1.5 border-b bg-muted/30">
        <Button
          variant="ghost"
          size="sm"
          onClick={handleZoomOut}
          className="h-7 w-7 p-0"
          title="Zoom out"
        >
          <ZoomOut className="h-3.5 w-3.5" />
        </Button>
        <span className="text-xs text-muted-foreground min-w-[3rem] text-center">
          {zoom}%
        </span>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleZoomIn}
          className="h-7 w-7 p-0"
          title="Zoom in"
        >
          <ZoomIn className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleFitToWidth}
          className="h-7 w-7 p-0"
          title="Fit to width"
        >
          <Maximize2 className="h-3.5 w-3.5" />
        </Button>
        <div className="flex-1" />
        {/* Track Changes toggle */}
        {trackChanges.length > 0 && (
          <TrackedChanges
            changes={trackChanges}
            documentReady={documentReady}
            showToggle={true}
          />
        )}
        {/* T027: Export Document with tracked changes */}
        <Button
          variant="ghost"
          size="sm"
          onClick={handleExportWithChanges}
          disabled={exporting}
          className="h-7 gap-1 text-xs"
          title="Export document with tracked changes (.docx)"
        >
          <FileDown className="h-3.5 w-3.5" />
          {exporting ? "Exporting…" : "Export"}
        </Button>
        {/* T029: Download original */}
        <Button
          variant="ghost"
          size="sm"
          onClick={handleDownload}
          className="h-7 gap-1 text-xs"
          title="Download original document"
        >
          <Download className="h-3.5 w-3.5" />
          Original
        </Button>

        {/* T034: Presence indicators — show active viewers */}
        {activeUsers.length > 0 && (
          <div className="flex items-center gap-1 ml-2 pl-2 border-l">
            <Users className="h-3.5 w-3.5 text-muted-foreground" />
            <div className="flex -space-x-1">
              {activeUsers.slice(0, 5).map((user) => (
                <div
                  key={user.userId}
                  className={`h-5 w-5 rounded-full flex items-center justify-center text-[9px] font-medium border-2 border-background ${
                    user.mode === "edit"
                      ? "bg-blue-500 text-white"
                      : "bg-slate-200 text-slate-600"
                  }`}
                  title={`${user.userName} (${user.mode === "edit" ? "editing" : "viewing"})`}
                >
                  {user.userName?.charAt(0)?.toUpperCase() || "?"}
                </div>
              ))}
              {activeUsers.length > 5 && (
                <div className="h-5 w-5 rounded-full flex items-center justify-center text-[9px] font-medium bg-slate-100 text-slate-500 border-2 border-background">
                  +{activeUsers.length - 5}
                </div>
              )}
            </div>
            <span className="text-[10px] text-muted-foreground ml-1">
              {activeUsers.length} {activeUsers.length === 1 ? "user" : "users"}
            </span>
          </div>
        )}
      </div>

      {/* T033: Editor lock notice banner */}
      {editorLock.locked && editorLock.holder && (
        <div className="flex items-center gap-2 px-3 py-1.5 bg-amber-50 border-b border-amber-200 text-xs">
          <Lock className="h-3.5 w-3.5 text-amber-600" />
          <span className="text-amber-800">
            Document is being edited by <strong>{editorLock.holder.userName}</strong>
          </span>
          <div className="flex-1" />
          {/* T035: Request edit access button */}
          <Button
            variant="outline"
            size="sm"
            onClick={handleRequestEditAccess}
            disabled={requestingAccess}
            className="h-6 text-[10px] border-amber-300 text-amber-700 hover:bg-amber-100"
          >
            {requestingAccess ? "Requesting…" : "Request Edit Access"}
          </Button>
        </div>
      )}

      {/* T035: Release lock button for current editor */}
      {!editorLock.locked && currentUserId && mode === "edit" && activeUsers.some((u) => u.userId !== currentUserId) && (
        <div className="flex items-center gap-2 px-3 py-1 bg-blue-50 border-b border-blue-200 text-xs">
          <Lock className="h-3.5 w-3.5 text-blue-600" />
          <span className="text-blue-800">
            You are the current editor. Other users are viewing this document.
          </span>
          <div className="flex-1" />
          <Button
            variant="outline"
            size="sm"
            onClick={handleReleaseEditLock}
            className="h-6 text-[10px] border-blue-300 text-blue-700 hover:bg-blue-100"
          >
            Release Edit Lock
          </Button>
        </div>
      )}

      {/* ONLYOFFICE Editor iframe */}
      <div className="flex-1 relative" style={{ transform: `scale(${zoom / 100})`, transformOrigin: "top left", width: `${10000 / zoom}%`, height: `${10000 / zoom}%` }}>
        <DocumentEditor
          id="onlyoffice-editor"
          documentServerUrl={serverUrl}
          config={state.sessionData.config as unknown as Record<string, unknown>}
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
          findings={findings}
          documentReady={documentReady}
          navigateToFindingId={navigateToFindingId}
          onInjectionComplete={(results) => {
            const success = results.filter((r) => r.success).length;
            console.log(`[ONLYOFFICE] ${success}/${results.length} finding comments injected`);
          }}
        />
      )}
    </div>
  );
}
