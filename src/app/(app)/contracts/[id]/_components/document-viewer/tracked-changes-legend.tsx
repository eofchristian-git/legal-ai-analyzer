'use client';

/** @deprecated Feature 008 — Tracked Changes Legend (DEPRECATED). Replaced by Feature 009 ONLYOFFICE native tracked changes. */
// Feature 008: Interactive Document Viewer & Redline Export
// Legend for tracked changes display (T030, T035)

import React from 'react';

export function TrackedChangesLegend() {
  return (
    <div className="flex items-center gap-4 px-3 py-1.5 bg-blue-50 border-b border-blue-100 text-xs">
      <span className="font-medium text-blue-700">Tracked Changes:</span>
      <div className="flex items-center gap-1.5">
        <span className="px-1.5 py-0.5 bg-red-50 text-red-700 line-through decoration-red-500 decoration-2 rounded text-[11px]">
          deleted text
        </span>
        <span className="text-muted-foreground text-[11px]">= removed</span>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="px-1.5 py-0.5 bg-green-50 text-green-700 border-b-2 border-green-500 rounded text-[11px]">
          inserted text
        </span>
        <span className="text-muted-foreground text-[11px]">= added</span>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="px-1.5 py-0.5 bg-white border border-blue-200 text-blue-700 rounded text-[10px]">
          -N +N
        </span>
        <span className="text-muted-foreground text-[11px]">= click badge to see diff</span>
      </div>
    </div>
  );
}
