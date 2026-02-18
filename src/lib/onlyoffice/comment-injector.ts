/**
 * ONLYOFFICE Comment Injector Utility
 * Feature 009 T018: Inject AI-generated findings as positioned comments
 * with risk-level color coding and text search positioning
 */

import type { FindingCommentData, CommentInjectionResult } from '@/types/onlyoffice';

// ─── Risk Level Color Mapping ────────────────────────────────────────────────

export const RISK_COLORS = {
  RED: '#ef4444',
  YELLOW: '#f59e0b',
  GREEN: '#10b981',
} as const;

export const RISK_LABELS = {
  RED: '🔴 High Risk',
  YELLOW: '🟡 Medium Risk',
  GREEN: '🟢 Low Risk',
} as const;

// ─── Comment Text Builder ────────────────────────────────────────────────────

/**
 * Build the display text for a finding comment.
 */
export function buildCommentText(finding: FindingCommentData): string {
  const riskLabel = RISK_LABELS[finding.riskLevel];
  const parts = [
    `${riskLabel}`,
    ``,
    `${finding.summary}`,
    ``,
    `Rule: ${finding.matchedRuleTitle}`,
  ];

  if (finding.matchedRuleId) {
    parts.push(`Rule ID: ${finding.matchedRuleId}`);
  }

  return parts.join('\n');
}

/**
 * Build the custom data payload for a comment (for retrieval/integration).
 */
export function buildCommentData(finding: FindingCommentData): string {
  return JSON.stringify({
    findingId: finding.findingId,
    clauseId: finding.clauseId,
    riskLevel: finding.riskLevel,
    matchedRuleId: finding.matchedRuleId,
    type: 'ai-finding',
  });
}

// ─── Comment Injection via ONLYOFFICE Connector ──────────────────────────────

/**
 * Inject a single finding as an ONLYOFFICE comment via the document connector API.
 * Uses text search to position the comment at the finding excerpt location.
 * Falls back to clause-level positioning if exact match unavailable.
 *
 * @param connector - The ONLYOFFICE document connector instance (window.Asc.plugin.executeMethod)
 * @param finding - The finding data to inject
 */
export function buildCommentPayload(finding: FindingCommentData): Record<string, unknown> {
  // Truncate quote text to 60 chars for ONLYOFFICE search
  const quoteText = finding.excerpt
    ? finding.excerpt.substring(0, 60)
    : '';

  return {
    Text: buildCommentText(finding),
    UserName: 'AI Analysis',
    Time: new Date().toISOString(),
    Solved: false,
    Data: buildCommentData(finding),
    QuoteText: quoteText,
  };
}

/**
 * Inject multiple findings as comments.
 * Batches injections with a small delay to avoid overwhelming ONLYOFFICE.
 */
export async function injectFindingsAsComments(
  connector: { executeMethod: (method: string, args: unknown[]) => Promise<void> },
  findings: FindingCommentData[]
): Promise<CommentInjectionResult[]> {
  const results: CommentInjectionResult[] = [];
  const BATCH_SIZE = 20;
  const BATCH_DELAY_MS = 100;

  for (let i = 0; i < findings.length; i += BATCH_SIZE) {
    const batch = findings.slice(i, i + BATCH_SIZE);

    for (const finding of batch) {
      try {
        const payload = buildCommentPayload(finding);
        await connector.executeMethod('AddComment', [payload]);

        results.push({
          findingId: finding.findingId,
          success: true,
          positioned: !!finding.excerpt,
        });
      } catch (error) {
        console.error(`[CommentInjector] Failed to inject comment for finding ${finding.findingId}:`, error);
        results.push({
          findingId: finding.findingId,
          success: false,
          positioned: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    // Small delay between batches to prevent overwhelming ONLYOFFICE
    if (i + BATCH_SIZE < findings.length) {
      await new Promise((resolve) => setTimeout(resolve, BATCH_DELAY_MS));
    }
  }

  return results;
}

/**
 * Navigate to a specific comment in the ONLYOFFICE document.
 * Used for sidebar finding click → document navigation.
 */
export async function navigateToComment(
  connector: { executeMethod: (method: string, args: unknown[]) => Promise<void> },
  findingId: string
): Promise<void> {
  // ONLYOFFICE doesn't have a direct "go to comment" method,
  // but we can search for the comment's quote text
  try {
    await connector.executeMethod('MoveToComment', [findingId]);
  } catch (error) {
    console.error(`[CommentInjector] Failed to navigate to comment ${findingId}:`, error);
  }
}
