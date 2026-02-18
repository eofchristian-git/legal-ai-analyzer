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

interface TrackedChangesProps {
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
  changes,
  documentReady,
  showToggle = true,
  onInjectionComplete,
}: TrackedChangesProps) {
  const injectedRef = useRef(false);
  const [changesVisible, setChangesVisible] = useState(false);
  const [injecting, setInjecting] = useState(false);
  const [injected, setInjected] = useState(false);

  // Get the ONLYOFFICE connector instance
  const getConnector = useCallback(() => {
    try {
      const editorInstances = (window as unknown as Record<string, unknown>)?.DocEditor;
      if (editorInstances && typeof editorInstances === 'object') {
        const instances = (editorInstances as Record<string, unknown>)?.instances;
        if (instances && typeof instances === 'object') {
          return (instances as Record<string, { executeMethod: (method: string, args?: unknown[]) => Promise<void> }>)['onlyoffice-editor'];
        }
      }
      return null;
    } catch {
      return null;
    }
  }, []);

  // Inject tracked changes once document is ready
  useEffect(() => {
    if (!documentReady || injectedRef.current || changes.length === 0) {
      return;
    }

    const inject = async () => {
      const connector = getConnector();
      if (!connector) {
        console.warn("[TrackedChanges] ONLYOFFICE connector not available");
        return;
      }

      setInjecting(true);
      injectedRef.current = true;

      console.log(`[TrackedChanges] Injecting ${changes.length} tracked changes...`);
      const startTime = Date.now();

      const results = await injectTrackedChanges(connector, changes);

      const elapsed = Date.now() - startTime;
      const successCount = results.filter((r) => r.success).length;
      console.log(
        `[TrackedChanges] Injection complete: ${successCount}/${changes.length} in ${elapsed}ms`
      );

      setInjecting(false);
      setInjected(true);
      onInjectionComplete?.(results);
    };

    // Delay to ensure document is fully loaded + comments are injected
    const timer = setTimeout(inject, 1500);
    return () => clearTimeout(timer);
  }, [documentReady, changes, getConnector, onInjectionComplete]);

  // Toggle track changes visibility
  const handleToggle = useCallback(async () => {
    const connector = getConnector();
    if (!connector) return;

    const newVisible = !changesVisible;
    setChangesVisible(newVisible);

    if (newVisible) {
      await enableTrackChanges(connector);
    } else {
      await disableTrackChangesDisplay(connector);
    }
  }, [changesVisible, getConnector]);

  if (!showToggle || changes.length === 0) {
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
