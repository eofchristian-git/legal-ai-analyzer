import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET() {
  try {
    const analyses = await db.contractAnalysis.findMany({
      take: 20,
      orderBy: { createdAt: "desc" },
      include: {
        contract: { select: { title: true, status: true } },
      },
    });

    const result = analyses.map((a) => ({
      id: a.id,
      contractTitle: a.contract.title,
      contractStatus: a.contract.status,
      overallRisk: a.overallRisk,
      reviewBasis: a.reviewBasis,
      playbookVersionId: a.playbookVersionId,
      createdAt: a.createdAt,
    }));

    return NextResponse.json(result);
  } catch (error) {
    console.error("Failed to get playbook analyses:", error);
    return NextResponse.json(
      { error: "Failed to get playbook analyses" },
      { status: 500 }
    );
  }
}
