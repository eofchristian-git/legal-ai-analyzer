import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth-utils";

const VALID_RISK_LEVELS = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];

interface RuleInput {
  title: string;
  description: string;
  country?: string | null;
  riskLevel: string;
  standardPosition: string;
  acceptableRange: string;
  escalationTrigger: string;
  negotiationGuidance: string;
  groupId?: string | null;
}

export async function POST(req: NextRequest) {
  const { error: authError, session } = await requireRole("admin", "legal");
  if (authError) return authError;

  try {
    const body = await req.json();
    const rules: RuleInput[] = body.rules;

    if (!Array.isArray(rules) || rules.length === 0) {
      return NextResponse.json(
        { error: "Cannot save an empty playbook" },
        { status: 400 }
      );
    }

    // Validate all rules
    for (let i = 0; i < rules.length; i++) {
      const r = rules[i];
      if (
        !r.title?.trim() ||
        !r.description?.trim() ||
        !r.riskLevel ||
        !r.standardPosition?.trim() ||
        !r.acceptableRange?.trim() ||
        !r.escalationTrigger?.trim() ||
        !r.negotiationGuidance?.trim()
      ) {
        return NextResponse.json(
          { error: `Rule ${i + 1} ("${r.title || "untitled"}") is missing required fields` },
          { status: 400 }
        );
      }
      if (!VALID_RISK_LEVELS.includes(r.riskLevel)) {
        return NextResponse.json(
          { error: `Rule ${i + 1} has invalid risk level: ${r.riskLevel}` },
          { status: 400 }
        );
      }
    }

    let playbook = await db.playbook.findFirst();
    if (!playbook) {
      playbook = await db.playbook.create({ data: {} });
    }

    const newVersion = playbook.version + 1;
    const userId = session!.user.id;

    // Build group name lookup for snapshot rules
    const allGroups = await db.playbookGroup.findMany();
    const groupMap = Object.fromEntries(allGroups.map((g) => [g.id, g.name]));

    const result = await db.$transaction(async (tx) => {
      // Soft-delete all current active rules
      await tx.playbookRule.updateMany({
        where: { playbookId: playbook.id, deleted: false },
        data: { deleted: true },
      });

      // Create new rules
      const createdRules = [];
      for (const r of rules) {
        const created = await tx.playbookRule.create({
          data: {
            playbookId: playbook.id,
            title: r.title.trim(),
            description: r.description.trim(),
            country: r.country || null,
            riskLevel: r.riskLevel,
            groupId: r.groupId || null,
            standardPosition: r.standardPosition.trim(),
            acceptableRange: r.acceptableRange.trim(),
            escalationTrigger: r.escalationTrigger.trim(),
            negotiationGuidance: r.negotiationGuidance.trim(),
            createdBy: userId,
            updatedBy: userId,
          },
        });
        createdRules.push(created);
      }

      // Increment version
      await tx.playbook.update({
        where: { id: playbook.id },
        data: { version: newVersion, updatedBy: userId },
      });

      // Create snapshot
      const snapshot = await tx.playbookSnapshot.create({
        data: {
          playbookId: playbook.id,
          version: newVersion,
          createdBy: userId,
        },
      });

      // Copy rules into snapshot
      await tx.playbookSnapshotRule.createMany({
        data: createdRules.map((rule) => ({
          snapshotId: snapshot.id,
          title: rule.title,
          description: rule.description,
          country: rule.country,
          riskLevel: rule.riskLevel,
          groupId: rule.groupId,
          groupName: rule.groupId ? groupMap[rule.groupId] || null : null,
          standardPosition: rule.standardPosition,
          acceptableRange: rule.acceptableRange,
          escalationTrigger: rule.escalationTrigger,
          negotiationGuidance: rule.negotiationGuidance,
          originalRuleId: rule.id,
          createdBy: rule.createdBy,
          originalCreatedAt: rule.createdAt,
        })),
      });

      return { snapshot, createdRules };
    });

    // Get user name for response
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { name: true },
    });
    const userName = user?.name || "Unknown";

    return NextResponse.json({
      version: newVersion,
      ruleCount: result.createdRules.length,
      rules: result.createdRules.map((r) => ({
        id: r.id,
        title: r.title,
        description: r.description,
        country: r.country,
        riskLevel: r.riskLevel,
        groupId: r.groupId,
        standardPosition: r.standardPosition,
        acceptableRange: r.acceptableRange,
        escalationTrigger: r.escalationTrigger,
        negotiationGuidance: r.negotiationGuidance,
        createdBy: r.createdBy,
        createdByName: userName,
        createdAt: r.createdAt,
      })),
      playbook: {
        id: playbook.id,
        version: newVersion,
        updatedByName: userName,
      },
    });
  } catch (error) {
    console.error("Failed to save playbook:", error);
    return NextResponse.json(
      { error: "Failed to save playbook" },
      { status: 500 }
    );
  }
}
