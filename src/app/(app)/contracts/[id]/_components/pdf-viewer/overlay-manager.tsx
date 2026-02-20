'use client';

/**
 * Overlay Manager — Feature 012 (T013)
 * Combines all overlay layers for a single PDF page:
 *   - RiskHighlightOverlay (risk-level color highlights)
 *   - RedlineOverlay (strikethrough + replacement text for applied fallbacks)
 *   - NoteOverlay (margin annotations for notes/summaries)
 *
 * Extended in US3 (T022) and US5 (T033) phases.
 */

import type { FindingPdfMapping, ClausePdfMapping } from '@/types/pdf-viewer';
import { RiskHighlightOverlay } from './risk-highlight-overlay';
import { RedlineOverlay } from './redline-overlay';
import { NoteOverlay } from './note-overlay';

interface FindingProjectionInfo {
  appliedFallbackText?: string;
  notes?: string[];
  aiSummary?: string;
}

interface OverlayManagerProps {
  pageIndex: number;
  findingMappings: FindingPdfMapping[];
  clauseMappings: ClausePdfMapping[];
  scale: number;
  /** Map of findingId → projection data for overlays */
  findingProjections?: Map<string, FindingProjectionInfo>;
  pageWidth?: number;
}

export function OverlayManager({
  pageIndex,
  findingMappings,
  clauseMappings,
  scale,
  findingProjections,
  pageWidth,
}: OverlayManagerProps) {
  // Determine which findings have applied fallbacks (for redline vs highlight)
  const resolvedFindingIds = new Set<string>();
  const redlineFindingProjections = new Map<string, { appliedFallbackText?: string }>();

  if (findingProjections) {
    for (const [findingId, proj] of findingProjections) {
      if (proj.appliedFallbackText) {
        resolvedFindingIds.add(findingId);
        redlineFindingProjections.set(findingId, {
          appliedFallbackText: proj.appliedFallbackText,
        });
      }
    }
  }

  // Build note entries
  const noteEntries: Array<{
    findingId: string;
    text: string;
    riskLevel?: string;
    isSummary?: boolean;
  }> = [];

  if (findingProjections) {
    for (const [findingId, proj] of findingProjections) {
      if (proj.notes) {
        for (const note of proj.notes) {
          noteEntries.push({ findingId, text: note });
        }
      }
      if (proj.aiSummary) {
        noteEntries.push({ findingId, text: proj.aiSummary, isSummary: true });
      }
    }
  }

  return (
    <>
      {/* Layer 1: Risk highlights (skip resolved findings) */}
      <RiskHighlightOverlay
        pageIndex={pageIndex}
        findingMappings={findingMappings}
        scale={scale}
        resolvedFindingIds={resolvedFindingIds}
      />

      {/* Layer 2: Redline overlays for applied fallbacks */}
      {redlineFindingProjections.size > 0 && (
        <RedlineOverlay
          pageIndex={pageIndex}
          findingMappings={findingMappings}
          findingProjections={redlineFindingProjections}
          scale={scale}
        />
      )}

      {/* Layer 3: Note annotations */}
      {noteEntries.length > 0 && pageWidth && (
        <NoteOverlay
          pageIndex={pageIndex}
          findingMappings={findingMappings}
          notes={noteEntries}
          scale={scale}
          pageWidth={pageWidth}
        />
      )}
    </>
  );
}
