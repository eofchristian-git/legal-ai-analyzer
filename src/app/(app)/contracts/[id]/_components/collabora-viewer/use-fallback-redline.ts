/**
 * Collabora Fallback Redline Hook
 * Applies "track changes" visual in the document when a user applies
 * fallback language or a manual edit to a finding.
 *
 * The redline effect:
 *   1. Original excerpt  → strikethrough + gray text
 *   2. Replacement text   → inserted right after, bold green on light-green bg
 *
 * UNO command sequence (10 steps, ~300ms between each):
 *   ExecuteSearch → Strikeout → Color(gray) → GoRight →
 *   InsertText → GoLeft(select) → CharBackColor(green) → Color(darkGreen) →
 *   Bold → Strikeout(off)
 */

"use client";

import { useEffect, useRef, useCallback } from "react";
import type { FindingRedlineData } from "@/types/collabora";

// ─── Timing ──────────────────────────────────────────────────────────────────

/** Delay between each UNO command step (ms) */
const STEP_DELAY = 350;

// ─── Colors ──────────────────────────────────────────────────────────────────

const GRAY_TEXT = 0x999999;
const DARK_GREEN_TEXT = 0x006600;
const LIGHT_GREEN_BG = 0xccffcc;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function cleanText(text: string): string {
  return text
    .replace(/[\r\n]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .trim();
}

// ─── Hook ────────────────────────────────────────────────────────────────────

interface UseFallbackRedlineOptions {
  /** Whether the Collabora document has finished loading */
  isDocumentLoaded: boolean;
  /** Function to dispatch a UNO command to Collabora via postMessage */
  executeUnoCommand: (command: string, args?: Record<string, unknown>) => void;
  /** Function to send a raw postMessage to the Collabora iframe (for Action_Save) */
  sendMessage: (message: Record<string, unknown>) => void;
  /** The redline to apply (set by parent when user applies fallback) */
  pendingRedline: FindingRedlineData | null;
  /** Called after the redline has been visually applied and saved */
  onRedlineApplied?: () => void;
}

export function useFallbackRedline({
  isDocumentLoaded,
  executeUnoCommand,
  sendMessage,
  pendingRedline,
  onRedlineApplied,
}: UseFallbackRedlineOptions): void {
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const lastAppliedRef = useRef<string | null>(null);
  const onRedlineAppliedRef = useRef(onRedlineApplied);
  onRedlineAppliedRef.current = onRedlineApplied;

  // ─── Core: apply a single redline ──────────────────────────────────
  const applyRedline = useCallback(
    (data: FindingRedlineData) => {
      const { excerpt, replacementText, findingId } = data;
      const searchText = cleanText(excerpt);
      const insertText = " " + cleanText(replacementText);

      console.log(
        `[Collabora Redline] Applying redline for finding ${findingId}`
      );
      console.log(
        `[Collabora Redline] Original: "${searchText.substring(0, 80)}…"`
      );
      console.log(
        `[Collabora Redline] Replacement: "${insertText.substring(0, 80)}…"`
      );

      // Clear previous timers
      timersRef.current.forEach(clearTimeout);
      timersRef.current = [];

      let d = 0;

      // Step 1: Search for the original excerpt → selects it
      timersRef.current.push(
        setTimeout(() => {
          console.log("[Collabora Redline] Step 1/10: ExecuteSearch");
          executeUnoCommand(".uno:ExecuteSearch", {
            "SearchItem.SearchString": { type: "string", value: searchText },
            "SearchItem.ReplaceString": { type: "string", value: "" },
            "SearchItem.Backward": { type: "boolean", value: false },
            "SearchItem.SearchStartPointX": { type: "long", value: 0 },
            "SearchItem.SearchStartPointY": { type: "long", value: 0 },
            "SearchItem.Command": { type: "long", value: 0 }, // Find Next
          });
        }, d)
      );
      d += STEP_DELAY;

      // Step 2: Apply strikethrough to the selected text
      timersRef.current.push(
        setTimeout(() => {
          console.log("[Collabora Redline] Step 2/10: Strikeout ON");
          executeUnoCommand(".uno:Strikeout", {});
        }, d)
      );
      d += STEP_DELAY;

      // Step 3: Gray text color on the original
      timersRef.current.push(
        setTimeout(() => {
          console.log("[Collabora Redline] Step 3/10: Color → gray");
          executeUnoCommand(".uno:Color", {
            "FontColor.Color": { type: "long", value: GRAY_TEXT },
          });
        }, d)
      );
      d += STEP_DELAY;

      // Step 4: Collapse selection to the right (cursor at end of excerpt)
      timersRef.current.push(
        setTimeout(() => {
          console.log("[Collabora Redline] Step 4/10: GoRight (deselect)");
          executeUnoCommand(".uno:GoRight", {
            Count: { type: "long", value: 1 },
            Select: { type: "boolean", value: false },
          });
        }, d)
      );
      d += STEP_DELAY;

      // Step 5: Insert the replacement text at cursor position
      timersRef.current.push(
        setTimeout(() => {
          console.log("[Collabora Redline] Step 5/10: InsertText");
          executeUnoCommand(".uno:InsertText", {
            Text: { type: "string", value: insertText },
          });
        }, d)
      );
      d += STEP_DELAY;

      // Step 6: Select the just-inserted text by going left
      timersRef.current.push(
        setTimeout(() => {
          console.log(
            `[Collabora Redline] Step 6/10: GoLeft (select ${insertText.length} chars)`
          );
          executeUnoCommand(".uno:GoLeft", {
            Count: { type: "long", value: insertText.length },
            Select: { type: "boolean", value: true },
          });
        }, d)
      );
      d += STEP_DELAY;

      // Step 7: Apply green background to the replacement text
      timersRef.current.push(
        setTimeout(() => {
          console.log("[Collabora Redline] Step 7/10: CharBackColor → green");
          executeUnoCommand(".uno:CharBackColor", {
            CharBackColor: { type: "long", value: LIGHT_GREEN_BG },
          });
        }, d)
      );
      d += STEP_DELAY;

      // Step 8: Dark green text color on the replacement
      timersRef.current.push(
        setTimeout(() => {
          console.log("[Collabora Redline] Step 8/10: Color → dark green");
          executeUnoCommand(".uno:Color", {
            "FontColor.Color": { type: "long", value: DARK_GREEN_TEXT },
          });
        }, d)
      );
      d += STEP_DELAY;

      // Step 9: Make the replacement text bold
      timersRef.current.push(
        setTimeout(() => {
          console.log("[Collabora Redline] Step 9/10: Bold");
          executeUnoCommand(".uno:Bold", {});
        }, d)
      );
      d += STEP_DELAY;

      // Step 10: Remove any inherited strikethrough from the replacement
      timersRef.current.push(
        setTimeout(() => {
          console.log("[Collabora Redline] Step 10/11: Strikeout OFF");
          // Toggle strikeout — since we're on the inserted text that may have
          // inherited strikethrough from cursor position, toggle it off.
          executeUnoCommand(".uno:Strikeout", {});
        }, d)
      );
      d += STEP_DELAY;

      // Step 11: Save the document via Action_Save → triggers WOPI PutFile
      // This persists the redline changes (strikethrough + inserted text)
      // back to the DOCX file on the server.
      timersRef.current.push(
        setTimeout(() => {
          console.log("[Collabora Redline] Step 11/11: Action_Save → PutFile");
          sendMessage({
            MessageId: "Action_Save",
            Values: {
              DontTerminateEdit: true,
              DontSaveIfUnmodified: false,
              Notify: true,
            },
          });
        }, d)
      );
      d += STEP_DELAY * 2; // Extra time for save round-trip

      // Notify parent that the redline is complete and saved
      timersRef.current.push(
        setTimeout(() => {
          console.log("[Collabora Redline] ✓ Redline applied and saved");
          lastAppliedRef.current = findingId;
          onRedlineAppliedRef.current?.();
        }, d)
      );
    },
    [executeUnoCommand, sendMessage]
  );

  // ─── Watch for pendingRedline changes ──────────────────────────────
  useEffect(() => {
    if (!isDocumentLoaded || !pendingRedline) return;
    // Avoid re-applying the same redline
    if (lastAppliedRef.current === pendingRedline.findingId) return;

    // Small delay to let any in-progress highlighting finish
    const timer = setTimeout(() => {
      applyRedline(pendingRedline);
    }, 500);

    return () => clearTimeout(timer);
  }, [isDocumentLoaded, pendingRedline, applyRedline]);

  // ─── Cleanup on unmount ────────────────────────────────────────────
  useEffect(() => {
    return () => {
      timersRef.current.forEach(clearTimeout);
      timersRef.current = [];
    };
  }, []);
}
