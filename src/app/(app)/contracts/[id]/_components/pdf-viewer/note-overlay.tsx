'use client';

/**
 * Note Overlay — Feature 012 (T032)
 * Renders margin annotation boxes aligned with clause/finding positions.
 * Shows: note icon + truncated text. Click to expand.
 */

import { useState } from 'react';
import type { FindingPdfMapping } from '@/types/pdf-viewer';

interface NoteEntry {
  findingId: string;
  text: string;
  riskLevel?: string;
  isSummary?: boolean;
}

interface NoteOverlayProps {
  pageIndex: number;
  findingMappings: FindingPdfMapping[];
  notes: NoteEntry[];
  scale: number;
  pageWidth: number;
}

export function NoteOverlay({
  pageIndex,
  findingMappings,
  notes,
  scale,
  pageWidth,
}: NoteOverlayProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // Only show notes for findings on this page
  const pageMappings = findingMappings.filter(
    (m) => m.pageIndex === pageIndex && !m.unmapped
  );

  const visible: Array<{ findingId: string; y: number; entries: NoteEntry[] }> = [];
  for (const mapping of pageMappings) {
    const findingNotes = notes.filter((n) => n.findingId === mapping.findingId);
    if (findingNotes.length === 0) continue;
    const y = mapping.rects[0]?.y ?? 0;
    visible.push({ findingId: mapping.findingId, y, entries: findingNotes });
  }

  if (visible.length === 0) return null;

  // Sort by y position to avoid overlap
  visible.sort((a, b) => a.y - b.y);

  const marginLeft = (pageWidth + 8) * scale;

  return (
    <div className="absolute top-0 pointer-events-none" style={{ left: marginLeft, zIndex: 4 }}>
      {visible.map((group) => {
        const isExpanded = expanded.has(group.findingId);
        const firstEntry = group.entries[0];
        const toggleExpand = () => {
          setExpanded((prev) => {
            const next = new Set(prev);
            if (next.has(group.findingId)) next.delete(group.findingId);
            else next.add(group.findingId);
            return next;
          });
        };

        return (
          <div
            key={group.findingId}
            style={{
              position: 'absolute',
              top: group.y * scale,
              width: 180,
              backgroundColor: 'rgba(255, 251, 235, 0.97)',
              border: '1px solid rgba(234, 179, 8, 0.5)',
              borderRadius: 4,
              padding: '4px 6px',
              fontSize: 10,
              color: '#78350f',
              pointerEvents: 'auto',
              cursor: 'pointer',
              boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
            }}
            onClick={toggleExpand}
          >
            <div style={{ fontWeight: 600, marginBottom: 2 }}>
              📝 {group.entries.length > 1 ? `${group.entries.length} notes` : 'Note'}
            </div>
            <div
              style={{
                overflow: 'hidden',
                maxHeight: isExpanded ? 200 : 36,
                transition: 'max-height 0.15s',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}
            >
              {isExpanded
                ? group.entries.map((e, i) => (
                    <div key={i} style={{ marginBottom: 4 }}>
                      {e.isSummary && (
                        <span style={{ opacity: 0.6, fontSize: 9 }}>AI: </span>
                      )}
                      {e.text}
                    </div>
                  ))
                : firstEntry.text.slice(0, 60) + (firstEntry.text.length > 60 ? '…' : '')}
            </div>
          </div>
        );
      })}
    </div>
  );
}
