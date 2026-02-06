import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { buildNdaTriagePrompt } from "@/lib/prompts";
import { analyzeWithClaude } from "@/lib/claude";
import { parseNdaTriage } from "@/lib/analysis-parser";

export async function GET() {
  try {
    const triages = await db.ndaTriage.findMany({
      orderBy: { createdAt: "desc" },
      include: { document: true },
    });

    return NextResponse.json(triages);
  } catch (error) {
    console.error("Failed to list NDA triages:", error);
    return NextResponse.json(
      { error: "Failed to list NDA triages" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { documentId, title, context } = body;

    if (!documentId || !title) {
      return NextResponse.json(
        { error: "documentId and title are required" },
        { status: 400 }
      );
    }

    // Create the NdaTriage record with status "analyzing"
    const triage = await db.ndaTriage.create({
      data: {
        documentId,
        title,
        context: context || null,
        status: "analyzing",
      },
    });

    // Load the document text
    const document = await db.document.findUnique({
      where: { id: documentId },
    });

    if (!document) {
      await db.ndaTriage.update({
        where: { id: triage.id },
        data: { status: "error" },
      });
      return NextResponse.json(
        { error: "Document not found" },
        { status: 404 }
      );
    }

    // Load the playbook if one exists
    const playbook = await db.playbook.findFirst({
      orderBy: { updatedAt: "desc" },
    });

    // Build the prompt
    const { systemPrompt, userMessage } = await buildNdaTriagePrompt({
      ndaText: document.extractedText,
      context: context || undefined,
      playbook: playbook?.content,
    });

    // Call Claude for analysis
    const rawAnalysis = await analyzeWithClaude({
      systemPrompt,
      userMessage,
    });

    // Parse the analysis result
    const parsed = parseNdaTriage(rawAnalysis);

    // Update the NdaTriage record with results
    const updated = await db.ndaTriage.update({
      where: { id: triage.id },
      data: {
        classification: parsed.classification,
        rawAnalysis: parsed.rawAnalysis,
        recommendation: parsed.recommendation,
        modelUsed: "claude-sonnet-4-20250514",
        status: "completed",
      },
      include: { document: true },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("NDA triage error:", error);

    // Try to update the record status to error if we have the id
    // The triage variable may not be in scope if the error occurred early
    return NextResponse.json(
      { error: "Failed to perform NDA triage" },
      { status: 500 }
    );
  }
}
