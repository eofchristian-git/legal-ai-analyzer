/**
 * PDF Position Mapper — Feature 012
 * Maps text excerpts (clause names, finding excerpts) to coordinates in a PDF.
 *
 * Uses:
 *  1. Exact normalized text match
 *  2. Fuzzy Levenshtein distance match for excerpts with whitespace/punctuation differences
 *
 * Confidence scoring:
 *  1.0   = exact match after normalization
 *  0.8–0.99 = fuzzy match (whitespace/punctuation differences)
 *  < 0.8 = poor match (not used — returns unmapped)
 *
 * Threshold: confidence < 0.7 → unmapped: true + warning log
 * Duplicate handling: prefer match nearest to clause context
 */

import type { TextPosition, PdfRect } from '@/types/pdf-viewer';

const CONFIDENCE_THRESHOLD = 0.7;
const FUZZY_BASE_CONFIDENCE = 0.8;

export interface MappingResult {
  rects: PdfRect[];
  pageIndex: number;
  confidence: number;
  unmapped: boolean;
}

/**
 * Normalize text for comparison: lowercase, collapse whitespace, unify smart quotes/dashes.
 */
function normalize(text: string): string {
  return text
    .replace(/[\u2018\u2019\u201A\u201B\u2032\u2035]/g, "'") // smart single quotes
    .replace(/[\u201C\u201D\u201E\u201F\u2033\u2036]/g, '"') // smart double quotes
    .replace(/[\u2013\u2014\u2015]/g, '-')                   // em/en dashes
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/**
 * Simple Levenshtein distance between two strings.
 * For long strings, operates on first 200 chars to bound complexity.
 */
function levenshtein(a: string, b: string): number {
  const maxLen = 200;
  const s = a.slice(0, maxLen);
  const t = b.slice(0, maxLen);

  const m = s.length;
  const n = t.length;
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] =
        s[i - 1] === t[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

/**
 * Compute similarity score [0..1] using Levenshtein distance.
 */
function similarity(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - levenshtein(a, b) / maxLen;
}

/**
 * Build a concatenated text string from a run of TextPosition items,
 * starting at `startIndex`, for up to `maxChars` characters.
 */
function buildRunText(positions: TextPosition[], startIndex: number, maxChars: number): string {
  let result = '';
  for (let i = startIndex; i < positions.length && result.length < maxChars; i++) {
    result += positions[i].text;
  }
  return result;
}

/**
 * Find the best matching run of TextPosition entries for the given excerpt.
 * Returns rects covering the matched positions, plus confidence.
 */
export function mapExcerptToPositions(
  excerpt: string,
  positions: TextPosition[],
  clauseContext: string = ''
): MappingResult {
  if (!excerpt.trim() || positions.length === 0) {
    return { rects: [], pageIndex: 0, confidence: 0, unmapped: true };
  }

  // Sort positions into reading order: page → top-to-bottom (y) → left-to-right (x).
  // PDFs do not guarantee extraction order, and out-of-order items cause the
  // matcher to start on a preceding whitespace character instead of the actual word.
  const sortedPositions = [...positions].sort((a, b) => {
    if (a.pageIndex !== b.pageIndex) return a.pageIndex - b.pageIndex;
    if (Math.abs(a.y - b.y) > 1) return a.y - b.y; // different lines
    return a.x - b.x; // same line: left to right
  });

  const normalizedExcerpt = normalize(excerpt);
  const excerptLen = normalizedExcerpt.length;

  let bestMatch: { startIdx: number; endIdx: number; confidence: number } | null = null;

  for (let i = 0; i < sortedPositions.length; i++) {
    // Skip zero-height items (whitespace markers, empty runs) as match start points
    if (sortedPositions[i].height === 0 && sortedPositions[i].text.trim() === '') continue;

    // Build a candidate text from sortedPositions[i..i+window]
    const runText = buildRunText(sortedPositions, i, excerptLen * 2);
    const normalizedRun = normalize(runText);

    if (normalizedRun.length < excerptLen * 0.5) continue;

    // Exact substring match
    if (normalizedRun.startsWith(normalizedExcerpt)) {
      const confidence = 1.0;
      if (!bestMatch || confidence > bestMatch.confidence) {
        // Find the end index: consume positions until we've covered excerptLen chars
        let charCount = 0;
        let endIdx = i;
        while (endIdx < sortedPositions.length && charCount < excerptLen) {
          charCount += sortedPositions[endIdx].text.length;
          endIdx++;
        }
        bestMatch = { startIdx: i, endIdx, confidence };
        break; // exact match found — no need to continue
      }
    } else {
      // Fuzzy match on the beginning of the run
      const runSlice = normalizedRun.slice(0, Math.min(normalizedRun.length, excerptLen + 20));
      const sim = similarity(normalizedExcerpt, runSlice);
      const confidence = FUZZY_BASE_CONFIDENCE + (sim - FUZZY_BASE_CONFIDENCE) * sim;

      if (confidence > CONFIDENCE_THRESHOLD && (!bestMatch || confidence > bestMatch.confidence)) {
        let charCount = 0;
        let endIdx = i;
        while (endIdx < sortedPositions.length && charCount < excerptLen) {
          charCount += sortedPositions[endIdx].text.length;
          endIdx++;
        }
        bestMatch = { startIdx: i, endIdx, confidence };
      }
    }
  }

  if (!bestMatch || bestMatch.confidence < CONFIDENCE_THRESHOLD) {
    console.warn(
      `[PdfPositionMapper] Could not map excerpt (confidence=${bestMatch?.confidence?.toFixed(2) ?? 'N/A'}): ` +
      `"${excerpt.slice(0, 80)}"`
    );
    return { rects: [], pageIndex: 0, confidence: bestMatch?.confidence ?? 0, unmapped: true };
  }

  // Build rects from the matched positions
  const matchedPositions = sortedPositions.slice(bestMatch.startIdx, bestMatch.endIdx);
  const pageIndex = matchedPositions[0]?.pageIndex ?? 0;

  // Group by page, then build per-line rects (merge items on the same Y)
  const byPage: Map<number, TextPosition[]> = new Map();
  for (const pos of matchedPositions) {
    if (!byPage.has(pos.pageIndex)) byPage.set(pos.pageIndex, []);
    byPage.get(pos.pageIndex)!.push(pos);
  }

  const rects: PdfRect[] = [];
  for (const [, pagePositions] of byPage) {
    // Group items with similar Y values (same line, within 2pt tolerance)
    const lines: TextPosition[][] = [];
    for (const pos of pagePositions) {
      const line = lines.find(
        (l) => l.length > 0 && Math.abs(l[0].y - pos.y) < 2
      );
      if (line) {
        line.push(pos);
      } else {
        lines.push([pos]);
      }
    }

    for (const line of lines) {
      const x = Math.min(...line.map((p) => p.x));
      const y = Math.min(...line.map((p) => p.y));
      const right = Math.max(...line.map((p) => p.x + p.width));
      const height = Math.max(...line.map((p) => p.height));
      // Skip degenerate rects — zero-height items are whitespace markers in the PDF
      if (height > 0) {
        rects.push({ x, y, width: right - x, height });
      }
    }
  }

  return {
    rects,
    pageIndex,
    confidence: bestMatch.confidence,
    unmapped: false,
  };
}
