import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionOrUnauthorized } from "@/lib/auth-utils";

export async function GET() {
  try {
    const contracts = await db.contract.findMany({
      include: {
        document: true,
        createdByUser: { select: { id: true, name: true } },
        client: { select: { id: true, name: true, country: true } },
        analysis: {
          select: {
            id: true,
            overallRisk: true,
            greenCount: true,
            yellowCount: true,
            redCount: true,
            finalized: true,
            executiveSummary: true,
            createdAt: true,
            clauses: {
              select: {
                findings: {
                  select: {
                    id: true,
                    triageDecision: true,
                  },
                },
              },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    // Augment contracts with triage summary
    const augmented = contracts.map((contract: any) => {
      if (!contract.analysis) return {
        ...contract,
        createdByName: contract.createdByUser?.name ?? null,
        createdByUser: undefined,
        clientName: contract.client?.name ?? null,
        clientCountry: contract.client?.country ?? null,
        clientId: contract.client?.id ?? null,
        client: undefined,
      };

      const allFindings = contract.analysis.clauses.flatMap((c: any) => c.findings);
      const triagedCount = allFindings.filter((f: any) => f.triageDecision).length;

      return {
        ...contract,
        createdByName: contract.createdByUser?.name ?? null,
        createdByUser: undefined,
        clientName: contract.client?.name ?? null,
        clientCountry: contract.client?.country ?? null,
        clientId: contract.client?.id ?? null,
        client: undefined,
        analysis: {
          ...contract.analysis,
          totalFindings: allFindings.length,
          triagedCount,
          clauses: undefined, // Remove the nested clauses from list response
        },
      };
    });

    return NextResponse.json(augmented);
  } catch (error) {
    console.error("Failed to list contracts:", error);
    return NextResponse.json(
      { error: "Failed to list contracts" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const { session } = await getSessionOrUnauthorized();
    const userId = session?.user?.id ?? null;

    const body = await req.json();

    const { documentId, title, ourSide, contractType, counterparty, deadline, focusAreas, dealContext } = body;

    if (!documentId || !title || !ourSide) {
      return NextResponse.json(
        { error: "documentId, title, and ourSide are required" },
        { status: 400 }
      );
    }

    // Verify the document exists
    const document = await db.document.findUnique({
      where: { id: documentId },
    });

    if (!document) {
      return NextResponse.json(
        { error: "Document not found" },
        { status: 404 }
      );
    }

    const contract = await db.contract.create({
      data: {
        documentId,
        title,
        ourSide,
        contractType: contractType || null,
        counterparty: counterparty || null,
        deadline: deadline ? new Date(deadline) : null,
        focusAreas: focusAreas || null,
        dealContext: dealContext || null,
        status: "pending",
        createdBy: userId,
      },
      include: {
        document: true,
      },
    });

    // Write activity log
    if (userId) {
      await db.activityLog.create({
        data: {
          contractId: contract.id,
          action: "contract_created",
          userId,
          metadata: JSON.stringify({ title }),
        },
      });
    }

    return NextResponse.json(contract, { status: 201 });
  } catch (error) {
    console.error("Failed to create contract:", error);
    return NextResponse.json(
      { error: "Failed to create contract" },
      { status: 500 }
    );
  }
}
