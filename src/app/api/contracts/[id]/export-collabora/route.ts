/**
 * @deprecated Collabora export endpoint. Deprecated by Feature 012.
 * Use /api/contracts/[id]/export-modified for the new original-file export with Track Changes.
 */
import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import { db } from "@/lib/db";
import { getSessionOrUnauthorized } from "@/lib/auth-utils";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, error } = await getSessionOrUnauthorized();
  if (error) return error;
  void session;

  const { id } = await params;

  const contract = await db.contract.findUnique({
    where: { id },
    include: {
      document: true,
      analysis: { select: { finalized: true } },
    },
  });

  if (!contract || !contract.document) {
    return NextResponse.json({ error: "Not Found" }, { status: 404 });
  }

  if (!contract.analysis?.finalized) {
    return NextResponse.json(
      { error: "Contract review is not finalized yet." },
      { status: 403 }
    );
  }

  let fileBuffer: Buffer;
  try {
    fileBuffer = await fs.readFile(contract.document.filePath);
  } catch {
    return NextResponse.json(
      { error: "Failed to read document file" },
      { status: 500 }
    );
  }

  const safeTitle = contract.title.replace(/[^a-z0-9]/gi, "-").toLowerCase();

  return new NextResponse(new Uint8Array(fileBuffer), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${safeTitle}-redline.docx"`,
      "Content-Length": fileBuffer.length.toString(),
    },
  });
}
