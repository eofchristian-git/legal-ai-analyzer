import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const assessment = await db.riskAssessment.findUnique({
      where: { id },
      include: { document: true },
    });

    if (!assessment) {
      return NextResponse.json(
        { error: "Risk assessment not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(assessment);
  } catch (error) {
    console.error("Failed to get risk assessment:", error);
    return NextResponse.json(
      { error: "Failed to get risk assessment" },
      { status: 500 }
    );
  }
}
