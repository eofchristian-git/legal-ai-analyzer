/**
 * Collabora Clause Navigation Hook
 * Feature 010 T017: Search-and-scroll logic for clause navigation
 *
 * Handles:
 * - Navigating to a clause when selected in the sidebar
 * - Re-navigating after document reload
 * - Progressive fallback if search text not found
 * - Repeated text disambiguation via sequential search
 */

"use client";

import { useEffect, useRef, useCallback } from "react";
import type { ClauseNavigationData } from "@/types/collabora";
import {
  getClauseSearchString,
  getClauseFallbackSearchStrings,
  getClauseOccurrenceIndex,
} from "@/lib/collabora/navigation";

interface UseClauseNavigationOptions {
  /** Currently selected clause ID */
  selectedClauseId: string | null | undefined;
  /** All clauses for the current contract */
  clauses: ClauseNavigationData[];
  /** Whether the document has finished loading in Collabora */
  isDocumentLoaded: boolean;
  /** Function to execute a UNO command in Collabora */
  executeUnoCommand: (command: string, args?: Record<string, unknown>) => void;
  /** Called when navigation fails (no match found) */
  onNavigationFailed?: (clauseId: string) => void;
}

interface UseClauseNavigationReturn {
  /** The clause ID that was last successfully navigated to */
  lastNavigatedClauseId: string | null;
  /** Navigate to a specific clause (can be called manually) */
  navigateToClause: (clauseId: string) => void;
}

/** Delay between sequential search commands (ms) */
const SEARCH_STEP_DELAY_MS = 100;

export function useClauseNavigation({
  selectedClauseId,
  clauses,
  isDocumentLoaded,
  executeUnoCommand,
  onNavigationFailed,
}: UseClauseNavigationOptions): UseClauseNavigationReturn {
  const lastNavigatedClauseIdRef = useRef<string | null>(null);
  const onNavigationFailedRef = useRef(onNavigationFailed);
  onNavigationFailedRef.current = onNavigationFailed;

  // Keep a stable ref to clauses — the parent rebuilds the array every render
  // via .map(), but the data itself rarely changes.
  const clausesRef = useRef(clauses);
  clausesRef.current = clauses;

  // ─── Execute search command ────────────────────────────────────────
  const executeSearch = useCallback(
    (searchString: string, fromStart: boolean = true) => {
      console.log("[Collabora Nav] Executing search:", {
        searchString: searchString.substring(0, 80),
        fromStart,
        isDocumentLoaded,
      });

      // Collabora's .uno:ExecuteSearch expects typed arguments
      // (must match Collabora's internal SearchService.search format exactly)
      // Command values: 0 = Find Next (scrolls to match), 1 = Find All (highlights only)
      const searchArgs: Record<string, { type: string; value: string | boolean | number }> = {
        "SearchItem.SearchString": {
          type: "string",
          value: searchString,
        },
        "SearchItem.ReplaceString": {
          type: "string",
          value: "",
        },
        "SearchItem.Backward": {
          type: "boolean",
          value: false,
        },
        "SearchItem.SearchStartPointX": {
          type: "long",
          value: 0,
        },
        "SearchItem.SearchStartPointY": {
          type: "long",
          value: 0,
        },
        "SearchItem.Command": {
          type: "long",
          value: 0,  // 0 = Find Next (scrolls to match)
        },
      };

      executeUnoCommand(".uno:ExecuteSearch", searchArgs);
    },
    [executeUnoCommand, isDocumentLoaded]
  );

  // ─── Navigate to a clause ──────────────────────────────────────────
  const navigateToClause = useCallback(
    (clauseId: string) => {
      if (!isDocumentLoaded) {
        console.log("[Collabora Nav] Skipping — document not loaded");
        return;
      }

      const currentClauses = clausesRef.current;
      const clause = currentClauses.find((c) => c.id === clauseId);
      if (!clause) {
        console.log("[Collabora Nav] Clause not found in clauses array:", clauseId);
        return;
      }

      console.log("[Collabora Nav] Navigating to clause:", {
        clauseId,
        clauseName: clause.clauseName,
        clauseTextLength: clause.clauseText?.length ?? 0,
        findingExcerptsCount: clause.findingExcerpts?.length ?? 0,
        findingExcerpts: clause.findingExcerpts?.map(e => e.substring(0, 50)),
      });

      const searchString = getClauseSearchString(clause);
      console.log("[Collabora Nav] Search string:", searchString ? searchString.substring(0, 80) : "(empty)");
      if (!searchString) {
        onNavigationFailedRef.current?.(clauseId);
        return;
      }

      // Check if this clause text appears multiple times
      const occurrenceIndex = getClauseOccurrenceIndex(clause, currentClauses);

      if (occurrenceIndex <= 1) {
        // First (or only) occurrence — simple search from start
        executeSearch(searchString, true);
      } else {
        // Nth occurrence — search N times sequentially
        executeSearch(searchString, true);
        for (let i = 1; i < occurrenceIndex; i++) {
          setTimeout(() => {
            executeSearch(searchString, false);
          }, i * SEARCH_STEP_DELAY_MS);
        }
      }

      lastNavigatedClauseIdRef.current = clauseId;
    },
    [isDocumentLoaded, executeSearch]
  );

  // ─── Navigate when clause selection changes ────────────────────────
  useEffect(() => {
    if (!selectedClauseId || !isDocumentLoaded) return;
    navigateToClause(selectedClauseId);
  }, [selectedClauseId, isDocumentLoaded, navigateToClause]);

  // ─── Re-navigate after document reload ─────────────────────────────
  // When isDocumentLoaded transitions from false→true and we have a
  // stored clause, re-navigate to it.
  const prevDocumentLoadedRef = useRef(false);
  useEffect(() => {
    if (isDocumentLoaded && !prevDocumentLoadedRef.current) {
      // Document just finished loading (or reloading)
      if (lastNavigatedClauseIdRef.current) {
        // Small delay to ensure Collabora is ready for search commands
        setTimeout(() => {
          if (lastNavigatedClauseIdRef.current) {
            navigateToClause(lastNavigatedClauseIdRef.current);
          }
        }, 500);
      }
    }
    prevDocumentLoadedRef.current = isDocumentLoaded;
  }, [isDocumentLoaded, navigateToClause]);

  return {
    lastNavigatedClauseId: lastNavigatedClauseIdRef.current,
    navigateToClause,
  };
}

/**
 * Utility: Try progressive fallback searches for a clause.
 * Call this if the primary search doesn't visually navigate.
 * (Currently unused — reserved for Phase 6 edge case handling T023)
 */
export function getFallbackSearchStrings(
  clause: ClauseNavigationData
): string[] {
  return getClauseFallbackSearchStrings(clause);
}
