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

    // Augment the response with resolved user names and playbook version info
    const response: Record<string, unknown> = {
      ...contract,
      createdByName: contract.createdByUser?.name ?? null,
      createdByUser: undefined, // remove the nested object
    };

    if (contract.analysis) {
      const snapshot = contract.analysis.playbookSnapshot;

      // Flatten findings to include triagedByName
      const augmentedClauses = contract.analysis.clauses.map((clause) => ({
        ...clause,
        findings: clause.findings.map((finding) => ({
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
