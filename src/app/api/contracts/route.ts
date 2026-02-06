import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET() {
  try {
    const contracts = await db.contract.findMany({
      include: {
        document: true,
        analysis: {
          select: {
            id: true,
            overallRisk: true,
            greenCount: true,
            yellowCount: true,
            redCount: true,
            executiveSummary: true,
            createdAt: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(contracts);
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
      },
      include: {
        document: true,
      },
    });

    return NextResponse.json(contract, { status: 201 });
  } catch (error) {
    console.error("Failed to create contract:", error);
    return NextResponse.json(
      { error: "Failed to create contract" },
      { status: 500 }
    );
  }
}
