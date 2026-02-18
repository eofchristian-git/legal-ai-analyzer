"use client";

/**
 * Finding Comments Component
 * Feature 009 T019: Injects AI-generated findings as ONLYOFFICE comments
 * after document load, with risk-level styling and sidebar navigation.
 *
 * Note: Comment injection via the Connector API requires ONLYOFFICE Developer/Enterprise Edition.
 * On Community Edition (connector=null), this component gracefully degrades — findings are
 * still shown in the sidebar panel.
 */

import { useEffect, useRef, useState } from "react";
import {
  injectFindingsAsComments,
  navigateToComment,
} from "@/lib/onlyoffice/comment-injector";
import type { FindingCommentData, CommentInjectionResult } from "@/types/onlyoffice";
import type { OOConnector } from "./onlyoffice-document-viewer";

interface FindingCommentsProps {
  /** Connector from the parent viewer (null on Community Edition) */
  connector: OOConnector | null;
  /** Array of findings to inject as comments */
  findings: FindingCommentData[];
  /** Whether the ONLYOFFICE document is ready for API calls */
  documentReady: boolean;
  /** Callback when all comments have been injected */
  onInjectionComplete?: (results: CommentInjectionResult[]) => void;
  /** Finding ID to navigate to (from sidebar click) */
  navigateToFindingId?: string | null;
  /** Clause ID to navigate to (from clause list click) — jumps to the first finding in that clause */
  navigateToClauseId?: string | null;
}

export function FindingComments({
  connector,
  findings,
  documentReady,
  onInjectionComplete,
  navigateToFindingId,
  navigateToClauseId,
}: FindingCommentsProps) {
  const injectedRef = useRef(false);
  const [, setInjectionResults] = useState<CommentInjectionResult[]>([]);

  // Inject findings as comments once both document and connector are ready
  useEffect(() => {
    if (!documentReady || !connector || injectedRef.current || findings.length === 0) {
      return;
    }

    injectedRef.current = true;

    let cancelled = false;

    const run = async () => {
      console.log(`[FindingComments] Injecting ${findings.length} findings as comments...`);
      const startTime = Date.now();

      const results = await injectFindingsAsComments(connector, findings);

      const elapsed = Date.now() - startTime;
      const successCount = results.filter((r) => r.success).length;
      console.log(
        `[FindingComments] Injection complete: ${successCount}/${findings.length} succeeded in ${elapsed}ms`
      );

      if (!cancelled) {
        setInjectionResults(results);
        onInjectionComplete?.(results);
      }
    };

    run();

    return () => {
      cancelled = true;
    };
  }, [documentReady, connector, findings, onInjectionComplete]);

  // Reset injection guard when the findings set changes (e.g. new analysis)
  useEffect(() => {
    injectedRef.current = false;
  }, [findings.length]);

  // Handle sidebar finding navigation (click → scroll to comment)
  useEffect(() => {
    if (!navigateToFindingId || !documentReady || !connector) return;
    navigateToComment(connector, navigateToFindingId);
  }, [navigateToFindingId, documentReady, connector]);

  // Handle clause list navigation — navigate to the first finding in the selected clause
  useEffect(() => {
    if (!navigateToClauseId || !documentReady || !connector) return;

    const firstFinding = findings.find((f) => f.clauseId === navigateToClauseId);
    if (firstFinding) {
      navigateToComment(connector, firstFinding.findingId);
    }
  }, [navigateToClauseId, documentReady, connector, findings]);

  // This component is invisible — it only manages comment injection lifecycle
  return null;
}
