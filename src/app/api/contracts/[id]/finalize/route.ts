import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionOrUnauthorized } from "@/lib/auth-utils";
import { computeProjection } from "@/lib/projection";
import { FindingStatusValue } from "@/types/decisions";

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

    // Check that all findings have been resolved using the projection system (Feature 007)
    const allClauses = contract.analysis.clauses;
    let totalFindings = 0;
    let resolvedFindings = 0;
    const unresolvedFindings: string[] = [];

    for (const clause of allClauses) {
      const findings = clause.findings;
      if (findings.length === 0) continue;

      // Compute projection to get finding statuses
      const projection = await computeProjection(clause.id);
      
      for (const finding of findings) {
        totalFindings++;
        const findingStatus = projection.findingStatuses[finding.id];
        
        if (findingStatus) {
          // Check if finding is resolved
          const isResolved = 
            findingStatus.status === FindingStatusValue.ACCEPTED ||
            findingStatus.status === FindingStatusValue.RESOLVED_APPLIED_FALLBACK ||
            findingStatus.status === FindingStatusValue.RESOLVED_MANUAL_EDIT;
          
          if (isResolved) {
            resolvedFindings++;
          } else {
            unresolvedFindings.push(`${clause.clauseNumber}: ${finding.matchedRuleTitle}`);
          }
        } else {
          // No status = pending
          unresolvedFindings.push(`${clause.clauseNumber}: ${finding.matchedRuleTitle}`);
        }
      }
    }

    if (unresolvedFindings.length > 0) {
      return NextResponse.json(
        {
          error: `Cannot finalize: ${unresolvedFindings.length} finding(s) still unresolved. All findings must be resolved before finalizing.`,
          unresolvedFindings: unresolvedFindings.slice(0, 10), // Show first 10
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
          totalFindings,
          resolvedFindings,
        }),
      },
    });

    return NextResponse.json({
      finalized: true,
      finalizedAt: now.toISOString(),
      totalFindings,
      resolvedFindings,
      pending: 0,
    });
  } catch (error) {
    console.error("Failed to finalize analysis:", error);
    return NextResponse.json(
      { error: "Failed to finalize analysis" },
      { status: 500 }
    );
  }
}
