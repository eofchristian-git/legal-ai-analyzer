'use client';

/**
 * PDF Navigation Hook — Feature 012 (T017)
 * Provides scrollToClause(clauseId) → looks up ClausePdfMapping → calls scrollToPage.
 */

import { useCallback } from 'react';
import type { ClausePdfMapping } from '@/types/pdf-viewer';
import { toast } from 'sonner';

interface UsePdfNavigationOptions {
  clauseMappings: ClausePdfMapping[];
  scrollToPage: (pageIndex: number, yOffset: number) => void;
}

export function usePdfNavigation({ clauseMappings, scrollToPage }: UsePdfNavigationOptions) {
  const scrollToClause = useCallback(
    (clauseId: string): boolean => {
      const mapping = clauseMappings.find((m) => m.clauseId === clauseId);

      if (!mapping) return false;

      if (mapping.unmapped) {
        toast.info('Could not locate this clause in the document');
        return false;
      }

      scrollToPage(mapping.pageIndex, mapping.startRect.y);
      return true;
    },
    [clauseMappings, scrollToPage]
  );

  return { scrollToClause };
}
