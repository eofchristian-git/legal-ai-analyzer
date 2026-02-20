'use client';

/**
 * Risk Highlight Overlay — Feature 012 (T012)
 * Renders colored semi-transparent rectangles over finding locations on a PDF page.
 * Colors: RED = #FF0000, YELLOW = #FFD700, GREEN = #008000 (all at 18% opacity).
 */

import type { FindingPdfMapping } from '@/types/pdf-viewer';

const RISK_COLORS: Record<string, string> = {
  RED: 'rgba(239, 68, 68, 0.18)',
  YELLOW: 'rgba(234, 179, 8, 0.22)',
  GREEN: 'rgba(34, 197, 94, 0.18)',
};

const RISK_BORDER_COLORS: Record<string, string> = {
  RED: 'rgba(239, 68, 68, 0.5)',
  YELLOW: 'rgba(234, 179, 8, 0.5)',
  GREEN: 'rgba(34, 197, 94, 0.5)',
};

interface RiskHighlightOverlayProps {
  pageIndex: number;
  findingMappings: FindingPdfMapping[];
  scale: number;
  /** Optional: set of finding IDs that have been resolved/fallback-applied (won't show highlight) */
  resolvedFindingIds?: Set<string>;
}

export function RiskHighlightOverlay({
  pageIndex,
  findingMappings,
  scale,
  resolvedFindingIds,
}: RiskHighlightOverlayProps) {
  const pageMappings = findingMappings.filter(
    (m) => m.pageIndex === pageIndex && !m.unmapped
  );

  if (pageMappings.length === 0) return null;

  return (
    <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 1 }}>
      {pageMappings.map((mapping) => {
        // Skip findings that have been resolved (shown by redline overlay instead)
        if (resolvedFindingIds?.has(mapping.findingId)) return null;

        const bg = RISK_COLORS[mapping.riskLevel] ?? RISK_COLORS.YELLOW;
        const border = RISK_BORDER_COLORS[mapping.riskLevel] ?? RISK_BORDER_COLORS.YELLOW;

        return mapping.rects.map((rect, i) => (
          <div
            key={`${mapping.findingId}-${i}`}
            style={{
              position: 'absolute',
              left: rect.x * scale,
              top: rect.y * scale,
              width: rect.width * scale,
              height: rect.height * scale,
              backgroundColor: bg,
              border: `1px solid ${border}`,
              borderRadius: 2,
            }}
            title={`${mapping.riskLevel} risk finding`}
          />
        ));
      })}
    </div>
  );
}
