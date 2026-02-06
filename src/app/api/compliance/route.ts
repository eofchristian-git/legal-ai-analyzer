import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { buildCompliancePrompt } from "@/lib/prompts";
import { analyzeWithClaude } from "@/lib/claude";
import { parseComplianceCheck } from "@/lib/analysis-parser";

export async function GET() {
  try {
    const checks = await db.complianceCheck.findMany({
      orderBy: { createdAt: "desc" },
      include: { document: true },
    });

    return NextResponse.json(checks);
  } catch (error) {
    console.error("Failed to list compliance checks:", error);
    return NextResponse.json(
      { error: "Failed to list compliance checks" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { documentId, title, regulations, analysisType } = body;

    if (!documentId || !title || !regulations || !analysisType) {
      return NextResponse.json(
        {
          error:
            "documentId, title, regulations, and analysisType are required",
        },
        { status: 400 }
      );
    }

    // Create ComplianceCheck record with status "analyzing"
    const check = await db.complianceCheck.create({
      data: {
        documentId,
        title,
        regulations: JSON.stringify(regulations),
        analysisType,
        status: "analyzing",
      },
    });

    // Load the document text
    const document = await db.document.findUnique({
      where: { id: documentId },
    });

    if (!document) {
      await db.complianceCheck.update({
        where: { id: check.id },
        data: { status: "error" },
      });
      return NextResponse.json(
        { error: "Document not found" },
        { status: 404 }
      );
    }

    // Build the prompt
    const { systemPrompt, userMessage } = await buildCompliancePrompt({
      contractText: document.extractedText,
      regulations,
      analysisType,
    });

    // Call Claude for analysis
    const rawAnalysis = await analyzeWithClaude({
      systemPrompt,
      userMessage,
    });

    // Parse the analysis result
    const parsed = parseComplianceCheck(rawAnalysis);

    // Update the record with results
    const updated = await db.complianceCheck.update({
      where: { id: check.id },
      data: {
        rawAnalysis: parsed.rawAnalysis,
        overallStatus: parsed.overallStatus,
        findings: parsed.rawAnalysis,
        modelUsed: "claude-sonnet-4-20250514",
        status: "completed",
      },
      include: { document: true },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Compliance check error:", error);
    return NextResponse.json(
      { error: "Failed to perform compliance check" },
      { status: 500 }
    );
  }
}
