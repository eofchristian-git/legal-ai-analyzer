import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ version: string }> }
) {
  try {
    const { version } = await params;
    const versionNum = parseInt(version, 10);

    if (isNaN(versionNum)) {
      return NextResponse.json(
        { error: "Invalid version number" },
        { status: 400 }
      );
    }

    const snapshot = await db.playbookSnapshot.findFirst({
      where: { version: versionNum },
      include: { rules: { orderBy: { originalCreatedAt: "asc" } } },
    });

    if (!snapshot) {
      return NextResponse.json(
        { error: "Snapshot not found" },
        { status: 404 }
      );
    }

    // Get creator name
    const user = await db.user.findUnique({
      where: { id: snapshot.createdBy },
      select: { name: true },
    });

    return NextResponse.json({
      ...snapshot,
      createdByName: user?.name || "Unknown",
    });
  } catch (error) {
    console.error("Failed to get playbook snapshot:", error);
    return NextResponse.json(
      { error: "Failed to get playbook snapshot" },
      { status: 500 }
    );
  }
}
