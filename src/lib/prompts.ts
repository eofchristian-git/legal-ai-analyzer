import { loadSkill } from "./skills";
import { getCountryByCode } from "./countries";

export interface PlaybookRuleForPrompt {
  title: string;
  description: string;
  country?: string | null;
  riskLevel: string;
  standardPosition?: string | null;
  acceptableRange?: string | null;
  escalationTrigger?: string | null;
  negotiationGuidance?: string | null;
}

export function serializePlaybookRules(rules: PlaybookRuleForPrompt[]): string {
  return rules
    .map((rule) => {
      const country = rule.country
        ? getCountryByCode(rule.country)?.name || rule.country
        : "Global";
      const lines = [
        `### ${rule.title}`,
        "",
        `**Business Context**: ${rule.description}`,
        `**Jurisdiction**: ${country}`,
        `**Risk Level**: ${rule.riskLevel}`,
        "",
      ];
      if (rule.standardPosition) lines.push(`- **Standard Position**: ${rule.standardPosition}`);
      if (rule.acceptableRange) lines.push(`- **Acceptable Range**: ${rule.acceptableRange}`);
      if (rule.escalationTrigger) lines.push(`- **Escalation Trigger**: ${rule.escalationTrigger}`);
      if (rule.negotiationGuidance) lines.push(`- **Negotiation Guidance**: ${rule.negotiationGuidance}`);
      return lines.join("\n");
    })
    .join("\n\n");
}

/**
 * Build a contract review prompt for Claude.
 * 
 * Feature 005: Deviation-Focused Analysis
 * 
 * This prompt requests Claude to extract ONLY problematic 20-80 word excerpts
 * (not full clause text) to achieve ~85% token reduction.
 * 
 * The response format is a flat findings array with:
 * - `excerpt`: 20-80 words of the problematic passage (verbatim)
 * - `context`: 30-50 words before and after for understanding
 * - `location`: Approximate page number and position (top/middle/bottom)
 * - `clauseReference`: Embedded clause metadata (number, name, position)
 * - `totalClauses`: Total clause count in the document
 * 
 * Benefits:
 * - Token usage: 15K → <3K per analysis (85% reduction)
 * - Scalability: Supports 500+ clause contracts (vs 50 previously)
 * - UX: Users see exact problematic passages, not full 500-word clauses
 * 
 * @param params - Prompt parameters including contract text and playbook rules
 * @returns System prompt and user message for Claude API
 */
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
    "Analyze the contract and identify ONLY the specific problematic passages that violate playbook rules (or general best practices if no playbook is provided).",
    "",
    "**IMPORTANT: Extract only problematic excerpts (20-80 words each), NOT full clause text. This dramatically reduces token usage.**",
    "",
    "You MUST respond with ONLY a valid JSON object (no markdown, no code fences, no explanation outside the JSON). Use this exact schema:",
    "",
    '```json',
    '{',
    '  "executiveSummary": "string — 2-3 sentence overview of the contract risk posture",',
    '  "overallRisk": "low|medium|high",',
    '  "totalClauses": 0,',
    '  "findings": [',
    '    {',
    '      "clauseReference": {',
    '        "number": "string — the original section/article/clause number (e.g. \"3.1\", \"Article 5\"). Use \"\" if no numbering.",',
    '        "name": "string — name/title of the clause (e.g. Limitation of Liability)",',
    '        "position": 1',
    '      },',
    '      "excerpt": "string — ONLY the 20-80 word problematic passage that triggered this finding. Must be verbatim from the contract.",',
    '      "context": {',
    '        "before": "string — 30-50 words of text BEFORE the excerpt for understanding. Can be null if at document start.",',
    '        "after": "string — 30-50 words of text AFTER the excerpt for understanding. Can be null if at document end."',
    '      },',
    '      "location": {',
    '        "page": 0,',
    '        "approximatePosition": "top|middle|bottom — where on the page this excerpt appears. Can be null if unknown."',
    '      },',
    '      "riskLevel": "GREEN|YELLOW|RED",',
    '      "matchedRuleTitle": "string — title of the playbook rule that triggered this finding",',
    '      "summary": "string — plain-language summary of the issue",',
    '      "fallbackText": "string — recommended alternative contract language based on the playbook rule",',
    '      "whyTriggered": "string — explanation of why this rule was triggered"',
    '    }',
    '  ],',
    '  "negotiationStrategy": [',
    '    {',
    '      "priority": "P1|P2|P3 — P1 = Critical/must-address, P2 = Important/should-address, P3 = Nice-to-have/minor",',
    '      "title": "string — concise title for this negotiation point",',
    '      "description": "string — detailed negotiation guidance and reasoning",',
    '      "clauseRef": "string|null — the clause name or number this point relates to, or null if general"',
    '    }',
    '  ]',
    '}',
    '```',
    "",
    "Critical Rules:",
    "- **DO NOT extract full clause text** - this violates the token efficiency requirement.",
    "- **Extract ONLY problematic passages**: Each excerpt should be 20-80 words of the specific text that violates a rule.",
    "- **Provide context**: Include 30-50 words before and after the excerpt so readers understand the surrounding text.",
    "- **Estimate location**: Provide approximate page number and position (top/middle/bottom) if determinable from the document structure.",
    "- **Count all clauses**: Set totalClauses to the total number of distinct clauses/sections you identified in the document.",
    "- **Flat findings list**: Return findings as a top-level array, NOT grouped under clauses. Each finding must include its clauseReference.",
    "- **Position values**: Within clauseReference, position must be sequential starting at 1.",
    "- **Risk levels**: riskLevel must be exactly GREEN, YELLOW, or RED.",
    "- **Overall risk**: overallRisk must be exactly low, medium, or high.",
    "- **Excerpt accuracy**: excerpt MUST be verbatim from the contract. Do NOT paraphrase.",
    "- **Negotiation strategy**: MUST be a JSON array of priority items with structure shown above.",
    "- **Response format**: Respond with ONLY the JSON object, nothing else.",
    "",
    "Example of a good excerpt + context:",
    '- excerpt: "Vendor liability shall be limited to €100 regardless of the nature or severity of the claim"',
    '- context.before: "The parties agree that all services are provided as-is without warranty."',
    '- context.after: "This limitation applies to all claims including breach of contract, negligence, or statutory violations."',
    "",
    "Example of what NOT to do:",
    "- ❌ Extracting 500+ words of full clause text",
    "- ❌ Paraphrasing the excerpt instead of copying verbatim",
    "- ❌ Grouping findings under a clauses array",
    "- ❌ Omitting context or location fields"
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
