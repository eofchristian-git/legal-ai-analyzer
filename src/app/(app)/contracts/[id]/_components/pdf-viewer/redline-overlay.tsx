'use client';

/**
 * Redline Overlay — Feature 012 (T021)
 * For findings with an applied APPLY_FALLBACK decision:
 *  - Renders a red strikethrough line over the original text rects
 *  - Renders a green-bordered annotation box below/beside with the replacement text
 */

import type { FindingPdfMapping } from '@/types/pdf-viewer';
import type { ProjectionResult } from '@/types/decisions';

interface RedlineOverlayProps {
  pageIndex: number;
  findingMappings: FindingPdfMapping[];
  /** Map from findingId → projection for that clause */
  findingProjections: Map<string, { appliedFallbackText?: string }>;
  scale: number;
}

export function RedlineOverlay({
  pageIndex,
  findingMappings,
  findingProjections,
  scale,
}: RedlineOverlayProps) {
  const relevantMappings = findingMappings.filter(
    (m) =>
      m.pageIndex === pageIndex &&
      !m.unmapped &&
      findingProjections.has(m.findingId)
  );

  if (relevantMappings.length === 0) return null;

  return (
    <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 2 }}>
      {relevantMappings.map((mapping) => {
        const proj = findingProjections.get(mapping.findingId);
        if (!proj?.appliedFallbackText) return null;

        // Last rect in the sequence — anchor annotation below it
        const lastRect = mapping.rects[mapping.rects.length - 1];
        if (!lastRect) return null;

        return (
          <div key={mapping.findingId}>
            {/* Strikethrough lines over each rect */}
            {mapping.rects.map((rect, i) => (
              <div
                key={i}
                style={{
                  position: 'absolute',
                  left: rect.x * scale,
                  top: (rect.y + rect.height / 2) * scale - 1,
                  width: rect.width * scale,
                  height: 2,
                  backgroundColor: 'rgba(239, 68, 68, 0.9)',
                }}
              />
            ))}
            {/* Replacement text annotation */}
            <div
              style={{
                position: 'absolute',
                left: lastRect.x * scale,
                top: (lastRect.y + lastRect.height + 4) * scale,
                maxWidth: 300,
                backgroundColor: 'rgba(240, 253, 244, 0.97)',
                border: '1.5px solid rgba(34, 197, 94, 0.7)',
                borderRadius: 4,
                padding: '3px 6px',
                fontSize: 10,
                color: '#166534',
                zIndex: 3,
                pointerEvents: 'auto',
                cursor: 'default',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                maxHeight: 80,
                overflow: 'hidden',
              }}
              title={proj.appliedFallbackText}
            >
              <span style={{ fontWeight: 600, marginRight: 4 }}>↳</span>
              {proj.appliedFallbackText.slice(0, 150)}
              {proj.appliedFallbackText.length > 150 && '…'}
            </div>
          </div>
        );
      })}
    </div>
  );
}
