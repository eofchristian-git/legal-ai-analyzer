import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionOrUnauthorized } from "@/lib/auth-utils";

const VALID_DECISIONS = ["ACCEPT", "NEEDS_REVIEW", "REJECT"];

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { session, error } = await getSessionOrUnauthorized();
    if (error) return error;

    const { id } = await params;

    // Load the contract's analysis
    const contract = await db.contract.findUnique({
      where: { id },
      include: { analysis: true },
    });

    if (!contract || !contract.analysis) {
      return NextResponse.json(
        { error: "Contract or analysis not found" },
        { status: 404 }
      );
    }

    if (contract.analysis.finalized) {
      return NextResponse.json(
        { error: "Analysis is finalized. Triage decisions cannot be modified." },
        { status: 403 }
      );
    }

    const body = await req.json();
    const { decisions } = body;

    if (!Array.isArray(decisions) || decisions.length === 0) {
      return NextResponse.json(
        { error: "decisions array is required" },
        { status: 400 }
      );
    }

    // Validate all decisions
    for (const d of decisions) {
      if (!d.findingId) {
        return NextResponse.json(
          { error: "Each decision must have a findingId" },
          { status: 400 }
        );
      }
      if (!VALID_DECISIONS.includes(d.triageDecision)) {
        return NextResponse.json(
          {
            error: `Invalid triageDecision: ${d.triageDecision}. Must be one of: ${VALID_DECISIONS.join(", ")}`,
          },
          { status: 400 }
        );
      }
    }

    // Verify all findings belong to this contract's analysis (include clause name for audit)
    const findingIds = decisions.map((d: { findingId: string }) => d.findingId);
    const findings = await db.analysisFinding.findMany({
      where: {
        id: { in: findingIds },
        clause: { analysisId: contract.analysis.id },
      },
      include: {
        clause: { select: { clauseName: true } },
      },
    });

    if (findings.length !== findingIds.length) {
      return NextResponse.json(
        { error: "One or more findings not found or do not belong to this contract" },
        { status: 404 }
      );
    }

    // Build a map of findingId -> clauseName for audit metadata
    const findingClauseMap = Object.fromEntries(
      findings.map((f) => [f.id, { clauseName: f.clause.clauseName, summary: f.summary }])
    );

    // Update all findings in a transaction
    const userId = session!.user.id;
    const now = new Date();

    const updates = decisions.map(
      (d: { findingId: string; triageDecision: string; triageNote?: string }) =>
        db.analysisFinding.update({
          where: { id: d.findingId },
          data: {
            triageDecision: d.triageDecision,
            triageNote: d.triageNote || null,
            triagedBy: userId,
            triagedAt: now,
          },
          select: {
            id: true,
            triageDecision: true,
            triageNote: true,
            triagedBy: true,
            triagedAt: true,
          },
        })
    );

    // Create activity log entries for each triage decision
    const activityLogs = decisions.map(
      (d: { findingId: string; triageDecision: string; triageNote?: string }) =>
        db.activityLog.create({
          data: {
            contractId: id,
            action: "finding_triaged",
            userId,
            targetType: "finding",
            targetId: d.findingId,
            metadata: JSON.stringify({
              decision: d.triageDecision,
              clauseName: findingClauseMap[d.findingId]?.clauseName,
              findingSummary: findingClauseMap[d.findingId]?.summary,
              note: d.triageNote || null,
            }),
          },
        })
    );

    const updatedFindings = await db.$transaction([...updates, ...activityLogs]);

    return NextResponse.json({
      updated: decisions.length,
      findings: updatedFindings.slice(0, decisions.length),
    });
  } catch (error) {
    console.error("Failed to update triage decisions:", error);
    return NextResponse.json(
      { error: "Failed to update triage decisions" },
      { status: 500 }
    );
  }
}
