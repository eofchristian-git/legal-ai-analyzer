'use client';

/** @deprecated Feature 008 — Tracked Changes Layer (DEPRECATED). Replaced by Feature 009 ONLYOFFICE native tracked changes. */
// Feature 008: Interactive Document Viewer & Redline Export
// Tracked changes overlay layer for showing clause modifications (T029, T033, T034)

import React, { useState } from 'react';
import { cn } from '@/lib/utils';
import type { ClausePosition } from '@/types/document-viewer';
import type { ProjectionResult, TrackedChange } from '@/types/decisions';
import { TrackedChangesDisplay } from '../tracked-changes';

interface TrackedChangesLayerProps {
  clausePositions: ClausePosition[];
  allProjections: Record<string, ProjectionResult>;
}

function formatTimestamp(ts: Date | string | null | undefined): string {
  if (!ts) return '';
  try {
    return new Date(ts).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

function hasActualChanges(changes: TrackedChange[]): boolean {
  return changes.some((c) => c.type !== 'equal');
}

// T033, T034: Tracked changes indicator positioned at clause location
function ClauseChangeIndicator({
  projection,
  position,
}: {
  clauseId?: string;
  projection: ProjectionResult;
  position: ClausePosition;
}) {
  const [expanded, setExpanded] = useState(false);
  const changes = projection.trackedChanges;

  if (!hasActualChanges(changes)) return null;

  const insertCount = changes.filter((c) => c.type === 'insert').length;
  const deleteCount = changes.filter((c) => c.type === 'delete').length;
  const timestamp = projection.lastDecisionTimestamp;

  return (
    <div
      className="absolute pointer-events-auto z-30"
      style={{
        left: `${position.x + position.width + 8}px`,
        top: `${position.y}px`,
        maxWidth: '200px',
      }}
    >
      {/* T034: Change badge with attribution tooltip */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className={cn(
          'flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium border shadow-sm',
          'bg-white hover:bg-gray-50 transition-colors',
          'border-blue-200 text-blue-700'
        )}
        title={`Last changed: ${formatTimestamp(timestamp)}`}
      >
        <span className="text-red-600">-{deleteCount}</span>
        <span className="text-green-600">+{insertCount}</span>
      </button>

      {/* T034: Expanded tracked changes view */}
      {expanded && (
        <div className="mt-1 p-3 bg-white border border-gray-200 rounded-md shadow-lg text-xs max-w-[320px]">
          <div className="flex items-center justify-between mb-2">
            <span className="font-semibold text-gray-700">Tracked Changes</span>
            {timestamp && (
              <span className="text-muted-foreground text-[10px]">
                {formatTimestamp(timestamp)}
              </span>
            )}
          </div>
          <TrackedChangesDisplay changes={changes} />
        </div>
      )}
    </div>
  );
}

export function TrackedChangesLayer({
  clausePositions,
  allProjections,
}: TrackedChangesLayerProps) {
  const clausesWithChanges = clausePositions.filter((pos) => {
    const projection = allProjections[pos.clauseId];
    return projection && hasActualChanges(projection.trackedChanges);
  });

  if (clausesWithChanges.length === 0) {
    return null;
  }

  return (
    <div className="absolute inset-0 pointer-events-none">
      {clausesWithChanges.map((pos) => {
        const projection = allProjections[pos.clauseId];
        if (!projection) return null;

        return (
          <ClauseChangeIndicator
            key={pos.clauseId}
            clauseId={pos.clauseId}
            projection={projection}
            position={pos}
          />
        );
      })}
    </div>
  );
}
