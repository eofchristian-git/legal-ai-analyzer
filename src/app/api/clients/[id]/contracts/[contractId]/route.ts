import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionOrUnauthorized } from "@/lib/auth-utils";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; contractId: string }> }
) {
  try {
    const { error } = await getSessionOrUnauthorized();
    if (error) return error;

    const { id, contractId } = await params;

    // Verify client exists
    const client = await db.client.findFirst({
      where: { id, deleted: false },
    });

    if (!client) {
      return NextResponse.json(
        { error: "Client not found" },
        { status: 404 }
      );
    }

    // Verify client contract exists
    const clientContract = await db.clientContract.findFirst({
      where: { id: contractId, clientId: id },
    });

    if (!clientContract) {
      return NextResponse.json(
        { error: "Contract attachment not found" },
        { status: 404 }
      );
    }

    // Delete the ClientContract record (cascade deletes Document)
    await db.clientContract.delete({
      where: { id: contractId },
    });

    return NextResponse.json({
      success: true,
      message: "Contract removed from client",
    });
  } catch (error) {
    console.error("Failed to remove contract:", error);
    return NextResponse.json(
      { error: "Failed to remove contract" },
      { status: 500 }
    );
  }
}
