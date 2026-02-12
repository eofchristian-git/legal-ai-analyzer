import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const contract = await db.contract.findUnique({
      where: { id },
      include: {
        document: true,
        createdByUser: { select: { id: true, name: true } },
        analysis: {
          include: {
            createdByUser: { select: { id: true, name: true } },
            finalizedByUser: { select: { id: true, name: true } },
            clauses: {
              orderBy: { position: "asc" },
              include: {
                findings: {
                  orderBy: { createdAt: "asc" },
                  include: {
                    triagedByUser: { select: { id: true, name: true } },
                    comments: {
                      orderBy: { createdAt: "asc" },
                      include: {
                        user: { select: { id: true, name: true, email: true } },
                      },
                    },
                  },
                },
              },
            },
            negotiationItems: {
              orderBy: { position: "asc" as const },
            },
            playbookSnapshot: {
              select: {
                version: true,
                playbook: {
                  select: { version: true },
                },
              },
            },
          },
        },
      },
    });

    if (!contract) {
      return NextResponse.json(
        { error: "Contract not found" },
        { status: 404 }
      );
    }

    // Auto-reset stale "analyzing" status — if more than 5 minutes have passed,
    // the analysis process is likely dead (e.g., server restart)
    const STALE_ANALYSIS_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
    if (
      contract.status === "analyzing" &&
      Date.now() - new Date(contract.updatedAt).getTime() > STALE_ANALYSIS_TIMEOUT_MS
    ) {
      await db.contract.update({
        where: { id },
        data: { status: "error" },
      });
      contract.status = "error";
    }

    // Augment the response with resolved user names and playbook version info
    const response: Record<string, unknown> = {
      ...contract,
      createdByName: contract.createdByUser?.name ?? null,
      createdByUser: undefined, // remove the nested object
    };

    if (contract.analysis) {
      const snapshot = contract.analysis.playbookSnapshot;

      // Flatten findings to include triagedByName
      const augmentedClauses = contract.analysis.clauses.map((clause: any) => ({
        ...clause,
        findings: clause.findings.map((finding: any) => ({
          ...finding,
          triagedByName: finding.triagedByUser?.name ?? null,
          triagedByUser: undefined, // remove nested object
        })),
      }));

      const analysisResponse: Record<string, unknown> = {
        ...contract.analysis,
        playbookVersion: snapshot?.version ?? null,
        currentPlaybookVersion: snapshot?.playbook?.version ?? null,
        createdByName: contract.analysis.createdByUser?.name ?? null,
        finalizedByName: contract.analysis.finalizedByUser?.name ?? null,
        clauses: augmentedClauses,
      };
      // Remove nested objects from response
      delete analysisResponse.playbookSnapshot;
      delete analysisResponse.createdByUser;
      delete analysisResponse.finalizedByUser;
      response.analysis = analysisResponse;
    }

    return NextResponse.json(response);
  } catch (error) {
    console.error("Failed to get contract:", error);
    return NextResponse.json(
      { error: "Failed to get contract" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();

    const contract = await db.contract.findUnique({
      where: { id },
    });

    if (!contract) {
      return NextResponse.json(
        { error: "Contract not found" },
        { status: 404 }
      );
    }

    const allowedFields: Record<string, unknown> = {};
    if (body.title !== undefined) allowedFields.title = body.title;
    if (body.ourSide !== undefined) allowedFields.ourSide = body.ourSide;
    if (body.contractType !== undefined) allowedFields.contractType = body.contractType || null;
    if (body.counterparty !== undefined) allowedFields.counterparty = body.counterparty || null;

    if (Object.keys(allowedFields).length === 0) {
      return NextResponse.json(
        { error: "No valid fields to update" },
        { status: 400 }
      );
    }

    const updated = await db.contract.update({
      where: { id },
      data: allowedFields,
      include: { document: true },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Failed to update contract:", error);
    return NextResponse.json(
      { error: "Failed to update contract" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const contract = await db.contract.findUnique({
      where: { id },
    });

    if (!contract) {
      return NextResponse.json(
        { error: "Contract not found" },
        { status: 404 }
      );
    }

    await db.contract.delete({
      where: { id },
    });

    return NextResponse.json({ success: true, id });
  } catch (error) {
    console.error("Failed to delete contract:", error);
    return NextResponse.json(
      { error: "Failed to delete contract" },
      { status: 500 }
    );
  }
}
