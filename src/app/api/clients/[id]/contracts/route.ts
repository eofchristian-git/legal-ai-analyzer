import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionOrUnauthorized } from "@/lib/auth-utils";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { error } = await getSessionOrUnauthorized();
    if (error) return error;

    const { id } = await params;

    // Verify client exists and not soft-deleted
    const client = await db.client.findFirst({
      where: { id, deleted: false },
    });

    if (!client) {
      return NextResponse.json(
        { error: "Client not found" },
        { status: 404 }
      );
    }

    const contracts = await db.clientContract.findMany({
      where: { clientId: id },
      include: {
        document: {
          select: {
            id: true,
            filename: true,
            fileType: true,
            fileSize: true,
            pageCount: true,
            createdAt: true,
          },
        },
        uploadedByUser: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    const result = contracts.map((c) => ({
      ...c,
      uploadedByName: c.uploadedByUser?.name ?? null,
      uploadedByUser: undefined,
    }));

    return NextResponse.json(result);
  } catch (error) {
    console.error("Failed to list client contracts:", error);
    return NextResponse.json(
      { error: "Failed to list client contracts" },
      { status: 500 }
    );
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { session, error } = await getSessionOrUnauthorized();
    if (error) return error;

    const { id } = await params;
    const body = await req.json();
    const { documentId, title } = body;

    if (!documentId) {
      return NextResponse.json(
        { error: "documentId is required" },
        { status: 400 }
      );
    }

    // Verify client exists and not soft-deleted
    const client = await db.client.findFirst({
      where: { id, deleted: false },
    });

    if (!client) {
      return NextResponse.json(
        { error: "Client not found" },
        { status: 404 }
      );
    }

    // Verify document exists
    const document = await db.document.findUnique({
      where: { id: documentId },
    });

    if (!document) {
      return NextResponse.json(
        { error: "Document not found" },
        { status: 400 }
      );
    }

    // Check for duplicate
    const existing = await db.clientContract.findUnique({
      where: {
        clientId_documentId: {
          clientId: id,
          documentId,
        },
      },
    });

    if (existing) {
      return NextResponse.json(
        { error: "Document already attached to this client" },
        { status: 409 }
      );
    }

    const clientContract = await db.clientContract.create({
      data: {
        clientId: id,
        documentId,
        title: title?.trim() || null,
        uploadedBy: session!.user.id,
      },
      include: {
        document: {
          select: {
            id: true,
            filename: true,
            fileType: true,
            fileSize: true,
            pageCount: true,
          },
        },
      },
    });

    return NextResponse.json(clientContract, { status: 201 });
  } catch (error) {
    console.error("Failed to attach contract:", error);
    return NextResponse.json(
      { error: "Failed to attach contract" },
      { status: 500 }
    );
  }
}
