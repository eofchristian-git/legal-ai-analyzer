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
  greenCount: number;
  yellowCount: number;
  redCount: number;
  rawAnalysis: string;
}

/**
 * Parse the structured JSON response from Claude.
 * Handles cases where Claude wraps the JSON in markdown code fences.
 */
export function parseContractAnalysis(raw: string): StructuredAnalysisResult {
  // Strip markdown code fences if present
  let jsonStr = raw.trim();
  const codeFenceMatch = jsonStr.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
  if (codeFenceMatch) {
    jsonStr = codeFenceMatch[1].trim();
  }

  let parsed: {
    executiveSummary?: string;
    overallRisk?: string;
    clauses?: StructuredClause[];
    negotiationStrategy?: string;
  };

  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    // Fallback: try to find JSON object in the raw text
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        parsed = JSON.parse(jsonMatch[0]);
      } catch {
        // If all parsing fails, return an empty result
        return {
          executiveSummary: "",
          overallRisk: "medium",
          clauses: [],
          negotiationStrategy: "",
          greenCount: 0,
          yellowCount: 0,
          redCount: 0,
          rawAnalysis: raw,
        };
      }
    } else {
      return {
        executiveSummary: "",
        overallRisk: "medium",
        clauses: [],
        negotiationStrategy: "",
        greenCount: 0,
        yellowCount: 0,
        redCount: 0,
        rawAnalysis: raw,
      };
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

  return {
    executiveSummary: parsed.executiveSummary || "",
    overallRisk,
    clauses,
    negotiationStrategy: parsed.negotiationStrategy || "",
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
