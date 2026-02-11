import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

interface ExportClause {
  clauseName: string;
  position: number;
  findings: ExportFinding[];
}

interface ExportFinding {
  riskLevel: string;
  matchedRuleTitle: string;
  summary: string;
  fallbackText: string;
  triageDecision: string | null;
  triageNote: string | null;
}

interface AnalysisMetadata {
  overallRisk: string;
  greenCount: number;
  yellowCount: number;
  redCount: number;
  playbookVersion: number | null;
  analysisDate: string;
  finalized: boolean;
}

export function generateFindingsPdf(
  clauses: ExportClause[],
  contractTitle: string,
  metadata: AnalysisMetadata
): Buffer {
  const doc = new jsPDF();

  // --- Cover Page ---
  doc.setFontSize(24);
  doc.text("Contract Analysis Report", 20, 40);

  doc.setFontSize(14);
  doc.text(contractTitle, 20, 55);

  doc.setFontSize(10);
  doc.setTextColor(100, 100, 100);
  doc.text(`Analysis Date: ${new Date(metadata.analysisDate).toLocaleDateString()}`, 20, 70);
  doc.text(
    `Playbook Version: ${metadata.playbookVersion != null ? `v${metadata.playbookVersion}` : "Standard Review"}`,
    20,
    78
  );
  doc.text(`Overall Risk: ${metadata.overallRisk.toUpperCase()}`, 20, 86);
  doc.text(`Status: ${metadata.finalized ? "Finalized" : "Draft"}`, 20, 94);

  // Summary statistics
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(12);
  doc.text("Summary Statistics", 20, 115);

  doc.setFontSize(10);
  const allFindings = clauses.flatMap((c) => c.findings);
  const acceptCount = allFindings.filter((f) => f.triageDecision === "ACCEPT").length;
  const reviewCount = allFindings.filter((f) => f.triageDecision === "NEEDS_REVIEW").length;
  const rejectCount = allFindings.filter((f) => f.triageDecision === "REJECT").length;
  const pendingCount = allFindings.filter((f) => !f.triageDecision).length;

  autoTable(doc, {
    startY: 120,
    head: [["Category", "Count"]],
    body: [
      ["Total Clauses", String(clauses.length)],
      ["Total Findings", String(allFindings.length)],
      ["GREEN Findings", String(metadata.greenCount)],
      ["YELLOW Findings", String(metadata.yellowCount)],
      ["RED Findings", String(metadata.redCount)],
      ["Accepted", String(acceptCount)],
      ["Needs Review", String(reviewCount)],
      ["Rejected", String(rejectCount)],
      ["Pending", String(pendingCount)],
    ],
    theme: "grid",
    headStyles: { fillColor: [41, 128, 185] },
    styles: { fontSize: 9 },
    margin: { left: 20, right: 20 },
  });

  // --- Findings Table ---
  doc.addPage();
  doc.setFontSize(14);
  doc.text("Findings Detail", 20, 20);

  const tableBody: string[][] = [];

  for (const clause of clauses) {
    for (const finding of clause.findings) {
      tableBody.push([
        clause.clauseName,
        finding.riskLevel,
        finding.matchedRuleTitle,
        finding.summary,
        finding.triageDecision || "Pending",
      ]);
    }
  }

  if (tableBody.length > 0) {
    autoTable(doc, {
      startY: 28,
      head: [["Clause", "Risk", "Rule", "Summary", "Decision"]],
      body: tableBody,
      theme: "striped",
      headStyles: { fillColor: [41, 128, 185] },
      styles: { fontSize: 8, cellPadding: 2 },
      columnStyles: {
        0: { cellWidth: 30 },
        1: { cellWidth: 15 },
        2: { cellWidth: 30 },
        3: { cellWidth: 70 },
        4: { cellWidth: 25 },
      },
      margin: { left: 10, right: 10 },
    });
  } else {
    doc.setFontSize(10);
    doc.text("No findings to display.", 20, 35);
  }

  // Return as Buffer
  return Buffer.from(doc.output("arraybuffer"));
}
