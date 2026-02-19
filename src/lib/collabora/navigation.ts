/**
 * Collabora Clause Navigation Utility
 * Feature 010 T016: Clause text → search string resolution
 *
 * Converts clause data into search strings suitable for Collabora's
 * .uno:ExecuteSearch command via postMessage.
 */

import type { ClauseNavigationData } from "@/types/collabora";

// ─── Configuration ───────────────────────────────────────────────────────────

/** Default snippet length for search (first N characters of clause text) */
const DEFAULT_SNIPPET_LENGTH = 70;

/** Minimum snippet length for progressive fallback */
const MIN_SNIPPET_LENGTH = 30;

/** Extended snippet length for disambiguation */
const EXTENDED_SNIPPET_LENGTH = 140;

// ─── Search String Extraction ────────────────────────────────────────────────

/**
 * Clean text for search: normalize whitespace, Unicode, and typography characters
 * that may differ between stored clause text and DOCX content.
 *
 * Normalizations applied (T005):
 *  1. Unicode NFC normalization — ensures consistent code-point representation
 *  2. En-dash / em-dash → ASCII hyphen (common typography substitution in DOCX)
 *  3. Smart quotes → straight equivalents (Word/LibreOffice autocorrects these)
 *  4. Zero-width character removal
 *  5. Whitespace normalization (newlines → spaces, multiple spaces → single)
 */
function cleanSearchText(text: string): string {
  return text
    .normalize('NFC') // Unicode NFC normalization
    .replace(/[\u2013\u2014]/g, '-') // En-dash / em-dash → hyphen
    .replace(/[\u201C\u201D]/g, '"') // Smart double quotes → straight "
    .replace(/[\u2018\u2019]/g, "'") // Smart single quotes → straight '
    .replace(/[\r\n]+/g, " ") // Collapse newlines to spaces
    .replace(/\s+/g, " ") // Normalize whitespace
    .replace(/[\u200B-\u200D\uFEFF]/g, "") // Remove zero-width chars
    .trim();
}

/**
 * Extract the first sentence from text (up to the first period followed by a space).
 * Falls back to the first N characters if no sentence boundary found.
 *
 * Also handles parenthesized content that may span line breaks in the document:
 * if the text before the first `(` is long enough (≥ MIN_SNIPPET_LENGTH), we
 * truncate there to avoid search mismatches caused by in-document line wrapping.
 */
function extractFirstSentence(text: string, maxLength: number = DEFAULT_SNIPPET_LENGTH): string {
  const cleaned = cleanSearchText(text);
  const sentenceEnd = cleaned.indexOf(". ");
  if (sentenceEnd > 0 && sentenceEnd < maxLength) {
    return cleaned.substring(0, sentenceEnd + 1);
  }

  // Parenthesized content can span line breaks in the document, making the
  // flat (newlines→spaces) search string unmatchable. Prefer truncating
  // before the first `(` when the prefix is long enough to be unique.
  const parenIdx = cleaned.indexOf("(");
  if (parenIdx >= MIN_SNIPPET_LENGTH) {
    return cleaned.substring(0, parenIdx).trim();
  }

  // No sentence boundary — take first N characters, break at word boundary
  if (cleaned.length <= maxLength) return cleaned;
  const truncated = cleaned.substring(0, maxLength);
  const lastSpace = truncated.lastIndexOf(" ");
  return lastSpace > MIN_SNIPPET_LENGTH ? truncated.substring(0, lastSpace) : truncated;
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Compute the primary search string for a clause.
 * Returns a cleaned snippet of the clause text suitable for Collabora search.
 *
 * For formatVersion=2 contracts where clauseText is empty, falls back to:
 *  1. The first non-empty finding excerpt (verbatim text from the document)
 *  2. The clause name / heading (e.g. "General Provisions")
 */
export function getClauseSearchString(clause: ClauseNavigationData): string {
  const text = clause.clauseText;

  // ── Happy path: clauseText is available (formatVersion=1) ──────────
  if (text) {
    // Try prepending clause name/number if it exists and is short enough
    // This helps disambiguate clauses with similar body text
    if (clause.clauseName && clause.clauseName.length < 40) {
      const nameInText = cleanSearchText(text).startsWith(cleanSearchText(clause.clauseName));
      if (nameInText) {
        // Clause name is already at the start — use it as part of the snippet
        return extractFirstSentence(text, DEFAULT_SNIPPET_LENGTH);
      }
    }
    return extractFirstSentence(text, DEFAULT_SNIPPET_LENGTH);
  }

  // ── Fallback for formatVersion=2: clauseText is empty ──────────────

  // 1. Try the first non-empty finding excerpt (exact text from the DOCX)
  if (clause.findingExcerpts?.length) {
    for (const excerpt of clause.findingExcerpts) {
      const cleaned = cleanSearchText(excerpt);
      if (cleaned.length > 0) {
        return extractFirstSentence(cleaned, DEFAULT_SNIPPET_LENGTH);
      }
    }
  }

  // 2. Last resort: search for the clause heading name
  if (clause.clauseName) {
    return cleanSearchText(clause.clauseName);
  }

  return "";
}

/**
 * Generate progressive fallback search strings for a clause.
 * Returns an array of search strings, from most specific to least specific.
 * Used when the primary search fails to find a match.
 */
export function getClauseFallbackSearchStrings(clause: ClauseNavigationData): string[] {
  const fallbacks: string[] = [];
  const text = clause.clauseText;

  if (text) {
    // ── formatVersion=1: full clause text available ────────────────────
    const cleaned = cleanSearchText(text);

    // 1. Extended snippet (more unique)
    if (cleaned.length > EXTENDED_SNIPPET_LENGTH) {
      fallbacks.push(extractFirstSentence(text, EXTENDED_SNIPPET_LENGTH));
    }

    // 2. First sentence only
    const firstSentence = extractFirstSentence(text, DEFAULT_SNIPPET_LENGTH);
    if (firstSentence !== cleaned.substring(0, DEFAULT_SNIPPET_LENGTH)) {
      fallbacks.push(firstSentence);
    }

    // 3. Shorter snippet (more likely to match if formatting differences exist)
    if (cleaned.length > MIN_SNIPPET_LENGTH) {
      const shortSnippet = extractFirstSentence(text, MIN_SNIPPET_LENGTH);
      fallbacks.push(shortSnippet);
    }
  } else if (clause.findingExcerpts?.length) {
    // ── formatVersion=2: use finding excerpts as alternative search targets ─
    for (const excerpt of clause.findingExcerpts) {
      const cleaned = cleanSearchText(excerpt);
      if (cleaned.length > 0) {
        fallbacks.push(extractFirstSentence(cleaned, DEFAULT_SNIPPET_LENGTH));
      }
    }
  }

  // Always add clause name as last resort
  if (clause.clauseName) {
    fallbacks.push(cleanSearchText(clause.clauseName));
  }

  return fallbacks;
}

/**
 * Determine the occurrence index for a clause when the same text appears
 * multiple times in the document. Uses the clause's position field
 * relative to other clauses with similar text.
 *
 * @param targetClause The clause to navigate to
 * @param allClauses All clauses in the document
 * @returns The 1-based occurrence index (1 = first occurrence, 2 = second, etc.)
 */
export function getClauseOccurrenceIndex(
  targetClause: ClauseNavigationData,
  allClauses: ClauseNavigationData[]
): number {
  const searchString = getClauseSearchString(targetClause);
  if (!searchString) return 1;

  // Find all clauses that would produce the same search string
  const sameTextClauses = allClauses
    .filter((c) => getClauseSearchString(c) === searchString)
    .sort((a, b) => a.position - b.position);

  // Find our clause's index in this group
  const index = sameTextClauses.findIndex((c) => c.id === targetClause.id);
  return index >= 0 ? index + 1 : 1;
}
