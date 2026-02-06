/* eslint-disable @typescript-eslint/no-require-imports */
import { readFile } from "fs/promises";

export async function parseDocument(
  filePath: string,
  fileType: string
): Promise<{ text: string; pageCount: number }> {
  const buffer = await readFile(filePath);

  switch (fileType) {
    case "pdf": {
      // pdf-parse has ESM compatibility issues, use dynamic require
      const { PDFParse } = require("pdf-parse");
      const parser = new PDFParse(buffer);
      const result = await parser.loadPDF(buffer);
      return {
        text: result?.text || "",
        pageCount: result?.numpages || 1,
      };
    }
    case "docx": {
      const mammoth = require("mammoth");
      const result = await mammoth.extractRawText({ buffer });
      const estimatedPages = Math.max(
        1,
        Math.ceil(result.value.length / 3000)
      );
      return {
        text: result.value,
        pageCount: estimatedPages,
      };
    }
    case "txt": {
      const text = buffer.toString("utf-8");
      return {
        text,
        pageCount: 1,
      };
    }
    default:
      throw new Error(`Unsupported file type: ${fileType}`);
  }
}

export function getFileType(filename: string): string | null {
  const ext = filename.toLowerCase().split(".").pop();
  if (ext === "pdf" || ext === "docx" || ext === "txt") {
    return ext;
  }
  return null;
}
