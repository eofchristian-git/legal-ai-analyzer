import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth-utils";

export async function GET() {
  try {
    const playbook = await db.playbook.findFirst({
      orderBy: { updatedAt: "desc" },
    });

    return NextResponse.json(playbook || null);
  } catch (error) {
    console.error("Failed to get playbook:", error);
    return NextResponse.json(
      { error: "Failed to get playbook" },
      { status: 500 }
    );
  }
}

export async function PUT(req: NextRequest) {
  // Only admin and legal roles can edit the playbook
  const { error: authError } = await requireRole("admin", "legal");
  if (authError) return authError;

  try {
    const body = await req.json();
    const { content } = body;

    if (!content) {
      return NextResponse.json(
        { error: "content is required" },
        { status: 400 }
      );
    }

    // Check if a playbook already exists
    const existing = await db.playbook.findFirst({
      orderBy: { updatedAt: "desc" },
    });

    if (existing) {
      // Update existing playbook and increment version
      const updated = await db.playbook.update({
        where: { id: existing.id },
        data: {
          content,
          version: existing.version + 1,
        },
      });
      return NextResponse.json(updated);
    }

    // Create a new playbook
    const playbook = await db.playbook.create({
      data: {
        content,
        version: 1,
      },
    });

    return NextResponse.json(playbook);
  } catch (error) {
    console.error("Failed to update playbook:", error);
    return NextResponse.json(
      { error: "Failed to update playbook" },
      { status: 500 }
    );
  }
}
