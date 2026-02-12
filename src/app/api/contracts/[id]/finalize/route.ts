import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionOrUnauthorized } from "@/lib/auth-utils";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { session, error } = await getSessionOrUnauthorized();
    if (error) return error;

    const userId = session!.user.id;

    const { id } = await params;

    // Load the contract's analysis with findings
    const contract = await db.contract.findUnique({
      where: { id },
      include: {
        analysis: {
          include: {
            clauses: {
              include: { findings: true },
            },
          },
        },
      },
    });

    if (!contract || !contract.analysis) {
      return NextResponse.json(
        { error: "No analysis exists for this contract" },
        { status: 400 }
      );
    }

    if (contract.analysis.finalized) {
      return NextResponse.json(
        { error: "Analysis is already finalized" },
        { status: 400 }
      );
    }

    // Check that all findings have a triage decision
    const allFindings = contract.analysis.clauses.flatMap((c: any) => c.findings);
    const pendingFindings = allFindings.filter((f: any) => !f.triageDecision);

    if (pendingFindings.length > 0) {
      return NextResponse.json(
        {
          error: `Cannot finalize: ${pendingFindings.length} finding(s) still have no triage decision. All findings must be triaged before finalizing.`,
        },
        { status: 400 }
      );
    }

    // Finalize
    const now = new Date();
    await db.contractAnalysis.update({
      where: { id: contract.analysis.id },
      data: {
        finalized: true,
        finalizedAt: now,
        finalizedBy: userId,
      },
    });

    // Write activity log
    await db.activityLog.create({
      data: {
        contractId: id,
        action: "triage_finalized",
        userId,
        targetType: "analysis",
        targetId: contract.analysis.id,
        metadata: JSON.stringify({
          totalFindings: allFindings.length,
        }),
      },
    });

    return NextResponse.json({
      finalized: true,
      finalizedAt: now.toISOString(),
      totalFindings: allFindings.length,
      triaged: allFindings.length,
      pending: 0,
    });
  } catch (error) {
    console.error("Failed to finalize triage:", error);
    return NextResponse.json(
      { error: "Failed to finalize triage" },
      { status: 500 }
    );
  }
}
