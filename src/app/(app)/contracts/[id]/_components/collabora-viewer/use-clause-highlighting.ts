/**
 * Collabora Clause Highlighting Hook
 * Highlights deviated clauses in the document with risk-level colors.
 *
 * Strategy:
 * 1. After document loads, collect all finding excerpts with risk levels
 * 2. Process them sequentially: search → select → apply background color
 * 3. Uses `.uno:ExecuteSearch` (Command=0) to find+select text
 * 4. Uses `.uno:CharBackColor` to apply risk-colored background
 * 5. A queue with delays ensures Collabora processes each step before the next
 *
 * Color mapping:
 *   RED    → #FFCCCC (light pink)
 *   YELLOW → #FFFFCC (light yellow)
 *   GREEN  → #CCFFCC (light green)
 */

"use client";

import { useEffect, useRef, useCallback } from "react";
import type { ClauseNavigationData } from "@/types/collabora";

// ─── Risk level → background color (decimal RGB for UNO) ─────────────────────

const RISK_COLORS: Record<string, number> = {
  RED: 0xffcccc, // light pink
  YELLOW: 0xffffcc, // light yellow
  GREEN: 0xccffcc, // light green
};

// Fallback color if risk level is unknown
const DEFAULT_COLOR = 0xffffcc;

// ─── Timing ──────────────────────────────────────────────────────────────────

/** Delay after search command before applying color (ms) */
const SEARCH_TO_COLOR_DELAY = 250;
/** Delay after color command before processing next finding (ms) */
const COLOR_TO_NEXT_DELAY = 150;
/** Delay before starting the highlighting queue after document load (ms) */
const INITIAL_DELAY = 2000;

// ─── Types ───────────────────────────────────────────────────────────────────

interface HighlightQueueItem {
  /** Text to search for in the document */
  searchText: string;
  /** Background color to apply (decimal RGB) */
  color: number;
  /** Finding ID for debug logging */
  findingId: string;
  /** Risk level string for debug logging */
  riskLevel: string;
}

interface UseClauseHighlightingOptions {
  /** All clauses with finding details */
  clauses: ClauseNavigationData[];
  /** Whether the document has finished loading in Collabora */
  isDocumentLoaded: boolean;
  /** Function to execute a UNO command in Collabora */
  executeUnoCommand: (command: string, args?: Record<string, unknown>) => void;
  /** Function to send a raw postMessage to the Collabora iframe (for Action_Save) */
  sendMessage: (message: Record<string, unknown>) => void;
  /** If true, highlights have already been saved into the DOCX — skip re-highlighting */
  highlightsAlreadyApplied?: boolean;
  /** Called after highlights have been applied AND saved (so parent can mark the flag) */
  onHighlightingComplete?: () => void;
}

// ─── Text cleaning (mirrors navigation.ts) ───────────────────────────────────

function cleanSearchText(text: string): string {
  return text
    .replace(/[\r\n]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .trim();
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useClauseHighlighting({
  clauses,
  isDocumentLoaded,
  executeUnoCommand,
  sendMessage,
  highlightsAlreadyApplied = false,
  onHighlightingComplete,
}: UseClauseHighlightingOptions): void {
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const highlightedRef = useRef(false);
  const clausesRef = useRef(clauses);
  clausesRef.current = clauses;
  const onHighlightingCompleteRef = useRef(onHighlightingComplete);
  onHighlightingCompleteRef.current = onHighlightingComplete;

  // ─── Build the highlight queue from clause/finding data ────────────
  const buildQueue = useCallback((): HighlightQueueItem[] => {
    const queue: HighlightQueueItem[] = [];
    const currentClauses = clausesRef.current;

    for (const clause of currentClauses) {
      if (!clause.findingDetails?.length) continue;

      for (const finding of clause.findingDetails) {
        if (!finding.excerpt) continue;
        // Use the FULL excerpt text — same text shown in the right panel.
        // This ensures the entire deviated passage gets highlighted, not just
        // a 70-char fragment. cleanSearchText normalizes whitespace but
        // preserves the full length so the match covers the whole excerpt.
        const searchText = cleanSearchText(finding.excerpt);
        if (!searchText) continue;

        queue.push({
          searchText,
          color: RISK_COLORS[finding.riskLevel] ?? DEFAULT_COLOR,
          findingId: finding.id,
          riskLevel: finding.riskLevel,
        });
      }
    }

    return queue;
  }, []);

  // ─── Execute search (selects text at cursor) ──────────────────────
  const searchAndSelect = useCallback(
    (searchText: string) => {
      executeUnoCommand(".uno:ExecuteSearch", {
        "SearchItem.SearchString": { type: "string", value: searchText },
        "SearchItem.ReplaceString": { type: "string", value: "" },
        "SearchItem.Backward": { type: "boolean", value: false },
        "SearchItem.SearchStartPointX": { type: "long", value: 0 },
        "SearchItem.SearchStartPointY": { type: "long", value: 0 },
        "SearchItem.Command": { type: "long", value: 0 }, // Find Next
      });
    },
    [executeUnoCommand]
  );

  // ─── Apply character background color to current selection ─────────
  const applyBackgroundColor = useCallback(
    (color: number) => {
      // Try CharBackColor (character-level background — most reliable)
      executeUnoCommand(".uno:CharBackColor", {
        CharBackColor: { type: "long", value: color },
      });
    },
    [executeUnoCommand]
  );

  // ─── Process the queue sequentially with delays ────────────────────
  const processQueue = useCallback(
    (queue: HighlightQueueItem[]) => {
      // Clear any pending timers from a previous run
      timersRef.current.forEach(clearTimeout);
      timersRef.current = [];

      if (queue.length === 0) {
        console.log("[Collabora Highlight] No findings to highlight");
        return;
      }

      console.log(
        `[Collabora Highlight] Starting highlight queue: ${queue.length} findings`
      );

      let cumulativeDelay = 0;

      queue.forEach((item, index) => {
        // Step 1: Search for the text (selects it)
        const searchDelay = cumulativeDelay;
        const searchTimer = setTimeout(() => {
          console.log(
            `[Collabora Highlight] [${index + 1}/${queue.length}] Searching: "${item.searchText.substring(0, 50)}..." (${item.riskLevel})`
          );
          searchAndSelect(item.searchText);
        }, searchDelay);
        timersRef.current.push(searchTimer);

        // Step 2: Apply background color to selection
        const colorDelay = searchDelay + SEARCH_TO_COLOR_DELAY;
        const colorTimer = setTimeout(() => {
          console.log(
            `[Collabora Highlight] [${index + 1}/${queue.length}] Applying color 0x${item.color.toString(16)} (${item.riskLevel})`
          );
          applyBackgroundColor(item.color);
        }, colorDelay);
        timersRef.current.push(colorTimer);

        // Advance cumulative delay for the next item
        cumulativeDelay = colorDelay + COLOR_TO_NEXT_DELAY;
      });

      // After all highlights, move cursor back to start
      const resetDelay = cumulativeDelay + 200;
      const resetTimer = setTimeout(() => {
        console.log("[Collabora Highlight] Queue complete — resetting cursor to top");
        executeUnoCommand(".uno:GoToStartOfDoc", {});
      }, resetDelay);
      timersRef.current.push(resetTimer);

      // Save the document so highlights are persisted in the DOCX file
      const saveDelay = resetDelay + 300;
      const saveTimer = setTimeout(() => {
        console.log("[Collabora Highlight] Saving highlights to DOCX via Action_Save");
        sendMessage({
          MessageId: "Action_Save",
          Values: {
            DontTerminateEdit: true,
            DontSaveIfUnmodified: false,
            Notify: true,
          },
        });
      }, saveDelay);
      timersRef.current.push(saveTimer);

      // Notify parent that highlights are done and saved
      const notifyDelay = saveDelay + 700; // Extra time for save round-trip
      const notifyTimer = setTimeout(() => {
        console.log("[Collabora Highlight] ✓ Highlights applied and saved to file");
        onHighlightingCompleteRef.current?.();
      }, notifyDelay);
      timersRef.current.push(notifyTimer);
    },
    [searchAndSelect, applyBackgroundColor, executeUnoCommand, sendMessage]
  );

  // ─── Trigger highlighting after document loads ─────────────────────
  useEffect(() => {
    if (!isDocumentLoaded) {
      // Reset on reload so highlights re-apply (if needed)
      highlightedRef.current = false;
      return;
    }

    // If highlights are already baked into the DOCX, skip entirely
    if (highlightsAlreadyApplied) {
      console.log("[Collabora Highlight] Skipping — highlights already saved in DOCX");
      return;
    }

    if (highlightedRef.current) return; // Already highlighted this session
    highlightedRef.current = true;

    // Wait for Collabora to fully initialize (UI stripping, etc.)
    // before starting the highlight queue
    const startTimer = setTimeout(() => {
      const queue = buildQueue();
      processQueue(queue);
    }, INITIAL_DELAY);

    timersRef.current.push(startTimer);

    return () => {
      timersRef.current.forEach(clearTimeout);
      timersRef.current = [];
    };
  }, [isDocumentLoaded, highlightsAlreadyApplied, buildQueue, processQueue]);

  // ─── Cleanup on unmount ────────────────────────────────────────────
  useEffect(() => {
    return () => {
      timersRef.current.forEach(clearTimeout);
      timersRef.current = [];
    };
  }, []);
}
