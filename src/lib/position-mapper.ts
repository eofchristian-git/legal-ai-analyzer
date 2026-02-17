// Feature 008: Interactive Document Viewer & Redline Export
// Position mapping utilities for clauses and findings

import type {
  ClausePosition,
  FindingPosition,
  PositionCalculationOptions,
  PositionCalculationResult,
} from '@/types/document-viewer';

/**
 * Inject data attributes for clauses into HTML
 * This helps identify clause boundaries for position calculation
 */
export function injectClauseMarkers(
  html: string,
  clauses: Array<{ id: string; clauseNumber: string; clauseText?: string | null }>
): string {
  let result = html;
  
  for (const clause of clauses) {
    // Use clause text or clause number for text matching
    const searchText = clause.clauseText || clause.clauseNumber;
    if (!searchText) {
      console.warn(`Could not inject marker for clause ${clause.id}: no text available`);
      continue;
    }
    
    // Find the first occurrence of the clause text
    // Note: This is a simple implementation. Production would need fuzzy matching.
    const position = result.indexOf(searchText.substring(0, 50)); // Match first 50 chars
    if (position === -1) {
      console.warn(`Could not find position for clause ${clause.id}`);
      continue;
    }
    
    // Inject data attribute before the matched text
    const marker = `<span data-clause-id="${clause.id}" data-clause-number="${clause.clauseNumber}">`;
    const closeMarker = '</span>';
    
    // Insert marker at the position
    result = 
      result.substring(0, position) + 
      marker + 
      result.substring(position, position + searchText.length) +
      closeMarker +
      result.substring(position + searchText.length);
  }
  
  return result;
}

/**
 * Calculate positions for all clauses and findings
 * Note: This is a simplified server-side implementation.
 * Production would use puppeteer to render and measure actual positions.
 */
export async function calculatePositions(
  options: PositionCalculationOptions
): Promise<PositionCalculationResult> {
  console.log(`Calculating positions for ${options.clauses.length} clauses and ${options.findings.length} findings`);
  
  // For now, return estimated positions based on text order
  // Production implementation would use puppeteer to render HTML and getBoundingClientRect()
  
  const clausePositions: ClausePosition[] = options.clauses.map((clause, index) => ({
    clauseId: clause.id,
    page: Math.floor(index / 5) + 1, // Rough estimate: 5 clauses per page
    x: 50,
    y: (index % 5) * 200 + 100, // Rough vertical spacing
    width: 700,
    height: 150,
  }));
  
  const findingPositions: FindingPosition[] = await calculateFindingPositions(
    options.html,
    options.findings
  );
  
  return {
    clausePositions,
    findingPositions,
  };
}

/**
 * Calculate positions for findings based on excerpt matching
 */
async function calculateFindingPositions(
  html: string,
  findings: Array<{
    id: string;
    clauseId: string;
    excerpt: string;
    locationPage?: number | null;
    locationPosition?: string | null;
  }>
): Promise<FindingPosition[]> {
  const positions: FindingPosition[] = [];
  
  for (const finding of findings) {
    // Use locationPage from Feature 005 if available
    const page = finding.locationPage || 1;
    
    // Use locationPosition to estimate vertical position
    let y = 100; // Default to top
    if (finding.locationPosition === 'middle') {
      y = 400;
    } else if (finding.locationPosition === 'bottom') {
      y = 700;
    }
    
    // Try to find excerpt in HTML for more precise positioning
    const excerptPos = html.indexOf(finding.excerpt.substring(0, 30));
    if (excerptPos !== -1) {
      // Rough estimate based on character position
      y = (excerptPos % 5000) / 5; // Very rough heuristic
    }
    
    positions.push({
      findingId: finding.id,
      clauseId: finding.clauseId,
      page,
      x: 50,
      y,
      width: 600,
      height: 80,
    });
  }
  
  return positions;
}

/**
 * Calculate position with puppeteer (for production use)
 * This would be called from a background job or API endpoint
 */
export async function calculatePositionsWithBrowser(
  html: string,
  documentId: string
): Promise<PositionCalculationResult> {
  // Note: This requires puppeteer to be installed and configured
  // Implementation would:
  // 1. Launch headless browser
  // 2. Load HTML
  // 3. Query elements with data-clause-id
  // 4. Get getBoundingClientRect() for each
  // 5. Return position data
  
  // For now, throw error indicating this needs implementation
  throw new Error(
    'Browser-based position calculation not yet implemented. ' +
    'Use calculatePositions() for estimated positions.'
  );
}

/**
 * Find text position in HTML using fuzzy matching
 * Returns character offset or -1 if not found
 */
export function findTextPosition(html: string, searchText: string, threshold: number = 0.8): number {
  // Simple implementation: exact substring match
  // Production would use Levenshtein distance or similar for fuzzy matching
  
  const position = html.indexOf(searchText);
  if (position !== -1) return position;
  
  // Try with first 50 characters for partial match
  const partial = searchText.substring(0, 50);
  return html.indexOf(partial);
}
