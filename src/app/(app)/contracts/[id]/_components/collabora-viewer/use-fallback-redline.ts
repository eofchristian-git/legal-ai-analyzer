/**
 * Collabora Fallback Redline Hook
 * Applies "track changes" visual in the document when a user applies
 * fallback language or a manual edit to a finding.
 *
 * The redline effect:
 *   1. Original excerpt  → strikethrough (kept in document)
 *   2. Replacement text   → new paragraph below (plain text)
 *
 * Three-phase approach (only uses proven-working commands):
 *   Phase 1 — Text insertion:
 *     Find original → InsertText(original + \n + replacement)
 *   Phase 2 — Format both texts:
 *     GoToStartOfDoc → Find original → Strikeout (toggle ON)
 *     → Find replacement → CharBackColor(green)
 *   Phase 3 — Save:
 *     Action_Save
 *
 * R7: Formatting uses property-setter commands (.uno:CharXxx) which are
 * confirmed silent. See research.md §R7.
 *
 * Fix T011: All delays 500ms for reliability.
 * Fix T012: Save failure detection via Action_Save_Resp listener (FR-025).
 */

"use client";

import { useEffect, useLayoutEffect, useRef, useCallback } from "react";
import { toast } from "sonner";
import type { FindingRedlineData } from "@/types/collabora";

// ─── Timing (T011) ───────────────────────────────────────────────────────────

/** Delay between each UNO command step (ms) — increased to 500ms for reliability */
const STEP_DELAY = 500;

// ─── Colors ──────────────────────────────────────────────────────────────────

const LIGHT_GREEN_BG = 0xccffcc;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function cleanText(text: string): string {
  return text
    .normalize('NFC')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2018\u2019]/g, "'")
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
  /** Called on programmatic save failure — FR-025 (T012) */
  onSaveFailed?: (reason: string) => void;
  /** Collabora origin for postMessage save reply listening (T012) */
  collaboraOrigin?: string | null;
}

export function useFallbackRedline({
  isDocumentLoaded,
  executeUnoCommand,
  sendMessage,
  pendingRedline,
  onRedlineApplied,
  onSaveFailed,
  collaboraOrigin,
}: UseFallbackRedlineOptions): void {
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const isApplyingRef = useRef(false);
  const onRedlineAppliedRef = useRef(onRedlineApplied);
  const onSaveFailedRef = useRef(onSaveFailed);
  const collaboraOriginRef = useRef(collaboraOrigin);

  // Sync latest prop values into refs after each render (React 19: outside render body)
  useLayoutEffect(() => { onRedlineAppliedRef.current = onRedlineApplied; }, [onRedlineApplied]);
  useLayoutEffect(() => { onSaveFailedRef.current = onSaveFailed; }, [onSaveFailed]);
  useLayoutEffect(() => { collaboraOriginRef.current = collaboraOrigin; }, [collaboraOrigin]);

  // ─── Core: apply a single redline ──────────────────────────────────
  const applyRedline = useCallback(
    (data: FindingRedlineData) => {
      const { excerpt, replacementText, findingId } = data;
      const searchText = cleanText(excerpt);
      const replacementClean = cleanText(replacementText);

      console.log(
        `[Collabora Redline] Applying redline for finding ${findingId}`
      );
      console.log(
        `[Collabora Redline] Original: "${searchText.substring(0, 80)}…"`
      );
      console.log(
        `[Collabora Redline] Replacement: "${replacementClean.substring(0, 80)}…"`
      );

      // Clear previous timers
      timersRef.current.forEach(clearTimeout);
      timersRef.current = [];

      let d = 0;

      // ── Phase 1: Text insertion ──────────────────────────────────────
      // Find original → replace selection with [original + \n + replacement]

      // Step 1: Search for the original excerpt → selects it
      timersRef.current.push(
        setTimeout(() => {
          console.log("[Collabora Redline] Step 1/7: ExecuteSearch(original)");
          executeUnoCommand(".uno:ExecuteSearch", {
            "SearchItem.SearchString": { type: "string", value: searchText },
            "SearchItem.ReplaceString": { type: "string", value: "" },
            "SearchItem.Backward": { type: "boolean", value: false },
            "SearchItem.RegularExpression": { type: "boolean", value: false },
            "SearchItem.SearchStartPointX": { type: "long", value: 0 },
            "SearchItem.SearchStartPointY": { type: "long", value: 0 },
            "SearchItem.Command": { type: "long", value: 0 }, // Find Next
          });
        }, d)
      );
      d += STEP_DELAY;

      // Step 2: Replace selection with [original + paragraph break + replacement]
      // \n in InsertText creates a paragraph break in LibreOffice Writer.
      timersRef.current.push(
        setTimeout(() => {
          console.log("[Collabora Redline] Step 2/7: InsertText(original + \\n + replacement)");
          executeUnoCommand(".uno:InsertText", {
            Text: { type: "string", value: searchText + "\n" + replacementClean },
          });
        }, d)
      );
      d += STEP_DELAY;

      // ── Phase 2: Format both texts ─────────────────────────────────
      // Directional search: after InsertText the cursor is at the end of
      // the replacement. Original is above → search backward.
      // Replacement is below original → search forward after strikethrough.

      // Step 3: Search backward for the original text → selects it
      timersRef.current.push(
        setTimeout(() => {
          console.log("[Collabora Redline] Step 3/7: ExecuteSearch(original) ⬆ backward");
          executeUnoCommand(".uno:ExecuteSearch", {
            "SearchItem.SearchString": { type: "string", value: searchText },
            "SearchItem.ReplaceString": { type: "string", value: "" },
            "SearchItem.Backward": { type: "boolean", value: true },
            "SearchItem.RegularExpression": { type: "boolean", value: false },
            "SearchItem.SearchStartPointX": { type: "long", value: 0 },
            "SearchItem.SearchStartPointY": { type: "long", value: 0 },
            "SearchItem.Command": { type: "long", value: 0 },
          });
        }, d)
      );
      d += STEP_DELAY;

      // Step 4: Strikethrough on the original (toggle ON)
      timersRef.current.push(
        setTimeout(() => {
          console.log("[Collabora Redline] Step 4/7: Strikeout (toggle ON)");
          executeUnoCommand(".uno:Strikeout");
        }, d)
      );
      d += STEP_DELAY;

      // Step 5: Search forward for the replacement text → selects it
      // (replacement is on the next paragraph, right below the original)
      timersRef.current.push(
        setTimeout(() => {
          console.log("[Collabora Redline] Step 5/7: ExecuteSearch(replacement) ⬇ forward");
          executeUnoCommand(".uno:ExecuteSearch", {
            "SearchItem.SearchString": { type: "string", value: replacementClean },
            "SearchItem.ReplaceString": { type: "string", value: "" },
            "SearchItem.Backward": { type: "boolean", value: false },
            "SearchItem.RegularExpression": { type: "boolean", value: false },
            "SearchItem.SearchStartPointX": { type: "long", value: 0 },
            "SearchItem.SearchStartPointY": { type: "long", value: 0 },
            "SearchItem.Command": { type: "long", value: 0 },
          });
        }, d)
      );
      d += STEP_DELAY;

      // Step 6: Apply green background to the selected replacement text
      timersRef.current.push(
        setTimeout(() => {
          console.log("[Collabora Redline] Step 6/7: CharBackColor → green (replacement)");
          executeUnoCommand(".uno:CharBackColor", {
            CharBackColor: { type: "long", value: LIGHT_GREEN_BG },
          });
        }, d)
      );
      d += STEP_DELAY;

      // ── Phase 3: Save ──────────────────────────────────────────────

      // Step 7: Save the document via Action_Save → triggers WOPI PutFile
      // T012: Includes save failure detection via Action_Save_Resp listener.
      timersRef.current.push(
        setTimeout(() => {
          console.log("[Collabora Redline] Step 7/7: Action_Save → PutFile");

          // T012: Listen for Action_Save_Resp to detect save failures (FR-025)
          const origin = collaboraOriginRef.current;
          let saveReplied = false;
          const SAVE_REPLY_TIMEOUT_MS = 8000;

          const saveReplyHandler = (event: MessageEvent) => {
            if (origin && event.origin !== origin) return;
            let msg: { MessageId?: string; Values?: Record<string, unknown> };
            try {
              msg = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
            } catch { return; }
            if (msg?.MessageId !== 'Action_Save_Resp') return;

            saveReplied = true;
            window.removeEventListener('message', saveReplyHandler);
            clearTimeout(saveTimeoutId);

            const success = (msg.Values?.Success as boolean | undefined) !== false;
            if (!success) {
              console.error('[Collabora Redline] Action_Save_Resp indicates failure:', msg.Values);
              toast.error('Document save failed', {
                description: 'Your change has been queued and will be retried when you reopen the viewer.',
                duration: 8000,
              });
              onSaveFailedRef.current?.('Redline save failed');
            }
          };

          const saveTimeoutId = setTimeout(() => {
            if (!saveReplied) {
              window.removeEventListener('message', saveReplyHandler);
              console.warn('[Collabora Redline] Action_Save_Resp timeout — assuming save succeeded');
            }
          }, SAVE_REPLY_TIMEOUT_MS);

          timersRef.current.push(saveTimeoutId);
          window.addEventListener('message', saveReplyHandler);

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
          isApplyingRef.current = false;
          onRedlineAppliedRef.current?.();
        }, d)
      );
    },
    [executeUnoCommand, sendMessage]
  );

  // ─── Watch for pendingRedline changes ──────────────────────────────
  useEffect(() => {
    if (!isDocumentLoaded || !pendingRedline) return;
    // Prevent overlapping operations — if a redline is in progress, skip.
    // The parent should clear pendingRedline on completion (onRedlineApplied)
    // and re-set it if another change is queued.
    if (isApplyingRef.current) {
      console.warn("[Collabora Redline] Skipping — another redline is in progress");
      return;
    }

    // Small delay to let any in-progress highlighting finish
    const timer = setTimeout(() => {
      isApplyingRef.current = true;
      applyRedline(pendingRedline);
    }, 500);

    return () => clearTimeout(timer);
  }, [isDocumentLoaded, pendingRedline, applyRedline]);

  // ─── Cleanup on unmount ────────────────────────────────────────────
  useEffect(() => {
    return () => {
      timersRef.current.forEach(clearTimeout);
      timersRef.current = [];
      isApplyingRef.current = false;
    };
  }, []);
}
