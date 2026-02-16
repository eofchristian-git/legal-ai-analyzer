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
  // NEW: Deviation-focused analysis fields (Feature 005)
  context?: {
    before: string | null;
    after: string | null;
  };
  location?: {
    page: number | null;
    approximatePosition: string | null;
  };
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
  clauseTextFormatted: string;
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
  // NEW: Deviation-focused analysis field (Feature 005)
  totalClauses?: number;  // Total clauses in document (formatVersion=2 only)
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
 * Detect the format version of the parsed Claude response.
 * 
 * Feature 005: Deviation-Focused Contract Analysis
 * 
 * Format v1 (clause-grouped): Response has a `clauses[]` array where each clause
 * contains its full text and nested findings.
 * 
 * Format v2 (flat findings): Response has a `findings[]` array at the top level,
 * where each finding includes a `clauseReference` object. No full clause text.
 * 
 * @param parsed - The parsed JSON object from Claude's response
 * @returns 1 for old clause-grouped format, 2 for new flat findings format
 */
function detectFormat(parsed: any): 1 | 2 {
  // Format v2 has findings at top level, format v1 has clauses at top level
  if (Array.isArray(parsed.findings)) {
    console.log('[Parser] Format v2 detected: flat findings array present');
    return 2;
  }
  if (Array.isArray(parsed.clauses)) {
    console.log('[Parser] Format v1 detected: clauses array present');
    return 1;
  }
  // Unknown format - log warning and default to v1 for backward compatibility
  console.warn(
    '[Parser] Unknown format detected: response has neither findings[] nor clauses[] array. ' +
    'Available keys:', Object.keys(parsed).join(', '),
    '- Defaulting to format v1 for backward compatibility.'
  );
  return 1;
}

/**
 * Parse format v1 (clause-grouped) response.
 * 
 * This is the original format (pre-Feature 005) where Claude returns a `clauses[]`
 * array with each clause containing full text and nested findings.
 * 
 * Example structure:
 * ```json
 * {
 *   "clauses": [
 *     {
 *       "clauseNumber": "3.1",
 *       "clauseName": "Limitation of Liability",
 *       "clauseText": "Full 500+ word clause text...",
 *       "findings": [{ ... }]
 *     }
 *   ]
 * }
 * ```
 * 
 * @param parsed - The parsed JSON object from Claude (format v1)
 * @param raw - The raw response string for fallback
 * @returns Normalized StructuredAnalysisResult with risk counts and metadata
 */
function parseFormatV1(parsed: any, raw: string): StructuredAnalysisResult {
  const clauses: StructuredClause[] = (parsed.clauses || []).map(
    (clause: any, index: number) => {
      // Handle both old format (separate clauseText + clauseTextFormatted) 
      // and new format (single clauseText field)
      const clauseText = clause.clauseText || "";
      const clauseTextFormatted = clause.clauseTextFormatted || clauseText;
      
      return {
        clauseNumber: clause.clauseNumber || "", // Allow empty - UI will show position as fallback
        clauseName: clause.clauseName || `Clause ${index + 1}`,
        clauseText: clauseText,
        clauseTextFormatted: clauseTextFormatted,
        position: clause.position || index + 1,
        findings: (clause.findings || []).map((f: any) => ({
          riskLevel: (["GREEN", "YELLOW", "RED"].includes(f.riskLevel)
            ? f.riskLevel
            : "YELLOW") as "GREEN" | "YELLOW" | "RED",
          matchedRuleTitle: f.matchedRuleTitle || "Unknown Rule",
          summary: f.summary || "",
          fallbackText: f.fallbackText || "",
          whyTriggered: f.whyTriggered || "",
          excerpt: typeof f.excerpt === "string" ? f.excerpt.trim() : "",
          // v1 format doesn't have context/location, leave undefined
        })),
      };
    }
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
    negotiationItems = rawNeg.map((item: any) => ({
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
    totalClauses: undefined, // v1 doesn't have totalClauses
  };
}

/**
 * Parse format v2 (flat findings) response.
 * 
 * Feature 005: Deviation-Focused Contract Analysis
 * 
 * This format returns a flat `findings[]` array where each finding contains:
 * - `clauseReference`: { number, name, position }
 * - `excerpt`: 20-80 word problematic passage (NOT full clause text)
 * - `context`: { before, after } - surrounding text for understanding
 * - `location`: { page, approximatePosition } - for future highlighting
 * 
 * This parser:
 * 1. Groups findings by clauseReference.position
 * 2. Synthesizes StructuredClause objects (with empty clauseText)
 * 3. Sorts clauses by position
 * 4. Calculates risk counts across all findings
 * 
 * Example structure:
 * ```json
 * {
 *   "totalClauses": 247,
 *   "findings": [
 *     {
 *       "clauseReference": { "number": "3.1", "name": "...", "position": 8 },
 *       "excerpt": "30-word problematic passage",
 *       "context": { "before": "...", "after": "..." },
 *       "location": { "page": 5, "approximatePosition": "middle" },
 *       ...
 *     }
 *   ]
 * }
 * ```
 * 
 * @param parsed - The parsed JSON object from Claude (format v2)
 * @param raw - The raw response string for fallback
 * @returns Normalized StructuredAnalysisResult with synthesized clauses
 */
function parseFormatV2(parsed: any, raw: string): StructuredAnalysisResult {
  // Group findings by clauseReference.position
  const findingsByClause = new Map<number, any[]>();
  const clauseMetadata = new Map<number, { number: string; name: string }>();
  
  const findings = parsed.findings || [];
  
  for (const finding of findings) {
    const clauseRef = finding.clauseReference;
    if (!clauseRef) {
      console.warn('[Parser v2] Finding missing clauseReference, skipping:', finding);
      continue;
    }
    
    const position = clauseRef.position || 1;
    
    // Store clause metadata
    if (!clauseMetadata.has(position)) {
      clauseMetadata.set(position, {
        number: clauseRef.number || "",
        name: clauseRef.name || `Clause ${position}`,
      });
    }
    
    // Group findings by position
    if (!findingsByClause.has(position)) {
      findingsByClause.set(position, []);
    }
    findingsByClause.get(position)!.push(finding);
  }
  
  // Synthesize StructuredClause objects
  const clauses: StructuredClause[] = [];
  const sortedPositions = Array.from(clauseMetadata.keys()).sort((a, b) => a - b);
  
  let greenCount = 0;
  let yellowCount = 0;
  let redCount = 0;
  
  for (const position of sortedPositions) {
    const metadata = clauseMetadata.get(position)!;
    const clauseFindings = findingsByClause.get(position) || [];
    
    const structuredFindings: StructuredFinding[] = clauseFindings.map((f: any) => {
      // Count risk levels
      const riskLevel = (["GREEN", "YELLOW", "RED"].includes(f.riskLevel)
        ? f.riskLevel
        : "YELLOW") as "GREEN" | "YELLOW" | "RED";
      
      if (riskLevel === "GREEN") greenCount++;
      else if (riskLevel === "YELLOW") yellowCount++;
      else if (riskLevel === "RED") redCount++;
      
      return {
        riskLevel,
        matchedRuleTitle: f.matchedRuleTitle || "Unknown Rule",
        summary: f.summary || "",
        fallbackText: f.fallbackText || "",
        whyTriggered: f.whyTriggered || "",
        excerpt: typeof f.excerpt === "string" ? f.excerpt.trim() : "",
        // NEW: v2 fields
        context: f.context ? {
          before: f.context.before || null,
          after: f.context.after || null,
        } : undefined,
        location: f.location ? {
          page: f.location.page || null,
          approximatePosition: f.location.approximatePosition || null,
        } : undefined,
      };
    });
    
    clauses.push({
      clauseNumber: metadata.number,
      clauseName: metadata.name,
      clauseText: "", // v2 doesn't extract full clause text
      clauseTextFormatted: "",
      position,
      findings: structuredFindings,
    });
  }
  
  // Determine overall risk
  let overallRisk = parsed.overallRisk || "low";
  if (!["low", "medium", "high"].includes(overallRisk)) {
    if (redCount > 0) overallRisk = "high";
    else if (yellowCount > 0) overallRisk = "medium";
    else overallRisk = "low";
  }
  
  // Parse negotiation strategy (should be array in v2)
  let negotiationStrategy = "";
  let negotiationItems: StructuredNegotiationItem[] = [];
  
  const rawNeg = parsed.negotiationStrategy;
  if (Array.isArray(rawNeg)) {
    negotiationItems = rawNeg.map((item: any) => ({
      priority: ["P1", "P2", "P3"].includes(item.priority) ? item.priority : "P3",
      title: item.title || "",
      description: item.description || "",
      clauseRef: item.clauseRef || null,
    }));
  } else if (typeof rawNeg === "string") {
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
    totalClauses: parsed.totalClauses || clauses.length,
  };
}

/**
 * Parse the structured JSON response from Claude.
 * 
 * Feature 005: Dual-Format Parser (Backward Compatible)
 * 
 * This parser supports both:
 * - **Format v1** (clause-grouped): Full clause text with nested findings
 * - **Format v2** (flat findings): Only excerpts with context and location
 * 
 * The parser:
 * 1. Strips markdown code fences if present
 * 2. Sanitizes control characters from PDF extraction
 * 3. Attempts JSON parsing with multiple fallback strategies
 * 4. Auto-detects format version (v1 vs v2)
 * 5. Routes to appropriate format-specific parser
 * 6. Returns normalized StructuredAnalysisResult
 * 
 * Graceful degradation:
 * - Handles truncated responses (repairs JSON)
 * - Handles malformed JSON (multiple fallback attempts)
 * - Returns empty result on complete failure (doesn't crash)
 * 
 * @param raw - The raw response string from Claude
 * @returns Normalized StructuredAnalysisResult with risk counts and clauses
 */
export function parseContractAnalysis(raw: string): StructuredAnalysisResult {
  // Strip markdown code fences if present
  let jsonStr = raw.trim();

  // Try both greedy (complete) and lazy (incomplete/truncated) code fence patterns
  const completeFenceMatch = jsonStr.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
  if (completeFenceMatch) {
    jsonStr = completeFenceMatch[1].trim();
  } else {
    // Handle truncated response where closing ``` is missing
    const openFenceMatch = jsonStr.match(/```(?:json)?\s*\n?([\s\S]*)/);
    if (openFenceMatch) {
      jsonStr = openFenceMatch[1].trim();
    }
  }

  let parsed: {
    executiveSummary?: string;
    overallRisk?: string;
    clauses?: StructuredClause[];
    negotiationStrategy?: string | StructuredNegotiationItem[];
  };

  // Sanitize control characters that PDF extraction may introduce
  jsonStr = sanitizeJsonString(jsonStr);

  try {
    parsed = JSON.parse(jsonStr);
  } catch (err) {
    console.warn(`[Parser] Attempt 1 (direct parse) failed:`, err instanceof Error ? err.message : err);
    // Fallback 1: try to find a complete JSON object in the raw text
    const sanitizedRaw = sanitizeJsonString(raw);
    const jsonMatch = sanitizedRaw.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        parsed = JSON.parse(jsonMatch[0]);
      } catch (err) {
        console.warn(`[Parser] Attempt 2 (regex match) failed:`, err instanceof Error ? err.message : err);
        // Fallback 2: attempt to repair truncated JSON
        try {
          const repaired = repairTruncatedJson(jsonStr);
          parsed = JSON.parse(repaired);
          console.warn(
            `[Parser] Successfully repaired truncated JSON response. ` +
            `Original length: ${raw.length}, Repaired length: ${repaired.length}`
          );
        } catch (err) {
          console.warn(`[Parser] Attempt 3 (repair stripped) failed:`, err instanceof Error ? err.message : err);
          // Fallback 3: try repairing the matched substring
          if (jsonMatch) {
            try {
              const repaired = repairTruncatedJson(jsonMatch[0]);
              parsed = JSON.parse(repaired);
              console.warn(
                `[Parser] Repaired truncated JSON from substring match. ` +
                `Original length: ${raw.length}`
              );
            } catch (err) {
              console.error(
                `[Parser] All JSON parsing attempts failed. Raw length: ${raw.length}, ` +
                `Last 200 chars: ${raw.substring(raw.length - 200)}`,
                err instanceof Error ? err.message : err
              );
              return {
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
            }
          } else {
            console.error(
              `[Parser] No JSON object found in response. Raw length: ${raw.length}`
            );
            return {
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
          }
        }
      }
    } else {
      // No JSON match at all — try repair on the stripped string
      try {
        const repaired = repairTruncatedJson(jsonStr);
        parsed = JSON.parse(repaired);
        console.warn(`[Parser] Repaired truncated JSON (no brace match). Raw length: ${raw.length}`);
      } catch (err) {
        console.error(
          `[Parser] No JSON structure found. Raw length: ${raw.length}, ` +
          `First 200 chars: ${raw.substring(0, 200)}`,
          err instanceof Error ? err.message : err
        );
        return {
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
      }
    }
  }

  // Detect format version and route to appropriate parser
  const formatVersion = detectFormat(parsed);
  
  if (formatVersion === 2) {
    console.log('[Parser] Detected format v2 (flat findings) - using deviation-focused parser');
    return parseFormatV2(parsed, raw);
  } else {
    console.log('[Parser] Detected format v1 (clause-grouped) - using legacy parser');
    return parseFormatV1(parsed, raw);
  }
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
