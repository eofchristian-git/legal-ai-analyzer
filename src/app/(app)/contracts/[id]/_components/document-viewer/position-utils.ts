// Feature 008: Interactive Document Viewer & Redline Export
// Position calculation utilities for document viewer

import type { ClausePosition, FindingPosition } from '@/types/document-viewer';

/**
 * Calculate the page number for a given scroll offset
 */
export function calculatePageFromScroll(
  scrollOffset: number,
  pageHeight: number
): number {
  return Math.floor(scrollOffset / pageHeight) + 1;
}

/**
 * Calculate scroll offset for a given page number
 */
export function calculateScrollFromPage(
  pageNum: number,
  pageHeight: number
): number {
  return (pageNum - 1) * pageHeight;
}

/**
 * Find the clause that contains a given vertical position
 */
export function findClauseAtPosition(
  positions: ClausePosition[],
  pageNum: number,
  y: number
): ClausePosition | null {
  return positions.find(
    (pos) =>
      pos.page === pageNum &&
      y >= pos.y &&
      y <= pos.y + pos.height
  ) || null;
}

/**
 * Find all findings within a clause
 */
export function findFindingsForClause(
  findingPositions: FindingPosition[],
  clauseId: string
): FindingPosition[] {
  return findingPositions.filter((f) => f.clauseId === clauseId);
}

/**
 * Calculate bounding box that contains all findings in a clause
 */
export function calculateClauseBounds(
  clausePosition: ClausePosition,
  findingPositions: FindingPosition[]
): { x: number; y: number; width: number; height: number; page: number } {
  const clauseFindings = findingPositions.filter(
    (f) => f.clauseId === clausePosition.clauseId
  );

  if (clauseFindings.length === 0) {
    return {
      x: clausePosition.x,
      y: clausePosition.y,
      width: clausePosition.width,
      height: clausePosition.height,
      page: clausePosition.page,
    };
  }

  // Calculate bounding box
  const minX = Math.min(
    clausePosition.x,
    ...clauseFindings.map((f) => f.x)
  );
  const minY = Math.min(
    clausePosition.y,
    ...clauseFindings.map((f) => f.y)
  );
  const maxX = Math.max(
    clausePosition.x + clausePosition.width,
    ...clauseFindings.map((f) => f.x + f.width)
  );
  const maxY = Math.max(
    clausePosition.y + clausePosition.height,
    ...clauseFindings.map((f) => f.y + f.height)
  );

  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
    page: clausePosition.page,
  };
}

/**
 * Check if two positions overlap
 */
export function positionsOverlap(
  pos1: { x: number; y: number; width: number; height: number },
  pos2: { x: number; y: number; width: number; height: number }
): boolean {
  return !(
    pos1.x + pos1.width < pos2.x ||
    pos2.x + pos2.width < pos1.x ||
    pos1.y + pos1.height < pos2.y ||
    pos2.y + pos2.height < pos1.y
  );
}

/**
 * Group overlapping findings together
 */
export function groupOverlappingFindings(
  findingPositions: FindingPosition[]
): FindingPosition[][] {
  const groups: FindingPosition[][] = [];
  const assigned = new Set<string>();

  for (const finding of findingPositions) {
    if (assigned.has(finding.findingId)) continue;

    const group = [finding];
    assigned.add(finding.findingId);

    // Find all overlapping findings
    for (const other of findingPositions) {
      if (assigned.has(other.findingId)) continue;
      if (finding.page !== other.page) continue;

      if (positionsOverlap(finding, other)) {
        group.push(other);
        assigned.add(other.findingId);
      }
    }

    groups.push(group);
  }

  return groups;
}

/**
 * Calculate the center point of a position
 */
export function calculateCenter(pos: {
  x: number;
  y: number;
  width: number;
  height: number;
}): { x: number; y: number } {
  return {
    x: pos.x + pos.width / 2,
    y: pos.y + pos.height / 2,
  };
}

/**
 * Calculate distance between two positions (center to center)
 */
export function calculateDistance(
  pos1: { x: number; y: number; width: number; height: number },
  pos2: { x: number; y: number; width: number; height: number }
): number {
  const center1 = calculateCenter(pos1);
  const center2 = calculateCenter(pos2);

  const dx = center2.x - center1.x;
  const dy = center2.y - center1.y;

  return Math.sqrt(dx * dx + dy * dy);
}
