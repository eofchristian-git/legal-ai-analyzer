import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { db } from "@/lib/db";
import { parseDocument, getFileType } from "@/lib/file-parser";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const pastedText = formData.get("text") as string | null;

    if (!file && !pastedText) {
      return NextResponse.json(
        { error: "No file or text provided" },
        { status: 400 }
      );
    }

    if (pastedText) {
      const doc = await db.document.create({
        data: {
          filename: "pasted-text.txt",
          fileType: "txt",
          filePath: "",
          extractedText: pastedText,
          fileSize: Buffer.byteLength(pastedText, "utf-8"),
          pageCount: 1,
        },
      });
      return NextResponse.json(doc);
    }

    const fileType = getFileType(file!.name);
    if (!fileType) {
      return NextResponse.json(
        { error: "Unsupported file type. Use PDF, DOCX, or TXT." },
        { status: 400 }
      );
    }

    const tempId = Date.now().toString(36);
    const uploadDir = path.join(process.cwd(), "uploads", tempId);
    await mkdir(uploadDir, { recursive: true });

    const filePath = path.join(uploadDir, file!.name);
    const buffer = Buffer.from(await file!.arrayBuffer());
    await writeFile(filePath, buffer);

    const { text, pageCount } = await parseDocument(filePath, fileType);

    const doc = await db.document.create({
      data: {
        filename: file!.name,
        fileType,
        filePath,
        extractedText: text,
        fileSize: file!.size,
        pageCount,
      },
    });

    return NextResponse.json(doc);
  } catch (error) {
    console.error("Upload error:", error);
    return NextResponse.json(
      { error: "Failed to process upload" },
      { status: 500 }
    );
  }
}
