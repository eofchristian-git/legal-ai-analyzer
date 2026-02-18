"use client";

/**
 * Tracked Changes Component
 * Feature 009 T023: Toggle UI and injection of decision-based tracked changes
 * into ONLYOFFICE Document Editor
 */

import { useEffect, useRef, useState, useCallback } from "react";
import { GitCompare, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  injectTrackedChanges,
  enableTrackChanges,
  disableTrackChangesDisplay,
} from "@/lib/onlyoffice/track-changes-injector";
import type { TrackChangeData, TrackChangeInjectionResult } from "@/types/onlyoffice";
import type { OOConnector } from "./onlyoffice-document-viewer";

interface TrackedChangesProps {
  /** Connector from the parent viewer (null on Community Edition) */
  connector: OOConnector | null;
  /** Track change data computed from clause decisions */
  changes: TrackChangeData[];
  /** Whether the ONLYOFFICE document is ready for API calls */
  documentReady: boolean;
  /** Whether to show the toggle button */
  showToggle?: boolean;
  /** Callback after injection completes */
  onInjectionComplete?: (results: TrackChangeInjectionResult[]) => void;
}

export function TrackedChanges({
  connector,
  changes,
  documentReady,
  showToggle = true,
  onInjectionComplete,
}: TrackedChangesProps) {
  const injectedRef = useRef(false);
  const [changesVisible, setChangesVisible] = useState(false);
  const [injecting, setInjecting] = useState(false);
  const [injected, setInjected] = useState(false);

  // Reset injection guard when the set of changes grows (new decision applied while viewer is open).
  useEffect(() => {
    injectedRef.current = false;
    setInjected(false);
  }, [changes.length]);

  // Inject tracked changes once document and connector are both ready
  useEffect(() => {
    if (!documentReady || !connector || injectedRef.current || changes.length === 0) {
      return;
    }

    injectedRef.current = true;
    let cancelled = false;

    const run = async () => {
      setInjecting(true);

      console.log(`[TrackedChanges] Injecting ${changes.length} tracked changes...`);
      const startTime = Date.now();

      const results = await injectTrackedChanges(connector, changes);

      const elapsed = Date.now() - startTime;
      const successCount = results.filter((r) => r.success).length;
      console.log(
        `[TrackedChanges] Injection complete: ${successCount}/${changes.length} in ${elapsed}ms`
      );

      if (!cancelled) {
        setInjecting(false);
        setInjected(true);
        onInjectionComplete?.(results);
      }
    };

    run();

    return () => {
      cancelled = true;
    };
  }, [documentReady, connector, changes, onInjectionComplete]);

  // Toggle track changes visibility
  const handleToggle = useCallback(async () => {
    if (!connector) return;

    const newVisible = !changesVisible;
    setChangesVisible(newVisible);

    if (newVisible) {
      await enableTrackChanges(connector);
    } else {
      await disableTrackChangesDisplay(connector);
    }
  }, [changesVisible, connector]);

  // Hide button when no changes, connector unavailable, or toggle disabled
  if (!showToggle || changes.length === 0 || !connector) {
    return null;
  }

  return (
    <Button
      variant={changesVisible ? "default" : "outline"}
      size="sm"
      onClick={handleToggle}
      disabled={injecting || !injected}
      className="gap-1.5 text-xs"
      title={changesVisible ? "Hide Track Changes" : "Show Track Changes"}
    >
      <GitCompare className="h-3.5 w-3.5" />
      {injecting ? "Loading Changes…" : changesVisible ? (
        <>
          <EyeOff className="h-3 w-3" />
          Hide Changes
        </>
      ) : (
        <>
          <Eye className="h-3 w-3" />
          Show Changes ({changes.length})
        </>
      )}
    </Button>
  );
}
