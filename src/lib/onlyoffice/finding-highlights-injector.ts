/**
 * ONLYOFFICE Finding Highlights Injector
 * Marks AI finding excerpts visually in the document using SearchAndReplace
 * with tracked changes. Each finding's excerpt gets a risk-level prefix
 * inserted as a tracked change, making it visible as a colored markup marker.
 *
 * Toggle:
 *   - Show: SetTrackChangesDisplay({ mode: 'markup' }) — colored insertions visible
 *   - Hide: SetTrackChangesDisplay({ mode: 'original' }) — clean document restored
 */

import type { FindingCommentData } from '@/types/onlyoffice';
import type { OOConnector } from '@/app/(app)/contracts/[id]/_components/onlyoffice-viewer/onlyoffice-document-viewer';

// ─── Promise wrapper ──────────────────────────────────────────────────────────

function execMethod<T = unknown>(
  connector: OOConnector,
  method: string,
  args?: unknown[]
): Promise<T> {
  return new Promise<T>((resolve) => {
    connector.executeMethod(method, args ?? [], (result) => resolve(result as T));
  });
}

// ─── Risk Labels ──────────────────────────────────────────────────────────────

// Used as "author" field — ONLYOFFICE assigns a unique color per author,
// so RED/YELLOW/GREEN findings will appear in different colors in markup view.
const RISK_AUTHORS: Record<FindingCommentData['riskLevel'], string> = {
  RED:    '🔴 High Risk',
  YELLOW: '🟡 Medium Risk',
  GREEN:  '🟢 Low Risk',
};

// Short prefix inserted before the excerpt text so the tracked change is visible.
const RISK_PREFIXES: Record<FindingCommentData['riskLevel'], string> = {
  RED:    '[HIGH RISK] ',
  YELLOW: '[MEDIUM RISK] ',
  GREEN:  '[LOW RISK] ',
};

// ─── Text Normalization ───────────────────────────────────────────────────────

/**
 * Normalize excerpt text for use as a search string.
 * Collapses whitespace (newlines, tabs, multiple spaces) to a single space
 * and trims to a manageable length. Shorter = more likely to match the
 * rendered document text exactly.
 */
function normalizeSearchText(text: string, maxLength = 60): string {
  return text
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .substring(0, maxLength);
}

// ─── Result Types ─────────────────────────────────────────────────────────────

export interface HighlightResult {
  findingId: string;
  success: boolean;
  /** true if the excerpt was found and replaced in the document */
  positioned: boolean;
  error?: string;
}

// ─── Single Finding Highlight ─────────────────────────────────────────────────

async function highlightSingleFinding(
  connector: OOConnector,
  finding: FindingCommentData
): Promise<HighlightResult> {
  if (!finding.excerpt?.trim()) {
    return { findingId: finding.findingId, success: true, positioned: false };
  }

  // Try progressively shorter substrings — longer = more precise but less likely to match
  const lengths = [60, 40, 25];

  for (const len of lengths) {
    const searchText = normalizeSearchText(finding.excerpt, len);
    if (!searchText) continue;

    // Verify the text exists before replacing (SearchNext returns true/false)
    let found = false;
    try {
      found = await execMethod<boolean>(connector, 'SearchNext', [{
        c_sText: searchText,
        c_bMatchCase: false,
        c_bWholeWord: false,
        c_bRegExp: false,
      }]);
    } catch {
      // SearchNext failing is non-fatal — try next length
      continue;
    }

    if (!found) {
      console.debug(
        `[FindingHighlights] Not found at ${len} chars for ${finding.findingId}: ` +
        `"${searchText.substring(0, 30)}..."`
      );
      continue;
    }

    // Text found — replace with risk-prefixed version as a tracked change
    const prefix = RISK_PREFIXES[finding.riskLevel];
    const author = RISK_AUTHORS[finding.riskLevel];

    try {
      await execMethod(connector, 'SearchAndReplace', [{
        searchString: searchText,
        replaceString: prefix + searchText,
        matchCase: false,
        trackChanges: true,
        author,
        date: new Date(),
      }]);

      console.debug(
        `[FindingHighlights] Highlighted finding ${finding.findingId} ` +
        `(${finding.riskLevel}) at ${len} chars`
      );
      return { findingId: finding.findingId, success: true, positioned: true };
    } catch (error) {
      console.debug(`[FindingHighlights] SearchAndReplace failed for ${finding.findingId}:`, error);
      return {
        findingId: finding.findingId,
        success: false,
        positioned: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  // All lengths tried — excerpt not found in document
  console.debug(
    `[FindingHighlights] Excerpt not found in document for finding ${finding.findingId}`
  );
  return { findingId: finding.findingId, success: true, positioned: false };
}

// ─── Batch Injection ──────────────────────────────────────────────────────────

export async function injectFindingHighlights(
  connector: OOConnector,
  findings: FindingCommentData[]
): Promise<HighlightResult[]> {
  const results: HighlightResult[] = [];

  const findingsWithExcerpts = findings.filter((f) => !!f.excerpt?.trim());
  if (findingsWithExcerpts.length === 0) return results;

  // Enable track changes mode before injecting
  try {
    await execMethod(connector, 'StartTrackChanges');
    await execMethod(connector, 'SetTrackChangesDisplay', [{ mode: 'markup' }]);
  } catch (error) {
    console.error('[FindingHighlights] Failed to enable track changes:', error);
  }

  for (const finding of findingsWithExcerpts) {
    try {
      const result = await highlightSingleFinding(connector, finding);
      results.push(result);
    } catch (error) {
      results.push({
        findingId: finding.findingId,
        success: false,
        positioned: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }

    // Small delay between injections to avoid overwhelming ONLYOFFICE
    await new Promise((resolve) => setTimeout(resolve, 60));
  }

  return results;
}

// ─── Toggle Helpers ───────────────────────────────────────────────────────────

/** Show highlights: display tracked changes in markup (insertions + deletions visible) */
export async function showFindingHighlights(connector: OOConnector): Promise<void> {
  await execMethod(connector, 'SetTrackChangesDisplay', [{ mode: 'markup' }]);
}

/** Hide highlights: revert to original view (tracked changes hidden, document looks clean) */
export async function hideFindingHighlights(connector: OOConnector): Promise<void> {
  await execMethod(connector, 'SetTrackChangesDisplay', [{ mode: 'original' }]);
}
