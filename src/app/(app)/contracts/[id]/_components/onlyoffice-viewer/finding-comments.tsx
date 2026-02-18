"use client";

/**
 * Finding Comments Component
 * Feature 009 T019: Injects AI-generated findings as ONLYOFFICE comments
 * after document load, with risk-level styling and sidebar navigation
 */

import { useEffect, useRef, useCallback, useState } from "react";
import {
  injectFindingsAsComments,
  navigateToComment,
} from "@/lib/onlyoffice/comment-injector";
import type { FindingCommentData, CommentInjectionResult } from "@/types/onlyoffice";

interface FindingCommentsProps {
  /** Array of findings to inject as comments */
  findings: FindingCommentData[];
  /** Whether the ONLYOFFICE document is ready for API calls */
  documentReady: boolean;
  /** Callback when all comments have been injected */
  onInjectionComplete?: (results: CommentInjectionResult[]) => void;
  /** Finding ID to navigate to (from sidebar click) */
  navigateToFindingId?: string | null;
}

export function FindingComments({
  findings,
  documentReady,
  onInjectionComplete,
  navigateToFindingId,
}: FindingCommentsProps) {
  const injectedRef = useRef(false);
  const [injectionResults, setInjectionResults] = useState<CommentInjectionResult[]>([]);
  const [injecting, setInjecting] = useState(false);

  // Get the ONLYOFFICE connector instance
  const getConnector = useCallback(() => {
    try {
      // Access the ONLYOFFICE editor instance from the window
      const editorInstances = (window as unknown as Record<string, unknown>)?.DocEditor;
      if (editorInstances && typeof editorInstances === 'object') {
        const instances = (editorInstances as Record<string, unknown>)?.instances;
        if (instances && typeof instances === 'object') {
          return (instances as Record<string, { executeMethod: (method: string, args: unknown[]) => Promise<void> }>)['onlyoffice-editor'];
        }
      }
      return null;
    } catch {
      return null;
    }
  }, []);

  // Inject findings as comments once document is ready
  useEffect(() => {
    if (!documentReady || injectedRef.current || findings.length === 0) {
      return;
    }

    const inject = async () => {
      const connector = getConnector();
      if (!connector) {
        console.warn("[FindingComments] ONLYOFFICE connector not available yet");
        return;
      }

      setInjecting(true);
      injectedRef.current = true;

      console.log(`[FindingComments] Injecting ${findings.length} findings as comments...`);
      const startTime = Date.now();

      const results = await injectFindingsAsComments(connector, findings);

      const elapsed = Date.now() - startTime;
      const successCount = results.filter((r) => r.success).length;
      console.log(
        `[FindingComments] Injection complete: ${successCount}/${findings.length} succeeded in ${elapsed}ms`
      );

      setInjectionResults(results);
      setInjecting(false);
      onInjectionComplete?.(results);
    };

    // Small delay to ensure ONLYOFFICE is fully initialized
    const timer = setTimeout(inject, 500);
    return () => clearTimeout(timer);
  }, [documentReady, findings, getConnector, onInjectionComplete]);

  // Handle sidebar finding navigation (click → scroll to comment)
  useEffect(() => {
    if (!navigateToFindingId || !documentReady) return;

    const connector = getConnector();
    if (!connector) return;

    navigateToComment(connector, navigateToFindingId);
  }, [navigateToFindingId, documentReady, getConnector]);

  // This component is invisible — it only manages comment injection lifecycle
  return null;
}
