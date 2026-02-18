'use client';

/**
 * @deprecated Feature 008 — HTML Document Viewer (DEPRECATED)
 * Replaced by Feature 009: ONLYOFFICE Document Viewer Integration.
 * This component is retained for backward compatibility with contracts
 * analyzed before ONLYOFFICE integration. New contracts should use
 * OnlyOfficeDocumentViewer from onlyoffice-viewer/.
 * Removal planned after ONLYOFFICE validation is complete (Phase 8, T039).
 */
// Feature 008: Interactive Document Viewer & Redline Export
// Main document viewer container with navigation, scroll sync, and tracked changes

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { GitCompare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { HTMLRenderer } from './html-renderer';
import { NavigationControls } from './navigation-controls';
import { TrackedChangesLayer } from './tracked-changes-layer';
import { TrackedChangesLegend } from './tracked-changes-legend';
import type { DocumentViewerProps, FindingPosition, HighlightFinding, HighlightClause } from '@/types/document-viewer';
import type { ProjectionResult } from '@/types/decisions';

interface ExtendedDocumentViewerProps extends DocumentViewerProps {
  // T032: Full projections with tracked changes data
  allProjections?: Record<string, ProjectionResult>;
  // T048: Active risk filter from clause list
  activeRiskFilter?: 'ALL' | 'RED' | 'YELLOW' | 'GREEN';
  // Client-side text highlights from contract finding excerpts
  highlightFindings?: HighlightFinding[];
  // Client-side clause markers for scroll navigation
  highlightClauses?: HighlightClause[];
}

export function DocumentViewer({
  htmlContent,
  clausePositions,
  findingPositions,
  selectedClauseId,
  onClauseClick,
  onFindingClick,
  allProjections = {},
  activeRiskFilter = 'ALL',
  highlightFindings,
  highlightClauses,
}: ExtendedDocumentViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [viewerHeight, setViewerHeight] = useState(600);
  const [isClient, setIsClient] = useState(false);
  // T031: Tracked changes toggle state
  const [showTrackedChanges, setShowTrackedChanges] = useState(false);
  // T047: Current finding index for navigation
  const [currentFindingIndex, setCurrentFindingIndex] = useState(0);
  // Incremented when HTMLRenderer finishes applying clause markers
  const [clauseMarkersAppliedKey, setClauseMarkersAppliedKey] = useState(0);
  // Scroll sync debounce ref
  const scrollSyncDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const intersectionObserverRef = useRef<IntersectionObserver | null>(null);
  // T053: Skip scroll sync when programmatically scrolling to avoid loops
  const isProgrammaticScrollRef = useRef(false);

  // T051: Loading state

  // T050: Track visible findings for scrollbar markers (T044)
  // T048: Filter findings by risk level when filter is active
  // Note: FindingPosition doesn't carry riskLevel - future enhancement would add it
  const filteredFindings: FindingPosition[] = React.useMemo(() => {
    return findingPositions;
  }, [findingPositions]);

  // T052: Check if tracked changes are available
  const hasTrackedChanges = React.useMemo(() => {
    return Object.values(allProjections).some(
      (p) => p.trackedChanges && p.trackedChanges.some((c) => c.type !== 'equal')
    );
  }, [allProjections]);

  // Set viewer height on mount (client-side only)
  useEffect(() => {
    setIsClient(true);

    if (typeof window !== 'undefined') {
      setViewerHeight(window.innerHeight - 220);

      const handleResize = () => {
        setViewerHeight(window.innerHeight - 220);
      };

      window.addEventListener('resize', handleResize);
      return () => window.removeEventListener('resize', handleResize);
    }
  }, []);

  // T024: Scroll to selected clause when selectedClauseId changes.
  // Retries after clause markers are applied (clauseMarkersAppliedKey bump).
  useEffect(() => {
    if (!selectedClauseId || !containerRef.current) return;

    const scrollToClause = () => {
      if (!containerRef.current) return;
      const clauseEl = containerRef.current.querySelector(
        `[data-clause-id="${selectedClauseId}"]`
      ) as HTMLElement | null;

      if (clauseEl) {
        isProgrammaticScrollRef.current = true;
        clauseEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
        setTimeout(() => {
          isProgrammaticScrollRef.current = false;
        }, 700);
      }
    };

    // Try immediately, then retry after a short delay in case markers are still being applied
    scrollToClause();
    const retry = setTimeout(scrollToClause, 150);
    return () => clearTimeout(retry);
  }, [selectedClauseId, clauseMarkersAppliedKey]);

  // T026: Set up IntersectionObserver for scroll sync (document → clause list)
  useEffect(() => {
    if (!containerRef.current || !onClauseClick) return;

    // Clean up previous observer
    if (intersectionObserverRef.current) {
      intersectionObserverRef.current.disconnect();
    }

    const observer = new IntersectionObserver(
      (entries) => {
        // Skip if programmatic scroll is in progress
        if (isProgrammaticScrollRef.current) return;

        // Find the clause with highest intersection ratio
        let bestEntry: IntersectionObserverEntry | null = null;
        let bestRatio = 0;

        for (const entry of entries) {
          if (entry.isIntersecting && entry.intersectionRatio > bestRatio) {
            bestRatio = entry.intersectionRatio;
            bestEntry = entry;
          }
        }

        if (bestEntry) {
          const clauseId = (bestEntry.target as HTMLElement).getAttribute(
            'data-clause-id'
          );
          if (clauseId && clauseId !== selectedClauseId) {
            // T026: Debounce 250ms after scroll stops
            if (scrollSyncDebounceRef.current) {
              clearTimeout(scrollSyncDebounceRef.current);
            }
            scrollSyncDebounceRef.current = setTimeout(() => {
              onClauseClick?.(clauseId);
            }, 250);
          }
        }
      },
      {
        root: containerRef.current,
        rootMargin: '-10% 0px -60% 0px', // Trigger when clause is in top 30% of viewport
        threshold: [0.1, 0.3, 0.5],
      }
    );

    intersectionObserverRef.current = observer;

    // Observe all clause elements after HTML is rendered
    const observeClauseElements = () => {
      if (!containerRef.current) return;
      const clauseEls = containerRef.current.querySelectorAll('[data-clause-id]');
      clauseEls.forEach((el) => observer.observe(el));
    };

    // Observe clause elements — run after client-side markers are applied
    const timer = setTimeout(observeClauseElements, 50);

    return () => {
      clearTimeout(timer);
      observer.disconnect();
      if (scrollSyncDebounceRef.current) {
        clearTimeout(scrollSyncDebounceRef.current);
      }
    };
  // Re-run when HTML changes OR when client-side clause markers are applied
  }, [htmlContent, onClauseClick, clauseMarkersAppliedKey]);

  // T045: Keyboard shortcuts for finding navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'ArrowDown') {
        e.preventDefault();
        navigateFinding(1);
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'ArrowUp') {
        e.preventDefault();
        navigateFinding(-1);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  // navigateFinding is stable within this effect context; adding it would cause re-subscription loops
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentFindingIndex, filteredFindings]);

  // T047: Navigate to next/previous finding
  const navigateFinding = useCallback(
    (direction: number) => {
      if (filteredFindings.length === 0) return;

      // T049: Clamp at edges
      const newIndex = Math.max(
        0,
        Math.min(filteredFindings.length - 1, currentFindingIndex + direction)
      );
      setCurrentFindingIndex(newIndex);

      const finding = filteredFindings[newIndex];
      if (!finding || !containerRef.current) return;

      // Try finding-specific element first, fall back to clause
      const findingEl = containerRef.current.querySelector(
        `[data-finding-id="${finding.findingId}"]`
      ) as HTMLElement | null;
      const clauseEl = containerRef.current.querySelector(
        `[data-clause-id="${finding.clauseId}"]`
      ) as HTMLElement | null;
      const targetEl = findingEl || clauseEl;

      if (targetEl) {
        isProgrammaticScrollRef.current = true;
        targetEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
        setTimeout(() => {
          isProgrammaticScrollRef.current = false;
        }, 700);
      }

      // Notify parent of finding click
      onFindingClick?.(finding.findingId, finding.clauseId);
    },
    [currentFindingIndex, filteredFindings, onFindingClick]
  );

  // T051: Show skeleton while loading
  if (!isClient) {
    return (
      <div className="w-full flex flex-col" style={{ height: viewerHeight }}>
        <div className="flex-1 bg-gray-100 animate-pulse flex items-center justify-center">
          <div className="text-gray-400 text-sm">Loading document viewer...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full flex flex-col" style={{ height: viewerHeight }}>
      {/* T028: Toolbar with navigation controls and tracked changes toggle */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b bg-muted/30 shrink-0">
        <NavigationControls
          currentFindingIndex={currentFindingIndex}
          totalFindings={filteredFindings.length}
          onNext={() => navigateFinding(1)}
          onPrev={() => navigateFinding(-1)}
          activeRiskFilter={activeRiskFilter}
        />

        <div className="flex items-center gap-2">
          {/* T031: Tracked changes toggle (only shown when changes exist) */}
          {hasTrackedChanges && (
            <Button
              variant={showTrackedChanges ? 'default' : 'outline'}
              size="sm"
              onClick={() => setShowTrackedChanges((v) => !v)}
              className="h-7 text-xs gap-1.5"
              title="Toggle tracked changes view"
            >
              <GitCompare className="h-3.5 w-3.5" />
              {showTrackedChanges ? 'Hide Changes' : 'Show Changes'}
            </Button>
          )}
        </div>
      </div>

      {/* T035: Tracked changes legend (shown when toggle is ON) */}
      {showTrackedChanges && <TrackedChangesLegend />}

      {/* T052: Error / no-content state */}
      {!htmlContent ? (
        <div className="flex-1 flex items-center justify-center bg-gray-50">
          <div className="text-center">
            <div className="text-muted-foreground mb-1 font-medium">
              Document not available
            </div>
            <div className="text-sm text-muted-foreground/70">
              The document has not been converted yet or conversion failed.
            </div>
          </div>
        </div>
      ) : (
        /* T053: Scrollable document container */
        <div
          ref={containerRef}
          className="flex-1 overflow-y-auto bg-gray-100 p-4"
        >
          {/* T044: Custom scrollbar markers for findings */}
          <div
            className="relative bg-white shadow-lg rounded-sm p-8 mx-auto"
            style={{ maxWidth: '800px' }}
          >
            {/* HTML Content with active clause indicator (T025) and inline highlights */}
            <HTMLRenderer
              html={htmlContent}
              pageNum={1}
              selectedClauseId={selectedClauseId}
              onFindingClick={onFindingClick}
              highlightFindings={highlightFindings}
              highlightClauses={highlightClauses}
              onClauseMarkersApplied={() =>
                setClauseMarkersAppliedKey((k) => k + 1)
              }
            />

            {/* T033, T034: Tracked changes layer (shown when toggle ON) */}
            {showTrackedChanges && (
              <TrackedChangesLayer
                clausePositions={clausePositions}
                allProjections={allProjections}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
