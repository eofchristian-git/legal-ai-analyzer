"use client";

/**
 * Finding Highlights Component
 * Injects AI finding excerpts as tracked-change markers directly in the document.
 * Each finding's excerpt is visually marked with a risk-level prefix via
 * SearchAndReplace + track changes — no comments panel required.
 *
 * Toggle: "Show Findings" / "Hide Findings" button controls markup visibility.
 * When hidden, SetTrackChangesDisplay('original') restores the clean document view.
 */

import { useEffect, useRef, useState, useCallback } from "react";
import { Highlighter, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  injectFindingHighlights,
  showFindingHighlights,
  hideFindingHighlights,
} from "@/lib/onlyoffice/finding-highlights-injector";
import type { FindingCommentData } from "@/types/onlyoffice";
import type { OOConnector } from "./onlyoffice-document-viewer";

interface FindingHighlightsProps {
  /** Connector from the parent viewer (null on Community Edition) */
  connector: OOConnector | null;
  /** Findings to highlight in the document */
  findings: FindingCommentData[];
  /** Whether the ONLYOFFICE document is ready for API calls */
  documentReady: boolean;
}

export function FindingHighlights({
  connector,
  findings,
  documentReady,
}: FindingHighlightsProps) {
  const injectedRef = useRef(false);
  const [visible, setVisible] = useState(true);
  const [injecting, setInjecting] = useState(false);
  const [injected, setInjected] = useState(false);
  const [positionedCount, setPositionedCount] = useState(0);

  // Reset when findings change (e.g. new analysis loaded)
  useEffect(() => {
    injectedRef.current = false;
    setInjected(false);
    setPositionedCount(0);
  }, [findings.length]);

  // Inject highlights once document and connector are ready
  useEffect(() => {
    const findingsWithExcerpts = findings.filter((f) => !!f.excerpt?.trim());
    if (
      !documentReady ||
      !connector ||
      injectedRef.current ||
      findingsWithExcerpts.length === 0
    ) {
      return;
    }

    injectedRef.current = true;
    let cancelled = false;

    const run = async () => {
      setInjecting(true);
      console.log(
        `[FindingHighlights] Injecting ${findingsWithExcerpts.length} finding highlights...`
      );
      const startTime = Date.now();

      const results = await injectFindingHighlights(connector, findings);

      const elapsed = Date.now() - startTime;
      const positioned = results.filter((r) => r.positioned).length;
      const succeeded = results.filter((r) => r.success).length;
      console.log(
        `[FindingHighlights] Done: ${positioned} positioned, ` +
        `${succeeded} succeeded, ${elapsed}ms`
      );

      if (!cancelled) {
        setInjecting(false);
        setInjected(true);
        setPositionedCount(positioned);
        setVisible(true);
      }
    };

    run();

    return () => {
      cancelled = true;
    };
  }, [documentReady, connector, findings]);

  const handleToggle = useCallback(async () => {
    if (!connector) return;
    const next = !visible;
    setVisible(next);
    if (next) {
      await showFindingHighlights(connector);
    } else {
      await hideFindingHighlights(connector);
    }
  }, [connector, visible]);

  // Only render if connector available and there are findings with excerpts
  const findingsWithExcerpts = findings.filter((f) => !!f.excerpt?.trim());
  if (!connector || findingsWithExcerpts.length === 0) return null;

  return (
    <Button
      variant={visible ? "default" : "outline"}
      size="sm"
      onClick={handleToggle}
      disabled={injecting || !injected}
      className="gap-1.5 text-xs"
      title={
        visible
          ? "Hide finding highlights in document"
          : "Show finding highlights in document"
      }
    >
      <Highlighter className="h-3.5 w-3.5" />
      {injecting ? (
        "Highlighting…"
      ) : visible ? (
        <>
          <EyeOff className="h-3 w-3" />
          Hide Findings
        </>
      ) : (
        <>
          <Eye className="h-3 w-3" />
          Show Findings ({positionedCount})
        </>
      )}
    </Button>
  );
}
