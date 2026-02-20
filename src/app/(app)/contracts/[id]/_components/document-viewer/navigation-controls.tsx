'use client';

/** @deprecated Feature 008 — Navigation Controls (DEPRECATED). Replaced by Feature 009 ONLYOFFICE native navigation. */
// Feature 008: Interactive Document Viewer & Redline Export
// Navigation controls for finding traversal (T023, T046, T048, T049)

import React from 'react';
import { ChevronUp, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface NavigationControlsProps {
  currentFindingIndex: number;
  totalFindings: number;
  onNext: () => void;
  onPrev: () => void;
  // T048: Filter context (risk levels to respect when navigating)
  activeRiskFilter?: 'ALL' | 'RED' | 'YELLOW' | 'GREEN';
}

export function NavigationControls({
  currentFindingIndex,
  totalFindings,
  onNext,
  onPrev,
  activeRiskFilter,
}: NavigationControlsProps) {
  // T049: Disable at edges
  const isFirst = currentFindingIndex <= 0;
  const isLast = currentFindingIndex >= totalFindings - 1;
  const hasFindings = totalFindings > 0;

  return (
    <div className="flex items-center gap-1 text-xs text-muted-foreground">
      {/* T046: Finding counter display */}
      <Button
        variant="ghost"
        size="icon"
        className="h-6 w-6"
        onClick={onPrev}
        disabled={!hasFindings || isFirst}
        title="Previous finding (Ctrl+↑)"
        aria-label="Previous finding"
      >
        <ChevronUp className="h-3.5 w-3.5" />
      </Button>

      <span
        className={cn(
          'min-w-[90px] text-center tabular-nums text-xs',
          !hasFindings && 'text-muted-foreground/50'
        )}
      >
        {!hasFindings
          ? 'No findings'
          : `Finding ${currentFindingIndex + 1} of ${totalFindings}`}
      </span>

      <Button
        variant="ghost"
        size="icon"
        className="h-6 w-6"
        onClick={onNext}
        disabled={!hasFindings || isLast}
        title="Next finding (Ctrl+↓)"
        aria-label="Next finding"
      >
        <ChevronDown className="h-3.5 w-3.5" />
      </Button>

      {/* T048: Show active filter indicator */}
      {activeRiskFilter && activeRiskFilter !== 'ALL' && (
        <span
          className={cn(
            'ml-1 text-[10px] px-1.5 py-0.5 rounded-full border font-medium',
            activeRiskFilter === 'RED' &&
              'bg-red-50 text-red-700 border-red-200',
            activeRiskFilter === 'YELLOW' &&
              'bg-yellow-50 text-yellow-700 border-yellow-200',
            activeRiskFilter === 'GREEN' &&
              'bg-green-50 text-green-700 border-green-200'
          )}
        >
          {activeRiskFilter === 'RED'
            ? 'High only'
            : activeRiskFilter === 'YELLOW'
            ? 'Med only'
            : 'Low only'}
        </span>
      )}
    </div>
  );
}
