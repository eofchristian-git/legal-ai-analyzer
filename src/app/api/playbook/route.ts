import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET(req: NextRequest) {
  try {
    // Get or create singleton playbook
    let playbook = await db.playbook.findFirst();

    if (!playbook) {
      playbook = await db.playbook.create({ data: {} });
    }

    // Build rule filters
    const searchParams = req.nextUrl.searchParams;
    const search = searchParams.get("search") || "";
    const country = searchParams.get("country") || "";
    const riskLevel = searchParams.get("riskLevel") || "";

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = {
      playbookId: playbook.id,
      deleted: false,
    };

    if (search) {
      where.OR = [
        { title: { contains: search } },
        { description: { contains: search } },
      ];
    }
    if (country) {
      where.country = country;
    }
    if (riskLevel) {
      where.riskLevel = riskLevel;
    }

    const rules = await db.playbookRule.findMany({
      where,
      orderBy: { createdAt: "asc" },
    });

    // Get updatedBy user name
    let updatedByUser = null;
    if (playbook.updatedBy) {
      updatedByUser = await db.user.findUnique({
        where: { id: playbook.updatedBy },
        select: { name: true },
      });
    }

    // Get creator names for rules
    const userIds = [...new Set(rules.map((r) => r.createdBy))];
    const users = await db.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, name: true },
    });
    const userMap = Object.fromEntries(users.map((u) => [u.id, u.name]));

    const rulesWithNames = rules.map((rule) => ({
      ...rule,
      createdByName: userMap[rule.createdBy] || "Unknown",
    }));

    return NextResponse.json({
      id: playbook.id,
      version: playbook.version,
      updatedAt: playbook.updatedAt,
      updatedByName: updatedByUser?.name || null,
      rules: rulesWithNames,
    });
  } catch (error) {
    console.error("Failed to get playbook:", error);
    return NextResponse.json(
      { error: "Failed to get playbook" },
      { status: 500 }
    );
  }
}
