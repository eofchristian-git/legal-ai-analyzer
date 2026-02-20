'use client';

/**
 * Scroll Sync Hook — Feature 012 (T018)
 * Determines which clause is currently visible in the PDF viewer
 * by tracking the visible page range and matching clause mappings.
 * Debounced to avoid rapid updates during fast scrolling.
 */

import { useCallback, useRef } from 'react';
import type { ClausePdfMapping } from '@/types/pdf-viewer';

interface UseScrollSyncOptions {
  clauseMappings: ClausePdfMapping[];
  onActiveClauseChange: (clauseId: string | null) => void;
}

export function useScrollSync({ clauseMappings, onActiveClauseChange }: UseScrollSyncOptions) {
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /**
   * Call this when the visible page range changes (e.g., on scroll).
   * Finds the first clause whose pageIndex is within the visible range.
   */
  const onVisibleRangeChange = useCallback(
    (firstVisiblePage: number, lastVisiblePage: number) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);

      debounceRef.current = setTimeout(() => {
        // Find the first clause that starts in the visible range
        const visible = clauseMappings
          .filter(
            (m) =>
              !m.unmapped &&
              m.pageIndex >= firstVisiblePage &&
              m.pageIndex <= lastVisiblePage
          )
          .sort((a, b) => {
            if (a.pageIndex !== b.pageIndex) return a.pageIndex - b.pageIndex;
            return a.startRect.y - b.startRect.y;
          });

        onActiveClauseChange(visible[0]?.clauseId ?? null);
      }, 150);
    },
    [clauseMappings, onActiveClauseChange]
  );

  return { onVisibleRangeChange };
}
