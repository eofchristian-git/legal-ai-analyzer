import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET() {
  try {
    const snapshots = await db.playbookSnapshot.findMany({
      orderBy: { version: "desc" },
      include: {
        _count: { select: { rules: true } },
      },
    });

    // Get user names for createdBy
    const userIds = [...new Set(snapshots.map((s: any) => s.createdBy))];
    const users = await db.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, name: true },
    });
    const userMap = Object.fromEntries(users.map((u: any) => [u.id, u.name]));

    const result = snapshots.map((s: any) => ({
      id: s.id,
      version: s.version,
      createdBy: s.createdBy,
      createdByName: userMap[s.createdBy] || "Unknown",
      createdAt: s.createdAt,
      ruleCount: s._count.rules,
    }));

    return NextResponse.json(result);
  } catch (error) {
    console.error("Failed to get playbook history:", error);
    return NextResponse.json(
      { error: "Failed to get playbook history" },
      { status: 500 }
    );
  }
}
