import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { buildContractReviewPrompt } from "@/lib/prompts";
import { createClaudeStream } from "@/lib/claude";
import { parseContractAnalysis } from "@/lib/analysis-parser";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Load the contract with its document
    const contract = await db.contract.findUnique({
      where: { id },
      include: { document: true },
    });

    if (!contract) {
      return NextResponse.json(
        { error: "Contract not found" },
        { status: 404 }
      );
    }

    if (!contract.document.extractedText) {
      return NextResponse.json(
        { error: "Document has no extracted text" },
        { status: 400 }
      );
    }

    // Update status to analyzing
    await db.contract.update({
      where: { id },
      data: { status: "analyzing" },
    });

    // Load the latest playbook with active rules
    const playbook = await db.playbook.findFirst({
      include: {
        rules: { where: { deleted: false } },
      },
    });

    // Build the prompt
    const focusAreas = contract.focusAreas
      ? JSON.parse(contract.focusAreas)
      : undefined;

    const { systemPrompt, userMessage } = await buildContractReviewPrompt({
      contractText: contract.document.extractedText,
      ourSide: contract.ourSide,
      deadline: contract.deadline?.toISOString() || undefined,
      focusAreas,
      dealContext: contract.dealContext || undefined,
      playbookRules: playbook?.rules.length ? playbook.rules : undefined,
    });

    // Create the SSE stream
    const stream = createClaudeStream({
      systemPrompt,
      userMessage,
    });

    let fullResponse = "";

    const readableStream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();

        try {
          // Stream text chunks as SSE events
          stream.on("text", (text) => {
            fullResponse += text;
            const data = JSON.stringify({ type: "chunk", content: text });
            controller.enqueue(encoder.encode(`data: ${data}\n\n`));
          });

          // Wait for the stream to complete
          const finalMessage = await stream.finalMessage();

          // Parse the full response
          const parsed = parseContractAnalysis(fullResponse);

          // Extract redline suggestions from YELLOW and RED clauses
          const redlines = parsed.clauses
            .filter((c) => c.severity === "YELLOW" || c.severity === "RED")
            .map((c) => ({
              clause: c.clauseName,
              severity: c.severity,
              suggestion: c.content,
            }));

          // Determine the model used and tokens consumed
          const modelUsed = finalMessage.model || "claude-sonnet-4-20250514";
          const tokensUsed =
            (finalMessage.usage?.input_tokens || 0) +
            (finalMessage.usage?.output_tokens || 0);

          // Save the analysis to the database
          await db.contractAnalysis.create({
            data: {
              contractId: id,
              overallRisk: parsed.overallRisk,
              greenCount: parsed.greenCount,
              yellowCount: parsed.yellowCount,
              redCount: parsed.redCount,
              rawAnalysis: parsed.rawAnalysis,
              clauseAnalyses: JSON.stringify(parsed.clauses),
              redlineSuggestions: JSON.stringify(redlines),
              negotiationStrategy: parsed.negotiationStrategy || null,
              executiveSummary: parsed.executiveSummary || null,
              modelUsed,
              tokensUsed,
              reviewBasis: playbook?.rules.length ? "playbook" : "standard",
              playbookVersionId: playbook?.version ? String(playbook.version) : null,
            },
          });

          // Update contract status to completed
          await db.contract.update({
            where: { id },
            data: { status: "completed" },
          });

          // Send the final done event with summary data
          const doneData = JSON.stringify({
            type: "done",
            overallRisk: parsed.overallRisk,
            greenCount: parsed.greenCount,
            yellowCount: parsed.yellowCount,
            redCount: parsed.redCount,
          });
          controller.enqueue(encoder.encode(`data: ${doneData}\n\n`));

          controller.close();
        } catch (err) {
          console.error("Analysis stream error:", err);

          // Update contract status to error
          await db.contract.update({
            where: { id },
            data: { status: "error" },
          });

          const errorData = JSON.stringify({
            type: "error",
            message: err instanceof Error ? err.message : "Analysis failed",
          });
          controller.enqueue(encoder.encode(`data: ${errorData}\n\n`));
          controller.close();
        }
      },
    });

    return new Response(readableStream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    console.error("Failed to start analysis:", error);

    // Attempt to set error status if we have the contract id
    try {
      const { id } = await params;
      await db.contract.update({
        where: { id },
        data: { status: "error" },
      });
    } catch {
      // Ignore secondary error
    }

    return NextResponse.json(
      { error: "Failed to start contract analysis" },
      { status: 500 }
    );
  }
}
