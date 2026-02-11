import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { buildContractReviewPrompt } from "@/lib/prompts";
import { analyzeWithClaude } from "@/lib/claude";
import { parseContractAnalysis } from "@/lib/analysis-parser";
import { getSessionOrUnauthorized } from "@/lib/auth-utils";

export const maxDuration = 120; // Allow up to 2 minutes for Claude to respond

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { session } = await getSessionOrUnauthorized();
    const userId = session?.user?.id ?? null;

    const { id } = await params;

    // Load the contract with its document
    const contract = await db.contract.findUnique({
      where: { id },
      include: { document: true },
    });

    if (!contract) {
      return NextResponse.json(
        { error: "Contract not found" },
        { status: 404 }
      );
    }

    if (!contract.document.extractedText) {
      return NextResponse.json(
        {
          error:
            "Document has no extracted text. Please upload a document with readable text content.",
        },
        { status: 400 }
      );
    }

    // Guard: reject if an analysis is already in progress
    if (contract.status === "analyzing") {
      return NextResponse.json(
        { error: "Analysis is already in progress for this contract." },
        { status: 409 }
      );
    }

    // Update status to analyzing
    await db.contract.update({
      where: { id },
      data: { status: "analyzing" },
    });

    // Load the latest playbook with active rules
    const playbook = await db.playbook.findFirst({
      include: {
        rules: { where: { deleted: false } },
        snapshots: {
          orderBy: { version: "desc" },
          take: 1,
        },
      },
    });

    // Build the prompt
    const focusAreas = contract.focusAreas
      ? JSON.parse(contract.focusAreas)
      : undefined;

    const { systemPrompt, userMessage } = await buildContractReviewPrompt({
      contractText: contract.document.extractedText,
      ourSide: contract.ourSide,
      deadline: contract.deadline?.toISOString() || undefined,
      focusAreas,
      dealContext: contract.dealContext || undefined,
      playbookRules: playbook?.rules.length ? playbook.rules : undefined,
    });

    // Look up (or auto-create) the PlaybookSnapshot for the current playbook version
    let latestSnapshot = playbook?.snapshots?.[0] ?? null;
    const hasPlaybookRules = !!(playbook?.rules.length);

    // If the playbook has rules but no snapshot exists, create one on-the-fly
    if (playbook && hasPlaybookRules && !latestSnapshot) {
      try {
        const snapshot = await db.playbookSnapshot.create({
          data: {
            playbookId: playbook.id,
            version: playbook.version,
            createdBy: playbook.updatedBy || "system",
          },
        });

        const rulesWithGroups = await db.playbookRule.findMany({
          where: { playbookId: playbook.id, deleted: false },
          include: { group: true },
        });
        if (rulesWithGroups.length > 0) {
          await db.playbookSnapshotRule.createMany({
            data: rulesWithGroups.map((rule) => ({
              snapshotId: snapshot.id,
              title: rule.title,
              description: rule.description,
              country: rule.country,
              riskLevel: rule.riskLevel,
              groupId: rule.groupId,
              groupName: rule.group?.name || null,
              standardPosition: rule.standardPosition,
              acceptableRange: rule.acceptableRange,
              escalationTrigger: rule.escalationTrigger,
              negotiationGuidance: rule.negotiationGuidance,
              originalRuleId: rule.id,
              createdBy: rule.createdBy,
              originalCreatedAt: rule.createdAt,
            })),
          });
        }

        latestSnapshot = snapshot;
        console.log(
          `Auto-created PlaybookSnapshot v${playbook.version} with ${rulesWithGroups.length} rules`
        );
      } catch (snapshotErr) {
        console.error("Failed to auto-create playbook snapshot:", snapshotErr);
      }
    }

    // Call Claude (non-streaming) and wait for the full response
    let fullResponse: string;
    try {
      fullResponse = await analyzeWithClaude({ systemPrompt, userMessage });
    } catch (claudeErr) {
      console.error("Claude API error:", claudeErr);
      await db.contract.update({
        where: { id },
        data: { status: "error" },
      });
      return NextResponse.json(
        { error: "AI analysis failed. Please try again." },
        { status: 502 }
      );
    }

    // Parse the structured JSON response
    let parsed;
    try {
      parsed = parseContractAnalysis(fullResponse);
    } catch (parseErr) {
      console.error("Failed to parse analysis response:", parseErr);
      await db.contract.update({
        where: { id },
        data: { status: "error" },
      });
      return NextResponse.json(
        {
          error:
            parseErr instanceof Error
              ? parseErr.message
              : "Failed to parse AI response",
        },
        { status: 422 }
      );
    }

    // Delete previous analysis (cascade deletes clauses + findings)
    const existingAnalysis = await db.contractAnalysis.findUnique({
      where: { contractId: id },
    });
    if (existingAnalysis) {
      await db.contractAnalysis.delete({
        where: { id: existingAnalysis.id },
      });
    }

    // Build legacy clause data for backward compat
    const legacyClauses = parsed.clauses.map((c) => ({
      clauseName: c.clauseName,
      severity:
        c.findings.length > 0
          ? c.findings.reduce(
              (worst, f) => {
                const order = { RED: 3, YELLOW: 2, GREEN: 1 };
                return order[f.riskLevel] > order[worst] ? f.riskLevel : worst;
              },
              "GREEN" as "GREEN" | "YELLOW" | "RED"
            )
          : ("GREEN" as const),
      content: c.clauseText,
    }));

    const redlines = parsed.clauses.flatMap((c) =>
      c.findings
        .filter((f) => f.riskLevel === "YELLOW" || f.riskLevel === "RED")
        .map((f) => ({
          clause: c.clauseName,
          severity: f.riskLevel,
          suggestion: f.fallbackText,
        }))
    );

    // Resolve matchedRuleId from snapshot rules
    const snapshotRules = latestSnapshot
      ? await db.playbookSnapshotRule.findMany({
          where: { snapshotId: latestSnapshot.id },
        })
      : [];

    // Save the analysis and nested clauses/findings in a single transaction
    await db.$transaction(async (tx) => {
      const analysis = await tx.contractAnalysis.create({
        data: {
          contractId: id,
          overallRisk: parsed.overallRisk,
          greenCount: parsed.greenCount,
          yellowCount: parsed.yellowCount,
          redCount: parsed.redCount,
          rawAnalysis: parsed.rawAnalysis,
          clauseAnalyses: JSON.stringify(legacyClauses),
          redlineSuggestions: JSON.stringify(redlines),
          negotiationStrategy: parsed.negotiationStrategy || null,
          executiveSummary: parsed.executiveSummary || null,
          modelUsed: "claude-sonnet-4-20250514",
          tokensUsed: 0,
          reviewBasis: playbook?.rules.length ? "playbook" : "standard",
          playbookVersionId: playbook?.version
            ? String(playbook.version)
            : null,
          playbookSnapshotId: latestSnapshot?.id ?? null,
          finalized: false,
          createdBy: userId,
        },
      });

      // Create AnalysisClause and AnalysisFinding records
      for (const clause of parsed.clauses) {
        const createdClause = await tx.analysisClause.create({
          data: {
            analysisId: analysis.id,
            clauseNumber: clause.clauseNumber || "",
            clauseName: clause.clauseName,
            clauseText: clause.clauseText,
            position: clause.position,
          },
        });

        for (const finding of clause.findings) {
          // Fuzzy-match the rule title to resolve the snapshot rule ID
          const matchedRule = snapshotRules.find(
            (r) =>
              r.title.toLowerCase() === finding.matchedRuleTitle.toLowerCase()
          );

          await tx.analysisFinding.create({
            data: {
              clauseId: createdClause.id,
              riskLevel: finding.riskLevel,
              matchedRuleTitle: finding.matchedRuleTitle,
              matchedRuleId: matchedRule?.id ?? null,
              summary: finding.summary,
              fallbackText: finding.fallbackText,
              whyTriggered: finding.whyTriggered,
            },
          });
        }
      }
    });

    // Update contract status to completed
    await db.contract.update({
      where: { id },
      data: { status: "completed" },
    });

    // Count total findings
    const totalFindings = parsed.clauses.reduce(
      (sum, c) => sum + c.findings.length,
      0
    );

    // Write activity log
    if (userId) {
      await db.activityLog.create({
        data: {
          contractId: id,
          action: "analysis_run",
          userId,
          targetType: "analysis",
          metadata: JSON.stringify({
            overallRisk: parsed.overallRisk,
            clauseCount: parsed.clauses.length,
            findingCount: totalFindings,
          }),
        },
      });
    }

    return NextResponse.json({
      success: true,
      overallRisk: parsed.overallRisk,
      greenCount: parsed.greenCount,
      yellowCount: parsed.yellowCount,
      redCount: parsed.redCount,
      clauseCount: parsed.clauses.length,
      findingCount: totalFindings,
      warning: !hasPlaybookRules
        ? "No playbook rules found. Analysis used standard review based on general best practices."
        : undefined,
    });
  } catch (error) {
    console.error("Failed to run analysis:", error);

    // Attempt to set error status
    try {
      const { id } = await params;
      await db.contract.update({
        where: { id },
        data: { status: "error" },
      });
    } catch {
      // Ignore secondary error
    }

    return NextResponse.json(
      { error: "Failed to run contract analysis" },
      { status: 500 }
    );
  }
}
