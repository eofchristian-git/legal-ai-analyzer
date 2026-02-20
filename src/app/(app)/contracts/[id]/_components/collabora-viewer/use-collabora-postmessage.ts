/**
 * Collabora PostMessage Hook
 * Feature 010 T014: Bidirectional postMessage communication between
 * the host React app and the embedded Collabora iframe.
 *
 * Handles:
 * - Listening for Collabora → Host messages (App_LoadingStatus, UI_Error)
 * - Host_PostmessageReady handshake (required before Collabora accepts commands)
 * - Sending Host → Collabora messages (Hide_Menu_Bar, Hide_Status_Bar, etc.)
 * - Document load state tracking
 * - Timeout detection if document fails to load
 *
 * R6 FIX (T003b): executeUnoCommand filters empty object args {} to prevent
 * dialog dispatch in LibreOffice core. See research.md §R6.
 */

"use client";

import { useEffect, useCallback, useRef, useState } from "react";

interface UseCollaboraPostMessageOptions {
  /** Ref to the Collabora iframe element */
  iframeRef: React.RefObject<HTMLIFrameElement | null>;
  /** Origin of the Collabora server (for postMessage security) */
  collaboraOrigin: string | null;
  /** Called when the document finishes loading */
  onDocumentLoaded?: () => void;
  /** Called on Collabora errors */
  onError?: (error: string) => void;
  /** Timeout in ms before declaring load failure (default: 60s) */
  loadTimeout?: number;
}

interface UseCollaboraPostMessageReturn {
  /** Whether the document has finished loading */
  isDocumentLoaded: boolean;
  /** Whether we're waiting for the document to load */
  isLoading: boolean;
  /** Whether the load timed out */
  isTimedOut: boolean;
  /** Send a raw postMessage to the Collabora iframe */
  sendMessage: (message: Record<string, unknown>) => void;
  /** Execute a UNO command in Collabora */
  executeUnoCommand: (command: string, args?: Record<string, unknown>) => void;
  /** Reset state (for reload scenarios) */
  reset: () => void;
}

const DEFAULT_LOAD_TIMEOUT_MS = 60_000;

export function useCollaboraPostMessage({
  iframeRef,
  collaboraOrigin,
  onDocumentLoaded,
  onError,
  loadTimeout = DEFAULT_LOAD_TIMEOUT_MS,
}: UseCollaboraPostMessageOptions): UseCollaboraPostMessageReturn {
  const [isDocumentLoaded, setIsDocumentLoaded] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isTimedOut, setIsTimedOut] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onDocumentLoadedRef = useRef(onDocumentLoaded);
  const onErrorRef = useRef(onError);
  const postmessageReadySentRef = useRef(false);

  // Keep refs in sync
  onDocumentLoadedRef.current = onDocumentLoaded;
  onErrorRef.current = onError;

  // ─── Send message to Collabora iframe ──────────────────────────────
  const sendMessage = useCallback(
    (message: Record<string, unknown>) => {
      const iframe = iframeRef.current;
      if (!iframe?.contentWindow || !collaboraOrigin) {
        console.warn("[Collabora PM] Cannot send — iframe or origin not ready", {
          hasIframe: !!iframe,
          hasContentWindow: !!iframe?.contentWindow,
          collaboraOrigin,
        });
        return;
      }
      const payload = JSON.stringify(message);
      console.log("[Collabora PM] → Sending:", message.MessageId, message);
      iframe.contentWindow.postMessage(payload, collaboraOrigin);
    },
    [iframeRef, collaboraOrigin]
  );

  // ─── Execute a UNO command ─────────────────────────────────────────
  // Collabora supports: { MessageId: "Send_UNO_Command", Values: { Command, Args } }
  // Args is passed directly to the internal sendUnoCommand (NOT JSON-stringified).
  //
  // R6 FIX: Empty object {} as Args causes Collabora to send `uno .uno:Cmd {}`
  // which LibreOffice core interprets as "args provided but incomplete" and opens
  // the dialog execution path (e.g. Character dialog for .uno:Strikeout).
  // We filter empty objects so toggle/cursor commands dispatch without args.
  const executeUnoCommand = useCallback(
    (command: string, args?: Record<string, unknown>) => {
      if (!isDocumentLoaded) {
        console.warn("[Collabora PM] Cannot execute UNO — document not loaded");
        return;
      }

      // R6: Only send args when they contain actual key-value pairs.
      // Empty {} causes dialog dispatch in Collabora/LibreOffice.
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

  // ─── Reset state (for reload) ──────────────────────────────────────
  const reset = useCallback(() => {
    setIsDocumentLoaded(false);
    setIsLoading(true);
    setIsTimedOut(false);
    postmessageReadySentRef.current = false;
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  // ─── Listen for Collabora → Host messages ──────────────────────────
  useEffect(() => {
    if (!collaboraOrigin) return;

    const handleMessage = (event: MessageEvent) => {
      // Log origin comparison for debugging
      if (typeof event.data === "string" && event.data.includes("MessageId")) {
        if (event.origin !== collaboraOrigin) {
          console.warn("[Collabora PM] ⚠ Origin mismatch! event.origin:", event.origin, "expected:", collaboraOrigin);
        }
      }

      // Security: only accept messages from the Collabora origin
      if (event.origin !== collaboraOrigin) return;

      let data: { MessageId?: string; Values?: Record<string, unknown> };
      try {
        data = typeof event.data === "string" ? JSON.parse(event.data) : event.data;
      } catch {
        return; // Not a JSON message — ignore
      }

      if (!data.MessageId) return;

      // Log all messages from Collabora for debugging
      console.log("[Collabora PM] ← Received:", data.MessageId, data.Values);

      switch (data.MessageId) {
        case "App_LoadingStatus": {
          const status = data.Values?.Status as string | undefined;
          console.log("[Collabora PM] Loading status:", status);

          if (status === "Frame_Ready") {
            // *** CRITICAL: Host must respond with Host_PostmessageReady ***
            // Without this handshake, Collabora ignores all commands from the host.
            if (!postmessageReadySentRef.current) {
              console.log("[Collabora PM] → Sending Host_PostmessageReady handshake");
              sendMessage({ MessageId: "Host_PostmessageReady" });
              postmessageReadySentRef.current = true;
            }
          } else if (status === "Document_Loaded") {
            setIsDocumentLoaded(true);
            setIsLoading(false);
            setIsTimedOut(false);
            if (timeoutRef.current) {
              clearTimeout(timeoutRef.current);
              timeoutRef.current = null;
            }
            // Hide sidebar, top panel, and menubar
            sendMessage({
              MessageId: "Send_UNO_Command",
              Values: { Command: ".uno:SidebarHide", Args: "" },
            });
            sendMessage({
              MessageId: "Send_UNO_Command",
              Values: { Command: ".uno:FullScreen", Args: "" },
            });
            sendMessage({ MessageId: "Hide_Menubar" });
            onDocumentLoadedRef.current?.();
          } else if (status === "Failed") {
            setIsLoading(false);
            onErrorRef.current?.("Document failed to load in Collabora");
          }
          break;
        }
        case "UI_Error": {
          const errorMsg =
            (data.Values?.Message as string) || "Unknown Collabora error";
          console.error("[Collabora PM] UI Error:", errorMsg);
          onErrorRef.current?.(errorMsg);
          break;
        }
        case "Action_Exec_Reply": {
          // Reply to our UNO command execution
          console.log("[Collabora PM] Action_Exec reply:", data.Values);
          break;
        }
        // Other messages can be handled here as needed
        default:
          // Log unhandled messages for debugging
          break;
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [collaboraOrigin, sendMessage]);

  // ─── Load timeout detection ────────────────────────────────────────
  useEffect(() => {
    if (!isLoading || isDocumentLoaded || !collaboraOrigin) return;

    timeoutRef.current = setTimeout(() => {
      if (!isDocumentLoaded) {
        setIsTimedOut(true);
        setIsLoading(false);
        onErrorRef.current?.(
          "Document viewer timed out. Collabora may be unavailable."
        );
      }
    }, loadTimeout);

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [isLoading, isDocumentLoaded, collaboraOrigin, loadTimeout]);

  return {
    isDocumentLoaded,
    isLoading,
    isTimedOut,
    sendMessage,
    executeUnoCommand,
    reset,
  };
}
