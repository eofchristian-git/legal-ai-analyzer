/**
 * Collabora Undo Redline Hook
 *
 * Reverts a previously applied fallback redline in the document:
 *   Phase 1 — Delete the inserted fallback text  (bold green text that was added)
 *   Phase 2 — Restore the original excerpt       (remove strikethrough + gray, re-apply highlight)
 *   Phase 3 — Save via Action_Save → WOPI PutFile
 *
 * Both the original excerpt and the inserted fallback text are provided by the
 * caller (from the decision history), so we have exact values for both.
 *
 * UNO command sequence:
 *   GoToStartOfDoc →
 *   ExecuteSearch(fallbackText) → Delete →
 *   GoToStartOfDoc →
 *   ExecuteSearch(originalExcerpt) → Strikeout(off) → Color(black) → CharBackColor(riskColor) →
 *   GoToStartOfDoc → Action_Save → notify
 */

"use client";

import { useEffect, useRef, useCallback } from "react";
import type { FindingUndoRedlineData } from "@/types/collabora";

// ─── Timing ──────────────────────────────────────────────────────────────────

/** Delay between each UNO command step (ms) — generous for reliability */
const STEP_DELAY = 500;

// ─── Risk-level highlight colors (must match use-clause-highlighting.ts) ─────

const RISK_COLORS: Record<string, number> = {
  RED: 0xffcccc, // light pink
  YELLOW: 0xffffcc, // light yellow
  GREEN: 0xccffcc, // light green
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function cleanText(text: string): string {
  return text
    .replace(/[\r\n]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .trim();
}

function searchArgs(text: string) {
  return {
    "SearchItem.SearchString": { type: "string", value: text },
    "SearchItem.ReplaceString": { type: "string", value: "" },
    "SearchItem.Backward": { type: "boolean", value: false },
    "SearchItem.SearchStartPointX": { type: "long", value: 0 },
    "SearchItem.SearchStartPointY": { type: "long", value: 0 },
    "SearchItem.Command": { type: "long", value: 0 }, // Find Next
  };
}

// ─── Hook ────────────────────────────────────────────────────────────────────

interface UseUndoRedlineOptions {
  isDocumentLoaded: boolean;
  executeUnoCommand: (command: string, args?: Record<string, unknown>) => void;
  sendMessage: (message: Record<string, unknown>) => void;
  pendingUndoRedline: FindingUndoRedlineData | null;
  onUndoRedlineApplied?: () => void;
}

export function useUndoRedline({
  isDocumentLoaded,
  executeUnoCommand,
  sendMessage,
  pendingUndoRedline,
  onUndoRedlineApplied,
}: UseUndoRedlineOptions): void {
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const lastAppliedKeyRef = useRef<string | null>(null);
  const onUndoRedlineAppliedRef = useRef(onUndoRedlineApplied);
  onUndoRedlineAppliedRef.current = onUndoRedlineApplied;

  // Helpers
  const clearTimers = useCallback(() => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
  }, []);

  const schedule = useCallback(
    (delay: number, fn: () => void) => {
      timersRef.current.push(setTimeout(fn, delay));
    },
    []
  );

  // ─── Core: revert a single redline ─────────────────────────────────
  const applyUndo = useCallback(
    (data: FindingUndoRedlineData) => {
      const { excerpt, insertedText, findingId, riskLevel } = data;

      // The fallback redline hook inserted: " " + cleanText(replacementText)
      // So the fallback text in the document starts with a space.
      const fallbackInDoc = " " + cleanText(insertedText);
      const originalExcerpt = cleanText(excerpt);
      const highlightColor = RISK_COLORS[riskLevel] ?? 0xffffcc;

      console.log(`[Collabora Undo] ── Starting undo for finding ${findingId} ──`);
      console.log(`[Collabora Undo] Fallback to DELETE : "${fallbackInDoc.substring(0, 100)}…" (${fallbackInDoc.length} chars)`);
      console.log(`[Collabora Undo] Original to RESTORE: "${originalExcerpt.substring(0, 100)}…" (${originalExcerpt.length} chars)`);
      console.log(`[Collabora Undo] Risk level: ${riskLevel} → color 0x${highlightColor.toString(16)}`);

      clearTimers();
      let d = 0;

      // ── Phase 1: Delete the inserted fallback text ─────────────────

      // Step 1: Move cursor to start of document (so search starts from top)
      schedule(d, () => {
        console.log("[Collabora Undo] Step 1: GoToStartOfDoc");
        executeUnoCommand(".uno:GoToStartOfDoc", {});
      });
      d += STEP_DELAY;

      // Step 2: Search for the fallback text → selects it
      schedule(d, () => {
        console.log(`[Collabora Undo] Step 2: Search for fallback text`);
        executeUnoCommand(".uno:ExecuteSearch", searchArgs(fallbackInDoc));
      });
      d += STEP_DELAY;

      // Step 3: Delete the selected fallback text
      schedule(d, () => {
        console.log("[Collabora Undo] Step 3: Delete selected fallback text");
        executeUnoCommand(".uno:Delete", {});
      });
      d += STEP_DELAY;

      // ── Phase 2: Restore the original excerpt ─────────────────────

      // Step 4: Move cursor to start again (original excerpt is before the deleted area)
      schedule(d, () => {
        console.log("[Collabora Undo] Step 4: GoToStartOfDoc");
        executeUnoCommand(".uno:GoToStartOfDoc", {});
      });
      d += STEP_DELAY;

      // Step 5: Search for the original excerpt (currently strikethrough+gray)
      schedule(d, () => {
        console.log("[Collabora Undo] Step 5: Search for original excerpt");
        executeUnoCommand(".uno:ExecuteSearch", searchArgs(originalExcerpt));
      });
      d += STEP_DELAY;

      // Step 6: Toggle strikethrough OFF on the selected text
      schedule(d, () => {
        console.log("[Collabora Undo] Step 6: Strikeout OFF (toggle)");
        executeUnoCommand(".uno:Strikeout", {});
      });
      d += STEP_DELAY;

      // Step 7: Restore text color to black
      schedule(d, () => {
        console.log("[Collabora Undo] Step 7: Color → black");
        executeUnoCommand(".uno:Color", {
          "FontColor.Color": { type: "long", value: 0x000000 },
        });
      });
      d += STEP_DELAY;

      // Step 8: Re-apply risk-level highlight background
      schedule(d, () => {
        console.log(`[Collabora Undo] Step 8: CharBackColor → ${riskLevel}`);
        executeUnoCommand(".uno:CharBackColor", {
          CharBackColor: { type: "long", value: highlightColor },
        });
      });
      d += STEP_DELAY;

      // ── Phase 3: Save and notify ──────────────────────────────────

      // Step 9: Reset cursor
      schedule(d, () => {
        console.log("[Collabora Undo] Step 9: GoToStartOfDoc (reset cursor)");
        executeUnoCommand(".uno:GoToStartOfDoc", {});
      });
      d += STEP_DELAY;

      // Step 10: Save the document
      schedule(d, () => {
        console.log("[Collabora Undo] Step 10: Action_Save → PutFile");
        sendMessage({
          MessageId: "Action_Save",
          Values: {
            DontTerminateEdit: true,
            DontSaveIfUnmodified: false,
            Notify: true,
          },
        });
      });
      d += STEP_DELAY * 3; // Extra time for save round-trip

      // Step 11: Notify parent
      schedule(d, () => {
        console.log("[Collabora Undo] ✓ Undo complete and saved");
        lastAppliedKeyRef.current = `${findingId}_${Date.now()}`;
        onUndoRedlineAppliedRef.current?.();
      });
    },
    [executeUnoCommand, sendMessage, clearTimers, schedule]
  );

  // ─── Watch for pendingUndoRedline changes ─────────────────────────
  useEffect(() => {
    if (!isDocumentLoaded || !pendingUndoRedline) return;

    console.log("[Collabora Undo] pendingUndoRedline received:", {
      findingId: pendingUndoRedline.findingId,
      excerptLen: pendingUndoRedline.excerpt.length,
      insertedTextLen: pendingUndoRedline.insertedText.length,
      riskLevel: pendingUndoRedline.riskLevel,
    });

    // Small delay to let any in-progress operations finish
    const timer = setTimeout(() => {
      applyUndo(pendingUndoRedline);
    }, 600);

    return () => clearTimeout(timer);
  }, [isDocumentLoaded, pendingUndoRedline, applyUndo]);

  // ─── Cleanup on unmount ────────────────────────────────────────────
  useEffect(() => {
    return () => {
      clearTimers();
    };
  }, [clearTimers]);
}
