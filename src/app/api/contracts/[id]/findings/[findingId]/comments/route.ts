import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionOrUnauthorized } from "@/lib/auth-utils";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; findingId: string }> }
) {
  try {
    const { findingId } = await params;

    const comments = await db.findingComment.findMany({
      where: { findingId },
      orderBy: { createdAt: "asc" },
      include: {
        user: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    return NextResponse.json(comments);
  } catch (error) {
    console.error("Failed to get comments:", error);
    return NextResponse.json(
      { error: "Failed to get comments" },
      { status: 500 }
    );
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; findingId: string }> }
) {
  try {
    const { session, error } = await getSessionOrUnauthorized();
    if (error) return error;

    const { id, findingId } = await params;
    const body = await req.json();
    const { content } = body;

    if (!content || typeof content !== "string" || !content.trim()) {
      return NextResponse.json(
        { error: "Comment content is required" },
        { status: 400 }
      );
    }

    // Verify finding exists and belongs to this contract
    const finding = await db.analysisFinding.findUnique({
      where: { id: findingId },
      include: {
        clause: {
          include: {
            analysis: {
              select: { contractId: true },
            },
          },
        },
      },
    });

    if (!finding || finding.clause.analysis.contractId !== id) {
      return NextResponse.json(
        { error: "Finding not found or does not belong to this contract" },
        { status: 404 }
      );
    }

    const userId = session!.user.id;

    // Create comment and activity log in a transaction
    const [comment] = await db.$transaction([
      db.findingComment.create({
        data: {
          findingId,
          userId,
          content: content.trim(),
        },
        include: {
          user: {
            select: { id: true, name: true, email: true },
          },
        },
      }),
      db.activityLog.create({
        data: {
          contractId: id,
          action: "comment_added",
          userId,
          targetType: "finding",
          targetId: findingId,
          metadata: JSON.stringify({
            clauseName: finding.clause.clauseName,
            findingSummary: finding.summary,
          }),
        },
      }),
    ]);

    return NextResponse.json(comment, { status: 201 });
  } catch (error) {
    console.error("Failed to create comment:", error);
    return NextResponse.json(
      { error: "Failed to create comment" },
      { status: 500 }
    );
  }
}
