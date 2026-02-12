// === Legacy interfaces (kept for backward compatibility) ===

export interface ClauseAnalysis {
  clauseName: string;
  severity: "GREEN" | "YELLOW" | "RED";
  content: string;
}

export interface ContractAnalysisResult {
  overallRisk: string;
  greenCount: number;
  yellowCount: number;
  redCount: number;
  clauses: ClauseAnalysis[];
  executiveSummary: string;
  negotiationStrategy: string;
  rawAnalysis: string;
}

// === New structured types ===

export interface StructuredFinding {
  riskLevel: "GREEN" | "YELLOW" | "RED";
  matchedRuleTitle: string;
  summary: string;
  fallbackText: string;
  whyTriggered: string;
  excerpt: string;
}

export interface StructuredNegotiationItem {
  priority: string;
  title: string;
  description: string;
  clauseRef: string | null;
}

export interface StructuredClause {
  clauseNumber: string;
  clauseName: string;
  clauseText: string;
  position: number;
  findings: StructuredFinding[];
}

export interface StructuredAnalysisResult {
  executiveSummary: string;
  overallRisk: string;
  clauses: StructuredClause[];
  negotiationStrategy: string;
  negotiationItems: StructuredNegotiationItem[];
  greenCount: number;
  yellowCount: number;
  redCount: number;
  rawAnalysis: string;
}

/**
 * Sanitize a string so that JSON.parse() can handle it.
 *
 * Two problems occur when Claude copies verbatim PDF-extracted text into
 * JSON string values (clauseText, excerpt, etc.):
 *
 * 1. Rare control characters (NULL, form-feed, vertical-tab, …) — always
 *    invalid in JSON. We replace them with spaces everywhere.
 *
 * 2. Literal newlines (\n), carriage returns (\r) and tabs (\t) INSIDE
 *    JSON string values — these are valid *between* properties but illegal
 *    inside a quoted string unless escaped as \\n / \\r / \\t.
 *    We walk the string, track open/close quotes, and escape them only
 *    when inside a quoted value.
 */
function sanitizeJsonString(str: string): string {
  // Pass 1: replace control chars that are never valid anywhere in JSON
  const cleaned = str.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, ' ');

  // Pass 2: escape literal \n, \r, \t that appear inside JSON string values
  let out = '';
  let inString = false;

  for (let i = 0; i < cleaned.length; i++) {
    const ch = cleaned[i];

    // Skip escaped characters inside strings (e.g. \" , \\ , \n that is
    // already properly escaped)
    if (ch === '\\' && inString) {
      out += ch + (cleaned[i + 1] ?? '');
      i++;
      continue;
    }

    if (ch === '"') {
      inString = !inString;
      out += ch;
      continue;
    }

    if (inString) {
      if (ch === '\n') { out += '\\n'; continue; }
      if (ch === '\r') { out += '\\r'; continue; }
      if (ch === '\t') { out += '\\t'; continue; }
    }

    out += ch;
  }

  return out;
}

/**
 * Attempt to repair truncated JSON by closing open brackets/braces.
 * This handles the common case where Claude's response is cut off at max_tokens.
 */
function repairTruncatedJson(json: string): string {
  // Remove any trailing incomplete string (e.g., a string value that was cut mid-way)
  // Find the last complete key-value or array element
  let repaired = json.trimEnd();

  // If the last char is inside a string, try to close it
  // Count unescaped quotes to determine if we're inside a string
  let inString = false;
  let lastGoodIndex = 0;
  for (let i = 0; i < repaired.length; i++) {
    if (repaired[i] === '\\' && inString) {
      i++; // skip escaped char
      continue;
    }
    if (repaired[i] === '"') {
      inString = !inString;
    }
    if (!inString) {
      lastGoodIndex = i;
    }
  }

  // If we ended inside a string, close it and trim back
  if (inString) {
    repaired = repaired.substring(0, lastGoodIndex + 1);
  }

  // Remove trailing comma if present
  repaired = repaired.replace(/,\s*$/, '');

  // Count open/close brackets and braces
  let openBraces = 0;
  let openBrackets = 0;
  inString = false;

  for (let i = 0; i < repaired.length; i++) {
    if (repaired[i] === '\\' && inString) {
      i++;
      continue;
    }
    if (repaired[i] === '"') {
      inString = !inString;
      continue;
    }
    if (!inString) {
      if (repaired[i] === '{') openBraces++;
      else if (repaired[i] === '}') openBraces--;
      else if (repaired[i] === '[') openBrackets++;
      else if (repaired[i] === ']') openBrackets--;
    }
  }

  // Close any remaining open brackets/braces
  for (let i = 0; i < openBrackets; i++) repaired += ']';
  for (let i = 0; i < openBraces; i++) repaired += '}';

  return repaired;
}

/**
 * Parse the structured JSON response from Claude.
 * Handles cases where Claude wraps the JSON in markdown code fences.
 * Also handles truncated responses by attempting JSON repair.
 */
export function parseContractAnalysis(raw: string): StructuredAnalysisResult {
  let jsonStr = raw.trim();

  // --- Step 1: Strip markdown code fences (line-based, handles backticks in content) ---
  if (jsonStr.startsWith('```')) {
    const firstNewline = jsonStr.indexOf('\n');
    if (firstNewline !== -1) {
      jsonStr = jsonStr.substring(firstNewline + 1);
    }
  }
  if (jsonStr.trimEnd().endsWith('```')) {
    const lastFenceIdx = jsonStr.lastIndexOf('```');
    jsonStr = jsonStr.substring(0, lastFenceIdx);
  }
  jsonStr = jsonStr.trim();

  // --- Step 2: Extract the outermost JSON object (first '{' to last '}') ---
  const firstBrace = jsonStr.indexOf('{');
  const lastBrace = jsonStr.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    jsonStr = jsonStr.substring(firstBrace, lastBrace + 1);
  }

  // --- Step 3: Sanitize control characters from PDF-extracted text ---
  jsonStr = sanitizeJsonString(jsonStr);

  let parsed: {
    executiveSummary?: string;
    overallRisk?: string;
    clauses?: StructuredClause[];
    negotiationStrategy?: string | StructuredNegotiationItem[];
  };

  const EMPTY_RESULT: StructuredAnalysisResult = {
    executiveSummary: "",
    overallRisk: "medium",
    clauses: [],
    negotiationStrategy: "",
    negotiationItems: [],
    greenCount: 0,
    yellowCount: 0,
    redCount: 0,
    rawAnalysis: raw,
  };

  // --- Step 4: Multi-attempt parsing ---
  // Attempt 1: direct parse
  try {
    parsed = JSON.parse(jsonStr);
  } catch (err) {
    console.warn(`[Parser] Attempt 1 (direct parse) failed:`, err instanceof Error ? err.message : err);

    // Attempt 2: extract from the unsanitized raw (first { to last })
    const sanitizedRaw = sanitizeJsonString(raw);
    const rawFirst = sanitizedRaw.indexOf('{');
    const rawLast = sanitizedRaw.lastIndexOf('}');
    const extracted = rawFirst !== -1 && rawLast > rawFirst
      ? sanitizedRaw.substring(rawFirst, rawLast + 1)
      : null;

    if (extracted) {
      try {
        parsed = JSON.parse(extracted);
      } catch (err2) {
        console.warn(`[Parser] Attempt 2 (brace extraction) failed:`, err2 instanceof Error ? err2.message : err2);

        // Attempt 3: repair the extracted substring (handles truncation)
        try {
          parsed = JSON.parse(repairTruncatedJson(extracted));
          console.warn(`[Parser] Repaired truncated JSON. Raw length: ${raw.length}`);
        } catch (err3) {
          console.warn(`[Parser] Attempt 3 (repair extracted) failed:`, err3 instanceof Error ? err3.message : err3);

          // Attempt 4: repair the sanitized stripped string
          try {
            parsed = JSON.parse(repairTruncatedJson(jsonStr));
            console.warn(`[Parser] Repaired stripped JSON. Raw length: ${raw.length}`);
          } catch (err4) {
            console.error(
              `[Parser] All JSON parsing attempts failed. Raw length: ${raw.length}, ` +
              `Last 200 chars: ${raw.substring(raw.length - 200)}`,
              err4 instanceof Error ? err4.message : err4,
            );
            return EMPTY_RESULT;
          }
        }
      }
    } else {
      // No braces found at all — try repair on the stripped string
      try {
        parsed = JSON.parse(repairTruncatedJson(jsonStr));
        console.warn(`[Parser] Repaired JSON (no braces found). Raw length: ${raw.length}`);
      } catch (err2) {
        console.error(
          `[Parser] No JSON structure found. Raw length: ${raw.length}, ` +
          `First 200 chars: ${raw.substring(0, 200)}`,
          err2 instanceof Error ? err2.message : err2,
        );
        return EMPTY_RESULT;
      }
    }
  }

  const clauses: StructuredClause[] = (parsed.clauses || []).map(
    (clause, index) => ({
      clauseNumber: clause.clauseNumber || "",
      clauseName: clause.clauseName || `Clause ${index + 1}`,
      clauseText: clause.clauseText || "",
      position: clause.position || index + 1,
      findings: (clause.findings || []).map((f) => ({
        riskLevel: (["GREEN", "YELLOW", "RED"].includes(f.riskLevel)
          ? f.riskLevel
          : "YELLOW") as "GREEN" | "YELLOW" | "RED",
        matchedRuleTitle: f.matchedRuleTitle || "Unknown Rule",
        summary: f.summary || "",
        fallbackText: f.fallbackText || "",
        whyTriggered: f.whyTriggered || "",
        excerpt: typeof f.excerpt === "string" ? f.excerpt.trim() : "",
      })),
    })
  );

  // Count risk levels across all findings
  let greenCount = 0;
  let yellowCount = 0;
  let redCount = 0;

  for (const clause of clauses) {
    for (const finding of clause.findings) {
      if (finding.riskLevel === "GREEN") greenCount++;
      else if (finding.riskLevel === "YELLOW") yellowCount++;
      else if (finding.riskLevel === "RED") redCount++;
    }
  }

  // Determine overall risk
  let overallRisk = parsed.overallRisk || "low";
  if (!["low", "medium", "high"].includes(overallRisk)) {
    if (redCount > 0) overallRisk = "high";
    else if (yellowCount > 0) overallRisk = "medium";
    else overallRisk = "low";
  }

  // Parse negotiation strategy — handle both array (new) and string (legacy)
  let negotiationStrategy = "";
  let negotiationItems: StructuredNegotiationItem[] = [];

  const rawNeg = parsed.negotiationStrategy;
  if (Array.isArray(rawNeg)) {
    // New structured format
    negotiationItems = rawNeg.map((item) => ({
      priority: ["P1", "P2", "P3"].includes(item.priority) ? item.priority : "P3",
      title: item.title || "",
      description: item.description || "",
      clauseRef: item.clauseRef || null,
    }));
    negotiationStrategy = ""; // Clear string field when array is present
  } else if (typeof rawNeg === "string") {
    // Legacy string format
    negotiationStrategy = rawNeg;
  }

  return {
    executiveSummary: parsed.executiveSummary || "",
    overallRisk,
    clauses,
    negotiationStrategy,
    negotiationItems,
    greenCount,
    yellowCount,
    redCount,
    rawAnalysis: raw,
  };
}

// === Unchanged parsers below ===

export interface NdaTriageResult {
  classification: "GREEN" | "YELLOW" | "RED";
  rawAnalysis: string;
  recommendation: string;
}

export function parseNdaTriage(raw: string): NdaTriageResult {
  const classMatch = raw.match(
    /## Classification:\s*(GREEN|YELLOW|RED)/i
  );
  const classification = (classMatch?.[1]?.toUpperCase() || "YELLOW") as
    | "GREEN"
    | "YELLOW"
    | "RED";

  const recMatch = raw.match(
    /## Recommendation\n([\s\S]*?)(?=\n## |$)/i
  );
  const recommendation = recMatch ? recMatch[1].trim() : "";

  return { classification, rawAnalysis: raw, recommendation };
}

export interface RiskAssessmentResult {
  severity: number;
  likelihood: number;
  riskScore: number;
  riskLevel: string;
  rawAnalysis: string;
}

export function parseRiskAssessment(raw: string): RiskAssessmentResult {
  const sevMatch = raw.match(/## Severity:\s*(\d)/i);
  const severity = sevMatch ? parseInt(sevMatch[1]) : 3;

  const likMatch = raw.match(/## Likelihood:\s*(\d)/i);
  const likelihood = likMatch ? parseInt(likMatch[1]) : 3;

  const riskScore = severity * likelihood;

  let riskLevel = "GREEN";
  if (riskScore >= 16) riskLevel = "RED";
  else if (riskScore >= 10) riskLevel = "ORANGE";
  else if (riskScore >= 5) riskLevel = "YELLOW";

  return { severity, likelihood, riskScore, riskLevel, rawAnalysis: raw };
}

export interface ComplianceResult {
  overallStatus: string;
  rawAnalysis: string;
}

export function parseComplianceCheck(raw: string): ComplianceResult {
  const statusMatch = raw.match(
    /## Overall Status:\s*(COMPLIANT|PARTIALLY_COMPLIANT|NON_COMPLIANT)/i
  );
  const overallStatus = statusMatch?.[1] || "PARTIALLY_COMPLIANT";

  return { overallStatus, rawAnalysis: raw };
}
