import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { buildRiskAssessmentPrompt } from "@/lib/prompts";
import { analyzeWithClaude } from "@/lib/claude";
import { parseRiskAssessment } from "@/lib/analysis-parser";

export async function GET() {
  try {
    const assessments = await db.riskAssessment.findMany({
      orderBy: { createdAt: "desc" },
      include: { document: true },
    });

    return NextResponse.json(assessments);
  } catch (error) {
    console.error("Failed to list risk assessments:", error);
    return NextResponse.json(
      { error: "Failed to list risk assessments" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { documentId, title, category, context } = body;

    if (!documentId || !title || !category) {
      return NextResponse.json(
        { error: "documentId, title, and category are required" },
        { status: 400 }
      );
    }

    // Create RiskAssessment record with status "analyzing"
    const assessment = await db.riskAssessment.create({
      data: {
        documentId,
        title,
        category,
        context: context || null,
        status: "analyzing",
      },
    });

    // Load the document text
    const document = await db.document.findUnique({
      where: { id: documentId },
    });

    if (!document) {
      await db.riskAssessment.update({
        where: { id: assessment.id },
        data: { status: "error" },
      });
      return NextResponse.json(
        { error: "Document not found" },
        { status: 404 }
      );
    }

    // Build the prompt
    const { systemPrompt, userMessage } = await buildRiskAssessmentPrompt({
      contractText: document.extractedText,
      category,
      context: context || undefined,
    });

    // Call Claude for analysis
    const rawAnalysis = await analyzeWithClaude({
      systemPrompt,
      userMessage,
    });

    // Parse the analysis result
    const parsed = parseRiskAssessment(rawAnalysis);

    // Update the record with results
    const updated = await db.riskAssessment.update({
      where: { id: assessment.id },
      data: {
        severity: parsed.severity,
        likelihood: parsed.likelihood,
        riskScore: parsed.riskScore,
        riskLevel: parsed.riskLevel,
        rawAnalysis: parsed.rawAnalysis,
        riskMemo: parsed.rawAnalysis,
        modelUsed: "claude-sonnet-4-20250514",
        status: "completed",
      },
      include: { document: true },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Risk assessment error:", error);
    return NextResponse.json(
      { error: "Failed to perform risk assessment" },
      { status: 500 }
    );
  }
}
