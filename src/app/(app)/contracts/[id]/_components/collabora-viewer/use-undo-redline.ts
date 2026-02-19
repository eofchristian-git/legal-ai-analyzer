/**
 * Collabora Undo Redline Hook
 *
 * Reverts a previously applied fallback redline in the document:
 *   Phase 1 — Delete the inserted fallback paragraph (bold green text + paragraph break)
 *   Phase 2 — Restore the original excerpt (remove strikethrough + gray, re-apply highlight)
 *   Phase 3 — Save via Action_Save → WOPI PutFile
 *
 * The fallback redline hook inserts: original text \n replacement text
 * (as two separate paragraphs). Undo replaces this combined text with
 * just the original text, then re-formats it.
 *
 * UNO command sequence:
 *   GoToStartOfDoc →
 *   ExecuteSearch(replacementText) → Delete →
 *   GoToStartOfDoc →
 *   ExecuteSearch(originalExcerpt) → CharStrikeout(NONE) → CharColor(black) →
 *   CharBackColor(riskColor) → GoToStartOfDoc → Action_Save → notify
 *
 * R7: All formatting uses property-setter commands (.uno:CharXxx).
 * See research.md §R7.
 */

"use client";

import { useEffect, useLayoutEffect, useRef, useCallback } from "react";
import { toast } from "sonner";
import type { FindingUndoRedlineData } from "@/types/collabora";

// ─── Timing ──────────────────────────────────────────────────────────────────

/** Delay between each UNO command step (ms) — generous for reliability */
const STEP_DELAY = 500;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function cleanText(text: string): string {
  return text
    .replace(/[\r\n]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .trim();
}

function searchArgs(text: string, backward = false) {
  return {
    "SearchItem.SearchString": { type: "string", value: text },
    "SearchItem.ReplaceString": { type: "string", value: "" },
    "SearchItem.Backward": { type: "boolean", value: backward },
    "SearchItem.RegularExpression": { type: "boolean", value: false },
    "SearchItem.SearchStartPointX": { type: "long", value: 0 },
    "SearchItem.SearchStartPointY": { type: "long", value: 0 },
    "SearchItem.Command": { type: "long", value: 0 },
  };
}

// ─── Hook ────────────────────────────────────────────────────────────────────

interface UseUndoRedlineOptions {
  isDocumentLoaded: boolean;
  executeUnoCommand: (command: string, args?: Record<string, unknown>) => void;
  sendMessage: (message: Record<string, unknown>) => void;
  pendingUndoRedline: FindingUndoRedlineData | null;
  onUndoRedlineApplied?: () => void;
  /** Called on programmatic save failure — FR-025 (T009) */
  onSaveFailed?: (reason: string) => void;
  /** Collabora origin for postMessage save reply listening (T009) */
  collaboraOrigin?: string | null;
}

export function useUndoRedline({
  isDocumentLoaded,
  executeUnoCommand,
  sendMessage,
  pendingUndoRedline,
  onUndoRedlineApplied,
  onSaveFailed,
  collaboraOrigin,
}: UseUndoRedlineOptions): void {
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const lastAppliedKeyRef = useRef<string | null>(null);
  const onUndoRedlineAppliedRef = useRef(onUndoRedlineApplied);
  const onSaveFailedRef = useRef(onSaveFailed);
  const collaboraOriginRef = useRef(collaboraOrigin);

  // Sync latest prop values into refs after each render (React 19: outside render body)
  useLayoutEffect(() => { onUndoRedlineAppliedRef.current = onUndoRedlineApplied; }, [onUndoRedlineApplied]);
  useLayoutEffect(() => { onSaveFailedRef.current = onSaveFailed; }, [onSaveFailed]);
  useLayoutEffect(() => { collaboraOriginRef.current = collaboraOrigin; }, [collaboraOrigin]);

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
      const { excerpt, insertedText, findingId } = data;

      // The fallback redline hook inserts: cleanText(original) + \n + cleanText(replacement)
      // So the replacement text is on its own paragraph (no leading space).
      const replacementInDoc = cleanText(insertedText);
      const originalExcerpt = cleanText(excerpt);

      console.log(`[Collabora Undo] ── Starting undo for finding ${findingId} ──`);
      console.log(`[Collabora Undo] Replacement to DELETE : "${replacementInDoc.substring(0, 100)}…" (${replacementInDoc.length} chars)`);
      console.log(`[Collabora Undo] Original to RESTORE: "${originalExcerpt.substring(0, 100)}…" (${originalExcerpt.length} chars)`);

      clearTimers();
      let d = 0;

      // ── Phase 1: Delete the replacement paragraph ──────────────────
      // The redline hook inserted: original\nreplacement
      // We need to delete the replacement text AND the paragraph break before it.
      // Directional search keeps the viewport near the clause (no GoToStartOfDoc).

      // Step 1: Search forward for the replacement text → selects it
      schedule(d, () => {
        console.log("[Collabora Undo] Step 1/7: Search forward for replacement");
        executeUnoCommand(".uno:ExecuteSearch", searchArgs(replacementInDoc));
      });
      d += STEP_DELAY;

      // Step 2: Delete the selected replacement text
      schedule(d, () => {
        console.log("[Collabora Undo] Step 2/7: Delete replacement");
        executeUnoCommand(".uno:Delete");
      });
      d += STEP_DELAY;

      // Step 3: Backspace to remove the empty paragraph break (\n)
      schedule(d, () => {
        console.log("[Collabora Undo] Step 3/7: Backspace paragraph break");
        executeUnoCommand(".uno:SwBackspace");
      });
      d += STEP_DELAY;

      // ── Phase 2: Restore the original excerpt formatting ───────────
      // After deleting replacement + paragraph break, cursor is at end of original.
      // Search backward to find the original text right above.

      // Step 4: Search backward for the original excerpt → selects it
      schedule(d, () => {
        console.log("[Collabora Undo] Step 4/7: Search backward for original");
        executeUnoCommand(".uno:ExecuteSearch", searchArgs(originalExcerpt, true));
      });
      d += STEP_DELAY;

      // Step 5: Remove strikethrough (toggle OFF)
      schedule(d, () => {
        console.log("[Collabora Undo] Step 5/7: Strikeout (toggle OFF)");
        executeUnoCommand(".uno:Strikeout");
      });
      d += STEP_DELAY;

      // ── Phase 3: Save and notify ──────────────────────────────────

      // Step 6: Save the document (T009: with save reply listener)
      schedule(d, () => {
        console.log("[Collabora Undo] Step 6/7: Action_Save → PutFile");

        // T009: Listen for Action_Save_Resp to detect save failures (FR-025).
        // Uses a window message listener that removes itself after reply or timeout.
        const origin = collaboraOriginRef.current;
        let saveReplied = false;
        const SAVE_REPLY_TIMEOUT_MS = 8000;

        const saveReplyHandler = (event: MessageEvent) => {
          if (origin && event.origin !== origin) return;
          let data: { MessageId?: string; Values?: Record<string, unknown> };
          try {
            data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
          } catch { return; }
          if (data?.MessageId !== 'Action_Save_Resp') return;

          saveReplied = true;
          window.removeEventListener('message', saveReplyHandler);
          clearTimeout(saveTimeoutId);

          const success = (data.Values?.Success as boolean | undefined) !== false;
          if (!success) {
            console.error('[Collabora Undo] Action_Save_Resp indicates failure:', data.Values);
            toast.error('Document save failed', {
              description: 'Your undo change will be retried when you reopen the viewer.',
              duration: 8000,
            });
            onSaveFailedRef.current?.('Undo save failed');
          }
        };

        const saveTimeoutId = setTimeout(() => {
          if (!saveReplied) {
            window.removeEventListener('message', saveReplyHandler);
            console.warn('[Collabora Undo] Action_Save_Resp timeout — assuming save succeeded');
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
      });
      d += STEP_DELAY * 3; // Extra time for save round-trip

      // Step 7: Notify parent
      schedule(d, () => {
        console.log("[Collabora Undo] Step 7/7: ✓ Undo complete and saved");
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
