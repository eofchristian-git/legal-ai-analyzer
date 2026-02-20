/**
 * PDF Pipeline — Feature 012
 * Server-side DOCX → PDF conversion + text position extraction.
 *
 * Functions:
 *  - convertDocxToPdf(): LibreOffice headless CLI
 *  - extractTextPositions(): pdfjs-dist text content extraction
 *  - runPdfPipeline(): orchestrates convert → extract → map → save
 *
 * LibreOffice prerequisite (local dev):
 *   Install LibreOffice and ensure `soffice` is on PATH.
 *   Verify: soffice --version
 *
 * Docker dev:
 *   Add to docker-compose.yml:
 *     libreofficeworker:
 *       image: linuxserver/libreoffice:latest
 *   Or use a combined image that includes LibreOffice headless.
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs/promises';
import { db } from '@/lib/db';
import { mapExcerptToPositions } from '@/lib/pdf-position-mapper';
import type { TextPosition, ClausePdfMapping, FindingPdfMapping } from '@/types/pdf-viewer';

const execAsync = promisify(exec);

const SOFFICE_TIMEOUT_MS = 120_000; // 2 minutes for conversion

/** Common LibreOffice executable paths across platforms */
const SOFFICE_CANDIDATES = [
  'soffice',                                                         // on PATH
  'C:\\Program Files\\LibreOffice\\program\\soffice.exe',           // Windows default
  'C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe',     // Windows 32-bit
  '/usr/bin/soffice',                                                // Linux
  '/usr/lib/libreoffice/program/soffice',                           // Linux alt
  '/Applications/LibreOffice.app/Contents/MacOS/soffice',           // macOS
];

/** Find the first working soffice executable */
async function findSoffice(): Promise<string> {
  for (const candidate of SOFFICE_CANDIDATES) {
    if (path.isAbsolute(candidate)) {
      // For absolute paths, just check the file exists — don't try to run it
      // (LibreOffice on Windows can be slow/unreliable with --version in a spawned shell)
      try {
        await fs.access(candidate);
        return candidate;
      } catch {
        // file doesn't exist, try next
      }
    } else {
      // For bare names like "soffice", probe via --version
      try {
        await execAsync(`"${candidate}" --version`, { timeout: 5000 });
        return candidate;
      } catch {
        // not on PATH, try next
      }
    }
  }
  throw new Error(
    'LibreOffice not found. Install LibreOffice (https://www.libreoffice.org/download/) ' +
    'or add "soffice" to your PATH. ' +
    `Searched: ${SOFFICE_CANDIDATES.slice(0, 3).join(', ')}, …`
  );
}

/**
 * Convert a DOCX file to PDF using LibreOffice headless.
 * @param docxPath Absolute path to the DOCX file
 * @param outputDir Directory to write the PDF (defaults to same directory as DOCX)
 * @returns Absolute path to the generated PDF file
 * @throws Error if LibreOffice is not available or conversion fails
 */
export async function convertDocxToPdf(
  docxPath: string,
  outputDir?: string
): Promise<string> {
  const dir = outputDir ?? path.dirname(docxPath);
  const basename = path.basename(docxPath, path.extname(docxPath));
  const expectedPdfPath = path.join(dir, `${basename}.pdf`);

  const soffice = await findSoffice();

  // Run conversion
  const cmd = `"${soffice}" --headless --convert-to pdf --outdir "${dir}" "${docxPath}"`;
  try {
    await execAsync(cmd, { timeout: SOFFICE_TIMEOUT_MS });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`LibreOffice conversion failed: ${msg}`);
  }

  // Verify output exists
  try {
    await fs.access(expectedPdfPath);
  } catch {
    throw new Error(
      `LibreOffice completed but PDF not found at expected path: ${expectedPdfPath}`
    );
  }

  return expectedPdfPath;
}

/**
 * Extract text positions from a PDF file using pdfjs-dist.
 * Coordinate system is flipped to top-down (origin: top-left).
 * @param pdfPath Absolute path to the PDF file
 * @returns Array of TextPosition objects with page coordinates
 */
/**
 * Extract text positions by running a standalone child process.
 * This avoids Next.js Turbopack bundling pdfjs-dist (which breaks its worker resolution).
 * Returns both the positions array and the page count.
 */
export async function extractTextPositions(pdfPath: string): Promise<{ positions: TextPosition[]; pageCount: number }> {
  const scriptPath = path.resolve(process.cwd(), 'scripts/extract-pdf-positions.mjs');
  const { stdout } = await execAsync(`node "${scriptPath}" "${pdfPath}"`, {
    timeout: 60_000,
    maxBuffer: 50 * 1024 * 1024, // 50 MB — large PDFs produce lots of positions
  });
  return JSON.parse(stdout) as { positions: TextPosition[]; pageCount: number };
}

/**
 * Orchestrate the full PDF pipeline for a contract:
 *   1. Convert DOCX → PDF (LibreOffice)
 *   2. Extract text positions (pdfjs-dist)
 *   3. Map clause excerpts to positions
 *   4. Map finding excerpts to positions
 *   5. Save all results to ContractDocument
 *
 * Updates pdfConversionStatus at each stage.
 * Non-blocking: caller should fire-and-forget with .catch().
 */
export async function runPdfPipeline(contractId: string): Promise<void> {
  // Load the contract with its document and analysis
  const contract = await db.contract.findUnique({
    where: { id: contractId },
    include: {
      document: true,
      analysis: {
        include: {
          clauses: {
            include: { findings: true },
          },
        },
      },
    },
  });

  if (!contract?.document) {
    console.error(`[PdfPipeline] Contract ${contractId} has no document`);
    return;
  }

  const filePath = contract.document.filePath;
  const filename = contract.document.filename;

  const isDocx =
    filename.endsWith('.docx') ||
    filename.endsWith('.doc') ||
    contract.document.fileType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

  const isPdf =
    filename.endsWith('.pdf') ||
    contract.document.fileType === 'application/pdf';

  if (!isDocx && !isPdf) {
    console.log(`[PdfPipeline] Skipping — unsupported file type: ${filename}`);
    await updateStatus(contractId, 'failed', 'PDF viewer is only available for DOCX and PDF files.');
    return;
  }

  // Ensure ContractDocument record exists
  await db.contractDocument.upsert({
    where: { contractId },
    create: {
      contractId,
      originalPdfPath: filePath,
      pageCount: 0,
      pdfConversionStatus: isPdf ? 'extracting' : 'converting',
    },
    update: {
      pdfConversionStatus: isPdf ? 'extracting' : 'converting',
      pdfConversionError: null,
    },
  });

  let pdfPath: string;

  if (isPdf) {
    // PDF files can be used directly — no LibreOffice needed
    console.log(`[PdfPipeline] Using uploaded PDF directly for contract ${contractId}`);
    pdfPath = filePath;
  } else {
    // Stage 1: Convert DOCX → PDF via LibreOffice
    try {
      console.log(`[PdfPipeline] Converting DOCX → PDF for contract ${contractId}`);
      pdfPath = await convertDocxToPdf(filePath);
      console.log(`[PdfPipeline] PDF created at ${pdfPath}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[PdfPipeline] Conversion failed for contract ${contractId}: ${msg}`);
      await updateStatus(contractId, 'failed', msg);
      return;
    }
  }

  await updateStatus(contractId, 'extracting');

  // Stage 2: Extract text positions (runs in a child process to avoid Next.js bundling issues)
  let textPositions: TextPosition[];
  let pageCount: number;
  try {
    console.log(`[PdfPipeline] Extracting text positions for contract ${contractId}`);
    const result = await extractTextPositions(pdfPath);
    textPositions = result.positions;
    pageCount = result.pageCount;
    console.log(`[PdfPipeline] Extracted ${textPositions.length} text positions across ${pageCount} pages`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[PdfPipeline] Text extraction failed for contract ${contractId}: ${msg}`);
    await updateStatus(contractId, 'failed', msg);
    return;
  }

  await updateStatus(contractId, 'mapping');

  // Stage 3: Map clause and finding excerpts
  const clauses = contract.analysis?.clauses ?? [];
  const clauseMappings: ClausePdfMapping[] = [];
  const findingMappings: FindingPdfMapping[] = [];

  for (const clause of clauses) {
    const searchText = clause.clauseName;
    const result = mapExcerptToPositions(searchText, textPositions, clause.clauseText ?? '');

    clauseMappings.push({
      clauseId: clause.id,
      pageIndex: result.pageIndex,
      startRect: result.rects[0] ?? { x: 0, y: 0, width: 0, height: 0 },
      confidence: result.confidence,
      unmapped: result.unmapped,
    });

    for (const finding of clause.findings) {
      if (!finding.excerpt) continue;

      const fResult = mapExcerptToPositions(
        finding.excerpt,
        textPositions,
        clause.clauseText ?? ''
      );

      findingMappings.push({
        findingId: finding.id,
        clauseId: clause.id,
        riskLevel: finding.riskLevel as 'RED' | 'YELLOW' | 'GREEN',
        pageIndex: fResult.pageIndex,
        rects: fResult.rects,
        confidence: fResult.confidence,
        unmapped: fResult.unmapped,
      });
    }
  }

  // Stage 4: Save results
  await db.contractDocument.update({
    where: { contractId },
    data: {
      pdfPath,
      pdfPageCount: pageCount,
      textPositions: JSON.stringify(textPositions),
      clausePositionMappings: JSON.stringify(clauseMappings),
      findingPositionMappings: JSON.stringify(findingMappings),
      pdfConversionStatus: 'completed',
      pdfConversionError: null,
    },
  });

  console.log(
    `[PdfPipeline] Completed for contract ${contractId}: ` +
    `${pageCount} pages, ${clauseMappings.length} clauses mapped, ` +
    `${findingMappings.filter(f => !f.unmapped).length}/${findingMappings.length} findings mapped`
  );
}

async function updateStatus(
  contractId: string,
  status: string,
  error?: string
): Promise<void> {
  await db.contractDocument.update({
    where: { contractId },
    data: {
      pdfConversionStatus: status,
      ...(error !== undefined ? { pdfConversionError: error } : {}),
    },
  }).catch((err) => {
    console.error(`[PdfPipeline] Failed to update status for ${contractId}:`, err);
  });
}
