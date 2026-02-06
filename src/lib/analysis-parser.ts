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

export function parseContractAnalysis(raw: string): ContractAnalysisResult {
  const clauses: ClauseAnalysis[] = [];

  // Match clause headers like "### Limitation of Liability -- RED"
  const clauseRegex = /###\s+(.+?)\s*--\s*(GREEN|YELLOW|RED)/gi;
  let match;

  while ((match = clauseRegex.exec(raw)) !== null) {
    const clauseName = match[1].trim();
    const severity = match[2].toUpperCase() as "GREEN" | "YELLOW" | "RED";

    // Get content until next ### or ## header
    const startIdx = match.index + match[0].length;
    const nextHeader = raw.indexOf("\n##", startIdx);
    const content =
      nextHeader !== -1
        ? raw.slice(startIdx, nextHeader).trim()
        : raw.slice(startIdx).trim();

    clauses.push({ clauseName, severity, content });
  }

  const greenCount = clauses.filter((c) => c.severity === "GREEN").length;
  const yellowCount = clauses.filter((c) => c.severity === "YELLOW").length;
  const redCount = clauses.filter((c) => c.severity === "RED").length;

  let overallRisk = "low";
  if (redCount > 0) overallRisk = "high";
  else if (yellowCount > 0) overallRisk = "medium";

  // Extract executive summary
  const summaryMatch = raw.match(
    /## Executive Summary\n([\s\S]*?)(?=\n## )/i
  );
  const executiveSummary = summaryMatch ? summaryMatch[1].trim() : "";

  // Extract negotiation strategy
  const strategyMatch = raw.match(
    /## Negotiation Strategy\n([\s\S]*?)(?=\n## |$)/i
  );
  const negotiationStrategy = strategyMatch ? strategyMatch[1].trim() : "";

  return {
    overallRisk,
    greenCount,
    yellowCount,
    redCount,
    clauses,
    executiveSummary,
    negotiationStrategy,
    rawAnalysis: raw,
  };
}

export interface NdaTriageResult {
  classification: "GREEN" | "YELLOW" | "RED";
  rawAnalysis: string;
  recommendation: string;
}

export function parseNdaTriage(raw: string): NdaTriageResult {
  // Extract classification
  const classMatch = raw.match(
    /## Classification:\s*(GREEN|YELLOW|RED)/i
  );
  const classification = (classMatch?.[1]?.toUpperCase() || "YELLOW") as
    | "GREEN"
    | "YELLOW"
    | "RED";

  // Extract recommendation
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
  // Extract severity
  const sevMatch = raw.match(/## Severity:\s*(\d)/i);
  const severity = sevMatch ? parseInt(sevMatch[1]) : 3;

  // Extract likelihood
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
