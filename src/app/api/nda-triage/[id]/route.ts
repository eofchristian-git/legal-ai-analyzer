import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const triage = await db.ndaTriage.findUnique({
      where: { id },
      include: { document: true },
    });

    if (!triage) {
      return NextResponse.json(
        { error: "NDA triage not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(triage);
  } catch (error) {
    console.error("Failed to get NDA triage:", error);
    return NextResponse.json(
      { error: "Failed to get NDA triage" },
      { status: 500 }
    );
  }
}
