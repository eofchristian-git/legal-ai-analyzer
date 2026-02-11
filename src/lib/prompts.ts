import { loadSkill } from "./skills";
import { getCountryByCode } from "./countries";

export interface PlaybookRuleForPrompt {
  title: string;
  description: string;
  country?: string | null;
  riskLevel: string;
  standardPosition: string;
  acceptableRange: string;
  escalationTrigger: string;
  negotiationGuidance: string;
}

export function serializePlaybookRules(rules: PlaybookRuleForPrompt[]): string {
  return rules
    .map((rule) => {
      const country = rule.country
        ? getCountryByCode(rule.country)?.name || rule.country
        : "Global";
      return [
        `### ${rule.title}`,
        "",
        `**Business Context**: ${rule.description}`,
        `**Jurisdiction**: ${country}`,
        `**Risk Level**: ${rule.riskLevel}`,
        "",
        `- **Standard Position**: ${rule.standardPosition}`,
        `- **Acceptable Range**: ${rule.acceptableRange}`,
        `- **Escalation Trigger**: ${rule.escalationTrigger}`,
        `- **Negotiation Guidance**: ${rule.negotiationGuidance}`,
      ].join("\n");
    })
    .join("\n\n");
}

export async function buildContractReviewPrompt(params: {
  contractText: string;
  ourSide: string;
  deadline?: string;
  focusAreas?: string[];
  dealContext?: string;
  playbookRules?: PlaybookRuleForPrompt[];
}): Promise<{ systemPrompt: string; userMessage: string }> {
  const skill = await loadSkill("contract-review");

  const systemPrompt =
    params.playbookRules && params.playbookRules.length > 0
      ? `${skill}\n\n## Organization Playbook\n\n${serializePlaybookRules(params.playbookRules)}`
      : `${skill}\n\n## Note\nNo organizational playbook is configured. Review against widely-accepted commercial standards and flag any unusual or one-sided provisions.`;

  const parts = [
    "Please review the following contract.",
    "",
    `**Our side**: ${params.ourSide}`,
  ];

  if (params.deadline) parts.push(`**Deadline**: ${params.deadline}`);
  if (params.focusAreas?.length)
    parts.push(`**Focus areas**: ${params.focusAreas.join(", ")}`);
  if (params.dealContext)
    parts.push(`**Deal context**: ${params.dealContext}`);

  parts.push("", "## Contract Text", "", params.contractText, "", "---", "");
  parts.push(
    "Analyze the contract clause by clause. For each clause, identify findings against the playbook rules (or general best practices if no playbook is provided).",
    "",
    "You MUST respond with ONLY a valid JSON object (no markdown, no code fences, no explanation outside the JSON). Use this exact schema:",
    "",
    '```json',
    '{',
    '  "executiveSummary": "string — 2-3 sentence overview of the contract risk posture",',
    '  "overallRisk": "low|medium|high",',
    '  "clauses": [',
    '    {',
    '      "clauseNumber": "string — the original section/article/clause number as it appears in the document (e.g. \"3.1\", \"Article 5\", \"Section 12\", \"§7\"). Use \"\" if the document has no numbering.",',
    '      "clauseName": "string — name/title of the clause (e.g. Limitation of Liability)",',
    '      "clauseText": "string — the FULL, VERBATIM, UNABRIDGED original text of this clause exactly as it appears in the contract. Do NOT summarize, paraphrase, or shorten it. Copy the entire clause word-for-word.",',
    '      "position": 1,',
    '      "findings": [',
    '        {',
    '          "riskLevel": "GREEN|YELLOW|RED",',
    '          "matchedRuleTitle": "string — title of the playbook rule that triggered this finding, or a descriptive title if no playbook",',
    '          "summary": "string — plain-language summary of the issue",',
    '          "fallbackText": "string — recommended alternative contract language",',
    '          "whyTriggered": "string — explanation of why this rule was triggered, linking back to the specific playbook rule or standard"',
    '        }',
    '      ]',
    '    }',
    '  ],',
    '  "negotiationStrategy": "string — overall negotiation approach and priority items"',
    '}',
    '```',
    "",
    "Rules:",
    "- Position values must be sequential starting at 1.",
    "- Every clause must appear even if it has zero findings (empty findings array).",
    "- clauseText MUST contain the complete, unmodified original text from the contract. Never truncate, summarize, or paraphrase it.",
    "- riskLevel for findings must be exactly GREEN, YELLOW, or RED.",
    "- overallRisk must be exactly low, medium, or high.",
    "- Respond with ONLY the JSON object, nothing else."
  );

  return { systemPrompt, userMessage: parts.join("\n") };
}

export async function buildNdaTriagePrompt(params: {
  ndaText: string;
  context?: string;
  playbookRules?: PlaybookRuleForPrompt[];
}): Promise<{ systemPrompt: string; userMessage: string }> {
  const skill = await loadSkill("nda-triage");

  const systemPrompt =
    params.playbookRules && params.playbookRules.length > 0
      ? `${skill}\n\n## Organization NDA Standards\n\n${serializePlaybookRules(params.playbookRules)}`
      : skill;

  const parts = ["Please triage the following NDA.", ""];

  if (params.context) parts.push(`**Context**: ${params.context}`, "");

  parts.push("## NDA Text", "", params.ndaText, "", "---", "");
  parts.push(
    "Evaluate against each screening criterion and provide a classification (GREEN, YELLOW, or RED).",
    "",
    "Structure your response with these exact markdown headers:",
    "## NDA Triage Summary",
    "## Classification: [GREEN|YELLOW|RED]",
    "## Screening Results",
    "## Issues Found",
    "## Recommendation",
    "## Next Steps"
  );

  return { systemPrompt, userMessage: parts.join("\n") };
}

export async function buildCompliancePrompt(params: {
  contractText: string;
  regulations: string[];
  analysisType: string;
}): Promise<{ systemPrompt: string; userMessage: string }> {
  const skill = await loadSkill("compliance");

  const parts = [
    `Please perform a ${params.analysisType.replace("-", " ")} analysis of the following document.`,
    "",
    `**Regulations to check**: ${params.regulations.map((r) => r.toUpperCase()).join(", ")}`,
    `**Analysis type**: ${params.analysisType}`,
    "",
    "## Document Text",
    "",
    params.contractText,
    "",
    "---",
    "",
    "Check compliance against each selected regulation.",
    "For DPA reviews, use the complete DPA Review Checklist.",
    "Flag any gaps, missing elements, or non-compliant provisions.",
    "",
    "Structure your response with these exact markdown headers:",
    "## Compliance Summary",
    "## Overall Status: [COMPLIANT|PARTIALLY_COMPLIANT|NON_COMPLIANT]",
    "## Findings by Regulation",
    "## Remediation Steps",
    "## Next Steps",
  ];

  return { systemPrompt: skill, userMessage: parts.join("\n") };
}

export async function buildRiskAssessmentPrompt(params: {
  contractText: string;
  category: string;
  context?: string;
}): Promise<{ systemPrompt: string; userMessage: string }> {
  const skill = await loadSkill("legal-risk-assessment");

  const parts = [
    "Please assess the legal risks in the following document.",
    "",
    `**Risk category**: ${params.category}`,
  ];

  if (params.context) parts.push(`**Context**: ${params.context}`);

  parts.push("", "## Document Text", "", params.contractText, "", "---", "");
  parts.push(
    "Provide:",
    "1. A severity rating (1-5) with rationale",
    "2. A likelihood rating (1-5) with rationale",
    "3. The calculated risk score and level (GREEN/YELLOW/ORANGE/RED)",
    "4. A full risk assessment memo",
    "5. Mitigation options with effectiveness and cost/effort ratings",
    "",
    "Structure your response with these exact markdown headers:",
    "## Risk Assessment Summary",
    "## Severity: [1-5] - [Label]",
    "## Likelihood: [1-5] - [Label]",
    "## Risk Score: [N] - [GREEN|YELLOW|ORANGE|RED]",
    "## Risk Analysis",
    "## Mitigation Options",
    "## Recommended Approach",
    "## Next Steps"
  );

  return { systemPrompt: skill, userMessage: parts.join("\n") };
}
