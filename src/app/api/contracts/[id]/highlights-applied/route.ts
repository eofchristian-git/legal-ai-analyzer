/**
 * Highlights Applied Endpoint
 * POST /api/contracts/[id]/highlights-applied
 *
 * Called by the frontend after risk-level highlights have been baked into the
 * DOCX file via Collabora UNO commands + Action_Save. Sets the
 * `highlightsApplied` flag on the ContractAnalysis record so subsequent
 * viewer loads skip the highlighting step (highlights are already in the file).
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const { id: contractId } = await params;

    // Find the analysis for this contract
    const analysis = await db.contractAnalysis.findUnique({
      where: { contractId },
      select: { id: true, highlightsApplied: true },
    });

    if (!analysis) {
      return NextResponse.json(
        { error: "Not Found", message: "Contract analysis not found" },
        { status: 404 }
      );
    }

    if (analysis.highlightsApplied) {
      // Already marked — idempotent
      return NextResponse.json({ ok: true, alreadyApplied: true });
    }

    await db.contractAnalysis.update({
      where: { id: analysis.id },
      data: { highlightsApplied: true },
    });

    console.log(
      `[Highlights Applied] Marked highlights as applied for contract ${contractId}`
    );

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[Highlights Applied] Error:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}
