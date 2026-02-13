import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionOrUnauthorized } from "@/lib/auth-utils";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { error } = await getSessionOrUnauthorized();
    if (error) return error;

    const { id } = await params;

    const client = await db.client.findUnique({
      where: { id },
    });

    if (!client) {
      return NextResponse.json(
        { error: "Client not found" },
        { status: 404 }
      );
    }

    if (!client.deleted) {
      return NextResponse.json(
        { error: "Client is not deleted" },
        { status: 400 }
      );
    }

    await db.client.update({
      where: { id },
      data: {
        deleted: false,
        deletedAt: null,
      },
    });

    return NextResponse.json({ success: true, message: "Client restored" });
  } catch (error) {
    console.error("Failed to restore client:", error);
    return NextResponse.json(
      { error: "Failed to restore client" },
      { status: 500 }
    );
  }
}
