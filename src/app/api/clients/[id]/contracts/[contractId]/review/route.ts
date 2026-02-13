import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionOrUnauthorized } from "@/lib/auth-utils";
import { copyFile, mkdir } from "fs/promises";
import path from "path";

const VALID_OUR_SIDES = ["customer", "vendor", "licensor", "licensee", "partner"];

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; contractId: string }> }
) {
  try {
    const { session, error } = await getSessionOrUnauthorized();
    if (error) return error;

    const { id, contractId } = await params;
    const body = await req.json();
    const { title, ourSide } = body;

    // Validate required fields
    if (!title?.trim()) {
      return NextResponse.json(
        { error: "Title is required" },
        { status: 400 }
      );
    }

    if (!ourSide || !VALID_OUR_SIDES.includes(ourSide)) {
      return NextResponse.json(
        { error: "Invalid ourSide value. Must be one of: customer, vendor, licensor, licensee, partner" },
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

    // Load source client contract + document
    const clientContract = await db.clientContract.findFirst({
      where: { id: contractId, clientId: id },
      include: { document: true },
    });

    if (!clientContract) {
      return NextResponse.json(
        { error: "Contract attachment not found" },
        { status: 404 }
      );
    }

    const sourceDoc = clientContract.document;

    // Copy file on disk to new uploads/ subdirectory
    let newFilePath = "";
    if (sourceDoc.filePath) {
      const tempId = Date.now().toString(36);
      const newDir = path.join(process.cwd(), "uploads", tempId);
      await mkdir(newDir, { recursive: true });
      newFilePath = path.join(newDir, sourceDoc.filename);
      await copyFile(sourceDoc.filePath, newFilePath);
    }

    // Create new Document row (independent copy)
    const newDocument = await db.document.create({
      data: {
        filename: sourceDoc.filename,
        fileType: sourceDoc.fileType,
        filePath: newFilePath,
        extractedText: sourceDoc.extractedText,
        fileSize: sourceDoc.fileSize,
        pageCount: sourceDoc.pageCount,
      },
    });

    // Create new Contract (review) linked to new document and source client
    const newContract = await db.contract.create({
      data: {
        documentId: newDocument.id,
        title: title.trim(),
        ourSide,
        status: "pending",
        createdBy: session!.user.id,
        clientId: id,
      },
    });

    // Write activity log
    await db.activityLog.create({
      data: {
        contractId: newContract.id,
        action: "contract_created",
        userId: session!.user.id,
        metadata: JSON.stringify({
          title: title.trim(),
          sourceClientId: id,
          sourceClientName: client.name,
          sourceContractId: contractId,
        }),
      },
    });

    return NextResponse.json(
      {
        contractId: newContract.id,
        documentId: newDocument.id,
        message: "Review created from client contract",
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Failed to start review:", error);
    return NextResponse.json(
      { error: "Failed to start review" },
      { status: 500 }
    );
  }
}
