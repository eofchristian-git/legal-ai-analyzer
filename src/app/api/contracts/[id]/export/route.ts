import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { generateFindingsCsv } from "@/lib/export/csv-export";
import { generateFindingsPdf } from "@/lib/export/pdf-export";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const format = req.nextUrl.searchParams.get("format");

    if (!format || !["csv", "pdf"].includes(format)) {
      return NextResponse.json(
        { error: "Invalid or missing format parameter. Must be 'csv' or 'pdf'." },
        { status: 400 }
      );
    }

    // Load contract with analysis, clauses, and findings
    const contract = await db.contract.findUnique({
      where: { id },
      include: {
        analysis: {
          include: {
            clauses: {
              orderBy: { position: "asc" },
              include: {
                findings: {
                  orderBy: { createdAt: "asc" },
                },
              },
            },
            playbookSnapshot: {
              select: { version: true },
            },
          },
        },
      },
    });

    if (!contract) {
      return NextResponse.json(
        { error: "Contract not found" },
        { status: 404 }
      );
    }

    if (!contract.analysis) {
      return NextResponse.json(
        { error: "No analysis exists for this contract" },
        { status: 404 }
      );
    }

    const analysis = contract.analysis;
    const sanitizedTitle = contract.title.replace(/[^a-zA-Z0-9-_ ]/g, "").replace(/\s+/g, "-");

    const exportClauses = analysis.clauses.map((clause: any) => ({
      clauseName: clause.clauseName,
      position: clause.position,
      findings: clause.findings.map((f: any) => ({
        riskLevel: f.riskLevel,
        matchedRuleTitle: f.matchedRuleTitle,
        summary: f.summary,
        excerpt: f.excerpt || "",
        fallbackText: f.fallbackText,
        triageDecision: f.triageDecision,
        triageNote: f.triageNote,
      })),
    }));

    if (format === "csv") {
      const csv = generateFindingsCsv(exportClauses, contract.title);

      return new Response(csv, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="contract-findings-${sanitizedTitle}.csv"`,
        },
      });
    }

    // PDF export
    const pdfBuffer = generateFindingsPdf(exportClauses, contract.title, {
      overallRisk: analysis.overallRisk,
      greenCount: analysis.greenCount,
      yellowCount: analysis.yellowCount,
      redCount: analysis.redCount,
      playbookVersion: analysis.playbookSnapshot?.version ?? null,
      analysisDate: analysis.createdAt.toISOString(),
      finalized: analysis.finalized,
    });

    return new Response(new Uint8Array(pdfBuffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="contract-findings-${sanitizedTitle}.pdf"`,
      },
    });
  } catch (error) {
    console.error("Failed to export findings:", error);
    return NextResponse.json(
      { error: "Failed to export findings" },
      { status: 500 }
    );
  }
}
