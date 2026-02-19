/**
 * Collabora Clause Navigation Hook
 * Feature 010 T017 + Feature 011 T014: Search-and-scroll logic for clause navigation
 *
 * Navigation strategy:
 * Text search with progressive fallback and T005 normalizations.
 * If all fallback strings fail → call onNavigationFailed(clauseId).
 *
 * NOTE: Bookmark-based navigation (T014) was removed — .uno:InsertBookmark opens a
 * dialog in Collabora Online instead of silently inserting a bookmark (V2 failed).
 * All navigation uses text-search exclusively.
 *
 * Also handles:
 * - Re-navigating after document reload
 * - Repeated text disambiguation via sequential search
 */

"use client";

import { useEffect, useLayoutEffect, useRef, useCallback } from "react";
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

  // Keep a stable ref to clauses — the parent rebuilds the array every render
  const clausesRef = useRef(clauses);

  // Sync latest prop values into refs after each render (React 19: outside render body)
  useLayoutEffect(() => { onNavigationFailedRef.current = onNavigationFailed; }, [onNavigationFailed]);
  useLayoutEffect(() => { clausesRef.current = clauses; }, [clauses]);

  // ─── Execute search in a given direction ─────────────────────────────
  const executeSearchDir = useCallback(
    (searchString: string, backward: boolean) => {
      console.log("[Collabora Nav] Executing text search:", {
        searchString: searchString.substring(0, 80),
        backward,
      });

      executeUnoCommand(".uno:ExecuteSearch", {
        "SearchItem.SearchString": { type: "string", value: searchString },
        "SearchItem.ReplaceString": { type: "string", value: "" },
        "SearchItem.Backward": { type: "boolean", value: backward },
        "SearchItem.RegularExpression": { type: "boolean", value: false },
        "SearchItem.SearchStartPointX": { type: "long", value: 0 },
        "SearchItem.SearchStartPointY": { type: "long", value: 0 },
        "SearchItem.Command": { type: "long", value: 0 }, // Find Next
      });
    },
    [executeUnoCommand]
  );

  // ─── Navigate via text search ──────────────────────────────────────
  // Strategy: search forward first, then backward after a short delay.
  // This covers both directions from the current cursor without
  // jumping to the document start (which causes a visible flash).
  // Whichever direction finds the text first will scroll the viewport.
  // If forward already found it, the backward search just re-selects it
  // (same match or the next one up — harmless).
  const navigateViaTextSearch = useCallback(
    (clauseId: string, clause: ClauseNavigationData) => {
      const searchString = getClauseSearchString(clause);
      console.log("[Collabora Nav] Text search:", {
        clauseId,
        searchString: searchString ? searchString.substring(0, 80) : "(empty)",
      });

      if (!searchString) {
        onNavigationFailedRef.current?.(clauseId);
        return;
      }

      const currentClauses = clausesRef.current;
      const occurrenceIndex = getClauseOccurrenceIndex(clause, currentClauses);

      if (occurrenceIndex <= 1) {
        // Single-occurrence: try forward, then backward as fallback
        executeSearchDir(searchString, false);
        setTimeout(() => executeSearchDir(searchString, true), SEARCH_STEP_DELAY_MS);
      } else {
        // Multi-occurrence: we need a deterministic starting point.
        // Use backward search to reach the first occurrence, then forward N times.
        // Step 1: search backward (wraps past the first occurrence)
        executeSearchDir(searchString, true);
        // Steps 2..N: search forward to land on the Nth occurrence
        for (let i = 0; i < occurrenceIndex; i++) {
          setTimeout(() => {
            executeSearchDir(searchString, false);
          }, (i + 1) * SEARCH_STEP_DELAY_MS);
        }
      }
    },
    [executeSearchDir]
  );

  // ─── Navigate to a clause (text search) ────────────────────────────
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

      console.log("[Collabora Nav] Navigating via text search:", { clauseId });
      navigateViaTextSearch(clauseId, clause);
      lastNavigatedClauseIdRef.current = clauseId;
    },
    [isDocumentLoaded, navigateViaTextSearch]
  );

  // ─── Navigate when clause selection changes ────────────────────────
  useEffect(() => {
    if (!selectedClauseId || !isDocumentLoaded) return;
    navigateToClause(selectedClauseId);
  }, [selectedClauseId, isDocumentLoaded, navigateToClause]);

  // ─── Re-navigate after document reload ─────────────────────────────
  const prevDocumentLoadedRef = useRef(false);
  useEffect(() => {
    if (isDocumentLoaded && !prevDocumentLoadedRef.current) {
      if (lastNavigatedClauseIdRef.current) {
        setTimeout(() => {
          if (lastNavigatedClauseIdRef.current) {
            navigateToClause(lastNavigatedClauseIdRef.current);
          }
        }, 500);
      }
    }
    prevDocumentLoadedRef.current = isDocumentLoaded;
  }, [isDocumentLoaded, navigateToClause]);

  return { navigateToClause };
}

/**
 * Utility: Try progressive fallback searches for a clause.
 * Call this if the primary search doesn't visually navigate.
 */
export function getFallbackSearchStrings(
  clause: ClauseNavigationData
): string[] {
  return getClauseFallbackSearchStrings(clause);
}
