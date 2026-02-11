import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const contract = await db.contract.findUnique({ where: { id } });
    if (!contract) {
      return NextResponse.json(
        { error: "Contract not found" },
        { status: 404 }
      );
    }

    const logs = await db.activityLog.findMany({
      where: { contractId: id },
      orderBy: { createdAt: "desc" },
      include: {
        user: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    return NextResponse.json(logs);
  } catch (error) {
    console.error("Failed to get activity log:", error);
    return NextResponse.json(
      { error: "Failed to get activity log" },
      { status: 500 }
    );
  }
}
