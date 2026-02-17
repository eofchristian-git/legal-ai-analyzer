import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { buildContractReviewPrompt } from "@/lib/prompts";
import { analyzeWithClaude } from "@/lib/claude";
import { parseContractAnalysis } from "@/lib/analysis-parser";
import { getSessionOrUnauthorized } from "@/lib/auth-utils";
import fs from "fs/promises";
// Feature 008: Import document conversion utilities
import { convertDocument, detectFormat } from "@/lib/document-converter";
import { calculatePositions, injectClauseMarkers } from "@/lib/position-mapper";
import { sanitizeHTML } from "@/lib/html-sanitizer";

export const maxDuration = 180; // Allow up to 3 minutes for Claude to respond

/**
 * Feature 008: Trigger document conversion after analysis completes
 * Calls conversion functions directly (no HTTP request needed)
 */
async function triggerDocumentConversion(
  contractId: string,
  filePath: string,
  filename: string
): Promise<void> {
  try {
    console.log(`[DocConversion] Starting conversion for contract ${contractId}`);
    
    // Create ContractDocument record with 'processing' status
    await db.contractDocument.upsert({
      where: { contractId },
      create: {
        contractId,
        originalPdfPath: filePath,
        pageCount: 0,
        conversionStatus: 'processing',
      },
      update: {
        conversionStatus: 'processing',
        conversionError: null,
      },
    });
    
    // Read the file from disk
    const fileBuffer = await fs.readFile(filePath);
    
    // Detect format and convert document
    const format = detectFormat(filename);
    const conversionResult = await convertDocument({
      fileBuffer,
      format,
      contractId,
    });
    
    // Sanitize HTML
    const sanitizedHTML = sanitizeHTML(conversionResult.html);
    
    // Fetch clauses for position mapping
    const contract = await db.contract.findUnique({
      where: { id: contractId },
      include: {
        analysis: {
          include: {
            clauses: {
              include: {
                findings: true,
              },
            },
          },
        },
      },
    });
    
    if (!contract?.analysis?.clauses) {
      throw new Error('Contract has no analysis data for position mapping');
    }
    
    // Inject clause markers for position mapping
    const markedHTML = injectClauseMarkers(
      sanitizedHTML,
      contract.analysis.clauses.map(c => ({
        id: c.id,
        clauseNumber: c.clauseNumber,
        clauseText: c.clauseText,
      }))
    );
    
    // Calculate positions (using simplified algorithm for now)
    const positions = await calculatePositions({
      html: markedHTML,
      documentId: contractId,
      clauses: contract.analysis.clauses.map(c => ({
        id: c.id,
        clauseNumber: c.clauseNumber,
        clauseText: c.clauseText,
      })),
      findings: contract.analysis.clauses.flatMap(c =>
        c.findings.map(f => ({
          id: f.id,
          clauseId: c.id,
          excerpt: f.excerpt || '',
        }))
      ),
    });
    
    // Update ContractDocument with results
    await db.contractDocument.update({
      where: { contractId },
      data: {
        htmlContent: sanitizedHTML,
        pageCount: conversionResult.pageCount || 1,
        clausePositions: JSON.stringify(positions.clausePositions),
        findingPositions: JSON.stringify(positions.findingPositions),
        conversionStatus: 'completed',
        conversionError: null,
      },
    });
    
    console.log(`[DocConversion] Completed for contract ${contractId}`);
  } catch (error) {
    console.error(`[DocConversion] Failed for contract ${contractId}:`, error);
    
    // Try to update the ContractDocument status to 'failed'
    try {
      const existingDoc = await db.contractDocument.findUnique({
        where: { contractId },
      });
      
      if (existingDoc) {
        await db.contractDocument.update({
          where: { id: existingDoc.id },
          data: {
            conversionStatus: 'failed',
            conversionError: error instanceof Error ? error.message : 'Unknown error',
          },
        });
      }
    } catch (dbError) {
      console.error(`[DocConversion] Failed to update status:`, dbError);
    }
  }
}

/**
 * Run the actual analysis work in the background.
 * This is called as a fire-and-forget promise so the POST can return immediately.
 */
async function runAnalysis(id: string, userId: string | null) {
  try {
    // Load the contract with its document
    const contract = await db.contract.findUnique({
      where: { id },
      include: { document: true },
    });

    if (!contract || !contract.document.extractedText) {
      await db.contract.update({
        where: { id },
        data: { status: "error" },
      });
      return;
    }

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
            data: rulesWithGroups.map((rule: any) => ({
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

    // Log analysis start
    console.log(
      `[Analysis] Starting analysis for contract ${id} ` +
      `(formatVersion=2, documentSize=${contract.document.extractedText.length} chars, ` +
      `playbookRules=${hasPlaybookRules ? playbook.rules.length : 0})`
    );

    // Call Claude (non-streaming) and wait for the full response
    const startTime = Date.now();
    let fullResponse: string;
    try {
      fullResponse = await analyzeWithClaude({ systemPrompt, userMessage, maxTokens: 32000 });
    } catch (claudeErr) {
      console.error("Claude API error:", claudeErr);
      await db.contract.update({
        where: { id },
        data: { status: "error" },
      });
      return;
    }
    const duration = Date.now() - startTime;

    // Parse the structured JSON response
    let parsed;
    try {
      parsed = parseContractAnalysis(fullResponse);
    } catch (parseErr) {
      console.error(
        `[Analyze] Failed to parse analysis response for contract ${id}:`,
        parseErr instanceof Error ? parseErr.message : parseErr,
        `\nResponse length: ${fullResponse.length} chars`,
        `\nResponse preview: ${fullResponse.substring(0, 500)}...`
      );
      await db.contract.update({
        where: { id },
        data: { status: "error" },
      });
      return;
    }

    // Lenient validation: Log warnings but accept analysis (T048a-T048d)
    const totalFindings = parsed.clauses.reduce((sum, c) => sum + c.findings.length, 0);
    
    // T048d: Zero findings is a valid outcome (compliant contract)
    if (totalFindings === 0) {
      console.log(
        `[Analyze] Zero findings for contract ${id} - contract appears compliant with playbook rules`
      );
    }
    
    // T048c: Warn if finding count exceeds expected limit (but accept all)
    if (totalFindings > 100) {
      console.warn(
        `[Analyze] Contract ${id} has ${totalFindings} findings (exceeds typical limit of 100). ` +
        `All findings will be accepted. Consider if this is expected for a complex contract.`
      );
    }
    
    // T048a: Check for oversized excerpts (lenient - accept as-is)
    let oversizedExcerptCount = 0;
    for (const clause of parsed.clauses) {
      for (const finding of clause.findings) {
        const wordCount = finding.excerpt.split(/\s+/).length;
        if (wordCount > 80) {
          oversizedExcerptCount++;
        }
      }
    }
    if (oversizedExcerptCount > 0) {
      console.warn(
        `[Analyze] Contract ${id} has ${oversizedExcerptCount} finding(s) with excerpt >80 words. ` +
        `Accepting as-is. Consider prompt tuning to reduce excerpt size.`
      );
    }
    
    // T048b: Check for findings with no context (lenient - accept as-is)
    let noContextCount = 0;
    for (const clause of parsed.clauses) {
      for (const finding of clause.findings) {
        if (finding.context && !finding.context.before && !finding.context.after) {
          noContextCount++;
        }
      }
    }
    if (noContextCount > 0) {
      console.log(
        `[Analyze] Contract ${id} has ${noContextCount} finding(s) without context (before/after both null). ` +
        `Accepting as-is - excerpt alone is sufficient.`
      );
    }

    // Warn if no clauses were extracted (likely truncated or bad response)
    if (parsed.clauses.length === 0 && totalFindings === 0) {
      console.warn(
        `[Analyze] No clauses or findings extracted for contract ${id}. ` +
        `Raw response length: ${fullResponse.length} chars. ` +
        `Response preview: ${fullResponse.substring(0, 300)}... ` +
        `This may indicate a truncated response, parsing issue, or formatting problem.`
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
    await db.$transaction(async (tx: any) => {
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
          negotiationStrategy: parsed.negotiationStrategy || (parsed.negotiationItems.length > 0 ? "" : null),
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
          // NEW: Deviation-focused analysis fields (Feature 005)
          formatVersion: 2,  // T041: New format with flat findings and excerpts
          totalClauses: parsed.totalClauses || parsed.clauses.length,  // T042: Total clause count
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
            clauseTextFormatted: clause.clauseTextFormatted || null,
            position: clause.position,
          },
        });

        for (const finding of clause.findings) {
          // Fuzzy-match the rule title to resolve the snapshot rule ID
          const matchedRule = snapshotRules.find(
            (r: any) =>
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
              excerpt: finding.excerpt || "",
              // NEW: Deviation-focused analysis fields (Feature 005)
              contextBefore: finding.context?.before || null,  // T043
              contextAfter: finding.context?.after || null,    // T044
              locationPage: finding.location?.page || null,    // T045
              locationPosition: finding.location?.approximatePosition || null,  // T046
            },
          });
        }
      }

      // Create NegotiationItem rows from structured negotiation strategy
      if (parsed.negotiationItems && parsed.negotiationItems.length > 0) {
        for (let i = 0; i < parsed.negotiationItems.length; i++) {
          const item = parsed.negotiationItems[i];
          await tx.negotiationItem.create({
            data: {
              analysisId: analysis.id,
              priority: ["P1", "P2", "P3"].includes(item.priority) ? item.priority : "P3",
              title: item.title || "Untitled",
              description: item.description || "",
              clauseRef: item.clauseRef || null,
              position: i + 1,
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

    // T048: Log analysis completion with detailed metrics
    console.log(
      `[Analysis] Completed for contract ${id}: ` +
      `formatVersion=2, duration=${duration}ms, ` +
      `totalClauses=${parsed.totalClauses || parsed.clauses.length}, ` +
      `findingsCount=${totalFindings}, ` +
      `tokensUsed=~${Math.ceil(fullResponse.length / 4)}, ` +
      `overallRisk=${parsed.overallRisk}, ` +
      `playbook=${hasPlaybookRules ? "yes" : "no"}`
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

    // Feature 008: Trigger document conversion (fire-and-forget)
    // This will convert the document to HTML and calculate positions for the document viewer
    triggerDocumentConversion(id, contract.document.filePath, contract.document.filename).catch((err) => {
      console.error(`[Analyze] Failed to trigger document conversion for contract ${id}:`, err);
      // Don't fail the analysis if conversion fails - viewer will show error state
    });
  } catch (error) {
    console.error(`[Analyze] Background analysis failed for contract ${id}:`, error);

    // Attempt to set error status
    try {
      await db.contract.update({
        where: { id },
        data: { status: "error" },
      });
    } catch {
      // Ignore secondary error
    }
  }
}

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

    // Fire-and-forget: run the analysis in the background.
    // The client polls GET /api/contracts/[id] to detect completion.
    runAnalysis(id, userId).catch((err) => {
      console.error(`[Analyze] Unhandled error in background analysis:`, err);
    });

    return NextResponse.json(
      { success: true, status: "analyzing" },
      { status: 202 }
    );
  } catch (error) {
    console.error("Failed to start analysis:", error);

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
      { error: "Failed to start contract analysis" },
      { status: 500 }
    );
  }
}

/**
 * DELETE — Cancel / reset a stuck "analyzing" status.
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const contract = await db.contract.findUnique({
      where: { id },
      select: { status: true },
    });

    if (!contract) {
      return NextResponse.json(
        { error: "Contract not found" },
        { status: 404 }
      );
    }

    if (contract.status === "analyzing") {
      await db.contract.update({
        where: { id },
        data: { status: "error" },
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to cancel analysis:", error);
    return NextResponse.json(
      { error: "Failed to cancel analysis" },
      { status: 500 }
    );
  }
}
