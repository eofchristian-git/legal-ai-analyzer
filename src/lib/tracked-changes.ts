/**
 * Tracked Changes Computation: Text Diff Engine
 * Feature 006: Clause Decision Actions & Undo System
 * 
 * Computes visual tracked changes (insertions/deletions) between two text versions
 * using the diff-match-patch library.
 */

import DiffMatchPatch from 'diff-match-patch';
import { TrackedChange } from '@/types/decisions';

// Initialize diff-match-patch instance
const dmp = new DiffMatchPatch();

// Configure diff settings
dmp.Diff_Timeout = 1.0; // 1 second timeout (prevents hang on very long text)
dmp.Diff_EditCost = 4;   // Balance between semantic and character-level diffs

/**
 * Compute tracked changes between two text versions.
 * 
 * Uses semantic cleanup to produce human-readable diffs (e.g., "word-level" rather than "character-level").
 * 
 * @param originalText - The original/baseline text (can be null)
 * @param newText - The new/modified text (can be null)
 * @returns Array of TrackedChange objects for rendering
 * 
 * @example
 * const changes = computeTrackedChanges(
 *   "The quick brown fox",
 *   "The slow brown fox jumps"
 * );
 * // Returns:
 * // [
 * //   { type: 'equal', text: 'The ' },
 * //   { type: 'delete', text: 'quick' },
 * //   { type: 'insert', text: 'slow' },
 * //   { type: 'equal', text: ' brown fox' },
 * //   { type: 'insert', text: ' jumps' }
 * // ]
 */
export function computeTrackedChanges(
  originalText: string | null,
  newText: string | null
): TrackedChange[] {
  // Handle null cases
  if (!originalText && !newText) {
    return [];
  }
  
  if (!originalText) {
    // All text is inserted
    return [{ type: 'insert', text: newText || '' }];
  }
  
  if (!newText) {
    // All text is deleted
    return [{ type: 'delete', text: originalText }];
  }

  // If texts are identical, return single 'equal' change
  if (originalText === newText) {
    return [{ type: 'equal', text: originalText }];
  }

  // Compute diff
  const diffs = dmp.diff_main(originalText, newText);
  
  // Apply semantic cleanup for better readability
  dmp.diff_cleanupSemantic(diffs);

  // Convert diff-match-patch format to TrackedChange format
  const trackedChanges: TrackedChange[] = diffs.map(([operation, text]) => {
    // diff-match-patch uses: -1 = delete, 0 = equal, 1 = insert
    if (operation === -1) {
      return { type: 'delete', text };
    } else if (operation === 1) {
      return { type: 'insert', text };
    } else {
      return { type: 'equal', text };
    }
  });

  return trackedChanges;
}

/**
 * Apply tracked changes to text (for testing/validation).
 * 
 * Reconstructs the "new text" from tracked changes by:
 * - Including all 'equal' segments
 * - Including all 'insert' segments
 * - Skipping all 'delete' segments
 * 
 * @param changes - Array of TrackedChange objects
 * @returns The reconstructed "new text"
 */
export function applyTrackedChanges(changes: TrackedChange[]): string {
  return changes
    .filter((change) => change.type !== 'delete')
    .map((change) => change.text)
    .join('');
}

/**
 * Get original text from tracked changes (for testing/validation).
 * 
 * Reconstructs the "original text" from tracked changes by:
 * - Including all 'equal' segments
 * - Including all 'delete' segments
 * - Skipping all 'insert' segments
 * 
 * @param changes - Array of TrackedChange objects
 * @returns The reconstructed "original text"
 */
export function getOriginalFromTrackedChanges(changes: TrackedChange[]): string {
  return changes
    .filter((change) => change.type !== 'insert')
    .map((change) => change.text)
    .join('');
}

/**
 * Check if tracked changes contain any modifications (not just equal segments).
 * 
 * @param changes - Array of TrackedChange objects
 * @returns true if there are any insertions or deletions
 */
export function hasTrackedChanges(changes: TrackedChange[]): boolean {
  return changes.some((change) => change.type !== 'equal');
}

/**
 * Count the number of insertions and deletions in tracked changes.
 * 
 * @param changes - Array of TrackedChange objects
 * @returns Object with insert and delete counts
 */
export function countTrackedChanges(changes: TrackedChange[]): {
  insertCount: number;
  deleteCount: number;
  totalChanges: number;
} {
  const insertCount = changes.filter((c) => c.type === 'insert').length;
  const deleteCount = changes.filter((c) => c.type === 'delete').length;
  
  return {
    insertCount,
    deleteCount,
    totalChanges: insertCount + deleteCount,
  };
}
