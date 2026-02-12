interface ExportClause {
  clauseName: string;
  position: number;
  findings: ExportFinding[];
}

interface ExportFinding {
  riskLevel: string;
  matchedRuleTitle: string;
  summary: string;
  excerpt: string;
  fallbackText: string;
  triageDecision: string | null;
  triageNote: string | null;
}

function escapeCsvField(value: string): string {
  if (
    value.includes(",") ||
    value.includes('"') ||
    value.includes("\n") ||
    value.includes("\r")
  ) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function generateFindingsCsv(
  clauses: ExportClause[],
  contractTitle: string
): string {
  const headers = [
    "Clause",
    "Position",
    "Risk Level",
    "Matched Rule",
    "Summary",
    "Excerpt",
    "Fallback Text",
    "Decision",
    "Note",
  ];

  const rows: string[][] = [];

  for (const clause of clauses) {
    if (clause.findings.length === 0) {
      // Include clauses with no findings
      rows.push([
        clause.clauseName,
        String(clause.position),
        "",
        "",
        "No findings",
        "",
        "",
        "",
        "",
      ]);
    } else {
      for (const finding of clause.findings) {
        rows.push([
          clause.clauseName,
          String(clause.position),
          finding.riskLevel,
          finding.matchedRuleTitle,
          finding.summary,
          finding.excerpt || "",
          finding.fallbackText,
          finding.triageDecision || "Pending",
          finding.triageNote || "",
        ]);
      }
    }
  }

  const csvLines = [
    headers.map(escapeCsvField).join(","),
    ...rows.map((row) => row.map(escapeCsvField).join(",")),
  ];

  return csvLines.join("\n");
}
