'use client';

/**
 * Tracked Changes Component
 * Feature 006: Clause Decision Actions & Undo System
 * 
 * Renders text with tracked changes (insertions/deletions) using HTML <del> and <ins> tags.
 * Displays visual diff between original and modified text.
 */

import { TrackedChange } from '@/types/decisions';
import { cn } from '@/lib/utils';

interface TrackedChangesProps {
  changes: TrackedChange[];
  className?: string;
}

/**
 * T034: Render tracked changes with <del> and <ins> tags
 * T035: CSS styling for tracked changes
 */
export function TrackedChangesDisplay({ changes, className }: TrackedChangesProps) {
  if (changes.length === 0) {
    return null;
  }

  return (
    <div className={cn('tracked-changes-container text-sm leading-7', className)}>
      {changes.map((change, index) => {
        if (change.type === 'delete') {
          return (
            <del
              key={index}
              className="tracked-delete bg-red-50 text-red-700 line-through decoration-red-500 decoration-2 px-1 rounded"
              title="Deleted text"
            >
              {change.text}
            </del>
          );
        } else if (change.type === 'insert') {
          return (
            <ins
              key={index}
              className="tracked-insert bg-green-50 text-green-700 no-underline border-b-2 border-green-500 px-1 rounded font-medium"
              title="Inserted text"
            >
              {change.text}
            </ins>
          );
        } else {
          // Equal text - no styling
          return (
            <span key={index} className="text-foreground/90">
              {change.text}
            </span>
          );
        }
      })}
    </div>
  );
}

/**
 * Compact version: Shows summary of changes instead of full text
 * Useful for clause lists or previews
 */
export function TrackedChangesSummary({ changes }: TrackedChangesProps) {
  const insertCount = changes.filter((c) => c.type === 'insert').length;
  const deleteCount = changes.filter((c) => c.type === 'delete').length;

  if (insertCount === 0 && deleteCount === 0) {
    return <span className="text-xs text-muted-foreground">No changes</span>;
  }

  return (
    <div className="flex items-center gap-2 text-xs">
      {deleteCount > 0 && (
        <span className="inline-flex items-center gap-1 text-red-600">
          <span className="font-medium">{deleteCount}</span>
          <span>deletion{deleteCount > 1 ? 's' : ''}</span>
        </span>
      )}
      {insertCount > 0 && (
        <span className="inline-flex items-center gap-1 text-green-600">
          <span className="font-medium">{insertCount}</span>
          <span>insertion{insertCount > 1 ? 's' : ''}</span>
        </span>
      )}
    </div>
  );
}

/**
 * Helper: Check if tracked changes contain any modifications
 */
export function hasModifications(changes: TrackedChange[]): boolean {
  return changes.some((c) => c.type !== 'equal');
}
