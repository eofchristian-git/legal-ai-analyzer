/**
 * ONLYOFFICE Comment Injector Utility
 * Feature 009 T018: Inject AI-generated findings as positioned comments
 * with risk-level color coding and text search positioning
 */

import type { FindingCommentData, CommentInjectionResult } from '@/types/onlyoffice';
import type { OOConnector } from '@/app/(app)/contracts/[id]/_components/onlyoffice-viewer/onlyoffice-document-viewer';

// ─── Risk Level Labels ────────────────────────────────────────────────────────

export const RISK_LABELS = {
  RED: '🔴 High Risk',
  YELLOW: '🟡 Medium Risk',
  GREEN: '🟢 Low Risk',
} as const;

// ─── Promise wrapper ──────────────────────────────────────────────────────────

/**
 * Wrap the callback-based ONLYOFFICE executeMethod in a Promise.
 * The real ONLYOFFICE Connector API is: executeMethod(name, args, callback) → void
 * This helper lets callers use async/await.
 */
function execMethod<T = unknown>(
  connector: OOConnector,
  method: string,
  args?: unknown[]
): Promise<T> {
  return new Promise<T>((resolve) => {
    connector.executeMethod(method, args ?? [], (result) => resolve(result as T));
  });
}

// ─── Comment Text Builder ─────────────────────────────────────────────────────

export function buildCommentText(finding: FindingCommentData): string {
  const riskLabel = RISK_LABELS[finding.riskLevel];
  const parts = [
    riskLabel,
    '',
    finding.summary,
    '',
    `Rule: ${finding.matchedRuleTitle}`,
  ];

  if (finding.matchedRuleId) {
    parts.push(`Rule ID: ${finding.matchedRuleId}`);
  }

  return parts.join('\n');
}

// ─── Comment Injection via ONLYOFFICE Connector ───────────────────────────────

/**
 * Inject a single finding as an ONLYOFFICE comment.
 *
 * Strategy:
 * 1. If the finding has an excerpt, call SearchNext to find and select the text.
 *    AddComment then anchors to that selection → inline highlight in the document.
 * 2. If no excerpt or text not found, AddComment without selection (appears in
 *    comments sidebar only, no inline highlight).
 */
async function injectSingleComment(
  connector: OOConnector,
  finding: FindingCommentData
): Promise<CommentInjectionResult> {
  const payload: Record<string, unknown> = {
    // ONLYOFFICE Connector API field names (case-sensitive):
    Id: finding.findingId,              // stable ID for MoveToComment navigation
    Comment: buildCommentText(finding), // "Comment", NOT "Text"
    UserName: 'AI Analysis',
    Time: Date.now().toString(),        // milliseconds since epoch as string
    Solved: false,
    Replies: [],
  };

  let positioned = false;

  // Try to find and select the excerpt text so the comment is anchored inline
  if (finding.excerpt) {
    const searchText = finding.excerpt.substring(0, 100).trim();
    try {
      const found = await execMethod<boolean>(connector, 'SearchNext', [{
        c_sText: searchText,
        c_bMatchCase: false,
        c_bWholeWord: false,
        c_bRegExp: false,
      }]);
      positioned = !!found;
      if (!found) {
        console.debug(`[CommentInjector] Text not found for finding ${finding.findingId}: "${searchText.substring(0, 40)}..."`);
      }
    } catch (err) {
      console.debug(`[CommentInjector] SearchNext failed for finding ${finding.findingId}:`, err);
    }
  }

  // Add the comment at the current selection (or document position if not positioned)
  const assignedId = await execMethod<string>(connector, 'AddComment', [payload]);
  const success = typeof assignedId === 'string' && assignedId.length > 0;

  return {
    findingId: finding.findingId,
    success,
    positioned,
    error: success ? undefined : 'AddComment returned no ID',
  };
}

/**
 * Inject multiple findings as comments.
 * Sequential injection ensures search position advances correctly through the document.
 */
export async function injectFindingsAsComments(
  connector: OOConnector,
  findings: FindingCommentData[]
): Promise<CommentInjectionResult[]> {
  const results: CommentInjectionResult[] = [];

  for (const finding of findings) {
    try {
      const result = await injectSingleComment(connector, finding);
      results.push(result);
    } catch (error) {
      console.error(`[CommentInjector] Failed to inject finding ${finding.findingId}:`, error);
      results.push({
        findingId: finding.findingId,
        success: false,
        positioned: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }

    // Small delay between injections to avoid overwhelming ONLYOFFICE
    await new Promise((resolve) => setTimeout(resolve, 80));
  }

  return results;
}

/**
 * Navigate to a specific comment in the ONLYOFFICE document.
 * Used for sidebar finding click → document scroll.
 */
export async function navigateToComment(
  connector: OOConnector,
  findingId: string
): Promise<void> {
  try {
    await execMethod(connector, 'MoveToComment', [{ sId: findingId }]);
  } catch (error) {
    console.error(`[CommentInjector] Failed to navigate to comment ${findingId}:`, error);
  }
}
