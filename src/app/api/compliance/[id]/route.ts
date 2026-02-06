import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const check = await db.complianceCheck.findUnique({
      where: { id },
      include: { document: true },
    });

    if (!check) {
      return NextResponse.json(
        { error: "Compliance check not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(check);
  } catch (error) {
    console.error("Failed to get compliance check:", error);
    return NextResponse.json(
      { error: "Failed to get compliance check" },
      { status: 500 }
    );
  }
}
