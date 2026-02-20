/**
 * PDF Export — Feature 012 (T034 / US6)
 * Generates an annotated PDF using pdf-lib, baking in visual overlays:
 *  - Colored risk highlight rectangles
 *  - Red strikethrough lines over original text
 *  - Green replacement text boxes
 *  - Note annotations
 *
 * Requires the PDF conversion pipeline (Phase 2) to have run first.
 */

import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { db } from '@/lib/db';
import { computeProjection } from '@/lib/projection';
import fs from 'fs/promises';
import type { FindingPdfMapping } from '@/types/pdf-viewer';

const RISK_COLORS = {
  RED: { r: 0.94, g: 0.27, b: 0.27, a: 0.18 },
  YELLOW: { r: 0.92, g: 0.70, b: 0.03, a: 0.22 },
  GREEN: { r: 0.13, g: 0.77, b: 0.37, a: 0.18 },
} as const;

/**
 * Generate an annotated PDF with risk highlights, strikethrough, replacement text, and notes.
 * @param contractId The contract ID
 * @param pdfPath    Absolute path to the converted PDF
 * @returns Buffer containing the annotated PDF
 */
export async function generateAnnotatedPdf(
  contractId: string,
  pdfPath: string
): Promise<Buffer> {
  // Load the contract with analysis and position mappings
  const contract = await db.contract.findUnique({
    where: { id: contractId },
    include: {
      contractDocument: true,
      analysis: {
        include: {
          clauses: {
            include: { findings: true },
          },
        },
      },
    },
  });

  if (!contract) throw new Error('Contract not found');

  const doc = contract.contractDocument;
  if (!doc?.findingPositionMappings) {
    throw new Error('PDF position mappings not available');
  }

  const findingMappings: FindingPdfMapping[] = JSON.parse(doc.findingPositionMappings);

  // Load the PDF
  const pdfBytes = await fs.readFile(pdfPath);
  const pdfDoc = await PDFDocument.load(pdfBytes);
  const pages = pdfDoc.getPages();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

  // Build a map of findingId → projection data
  const findingProjections = new Map<string, {
    replacementText: string | null;
    notes: string[];
  }>();

  for (const clause of contract.analysis?.clauses ?? []) {
    try {
      const projection = await computeProjection(clause.id);
      for (const finding of clause.findings) {
        const status = projection.findingStatuses[finding.id];
        if (status) {
          findingProjections.set(finding.id, {
            replacementText: status.replacementText,
            notes: status.notes.map((n) => n.text),
          });
        }
      }
    } catch {
      // Skip projection errors
    }
  }

  // Draw annotations on each page
  for (const mapping of findingMappings) {
    if (mapping.unmapped || mapping.rects.length === 0) continue;

    const page = pages[mapping.pageIndex];
    if (!page) continue;

    const { height: pageHeight } = page.getSize();
    const proj = findingProjections.get(mapping.findingId);
    const hasAppliedFallback = !!proj?.replacementText;

    for (const rect of mapping.rects) {
      // Convert from top-down coordinates to PDF bottom-up coordinates
      const pdfY = pageHeight - rect.y - rect.height;

      if (hasAppliedFallback) {
        // Draw strikethrough line (red)
        page.drawLine({
          start: { x: rect.x, y: pdfY + rect.height / 2 },
          end: { x: rect.x + rect.width, y: pdfY + rect.height / 2 },
          thickness: 1.5,
          color: rgb(0.94, 0.27, 0.27),
          opacity: 0.9,
        });
      } else {
        // Draw risk highlight rectangle
        const color = RISK_COLORS[mapping.riskLevel] ?? RISK_COLORS.YELLOW;
        page.drawRectangle({
          x: rect.x,
          y: pdfY,
          width: rect.width,
          height: rect.height,
          color: rgb(color.r, color.g, color.b),
          opacity: color.a,
        });
      }
    }

    // Draw replacement text box for applied fallbacks
    if (hasAppliedFallback && proj?.replacementText) {
      const lastRect = mapping.rects[mapping.rects.length - 1];
      const pdfY = pageHeight - lastRect.y - lastRect.height;
      const annotY = pdfY - 20; // Below the last rect

      const maxTextWidth = Math.min(300, lastRect.width * 2);
      const truncated =
        proj.replacementText.length > 100
          ? proj.replacementText.slice(0, 100) + '…'
          : proj.replacementText;

      page.drawRectangle({
        x: lastRect.x - 2,
        y: annotY - 14,
        width: Math.min(maxTextWidth, truncated.length * 5.5 + 8),
        height: 18,
        color: rgb(0.94, 0.99, 0.95),
        borderColor: rgb(0.13, 0.77, 0.37),
        borderWidth: 1,
        opacity: 0.97,
      });

      page.drawText(`↳ ${truncated}`, {
        x: lastRect.x + 2,
        y: annotY - 10,
        size: 7,
        font,
        color: rgb(0.09, 0.39, 0.21),
        maxWidth: maxTextWidth - 8,
      });
    }

    // Draw note annotations (if any)
    if (proj?.notes && proj.notes.length > 0) {
      const firstRect = mapping.rects[0];
      const pdfY = pageHeight - firstRect.y;

      const noteText = proj.notes[0].slice(0, 80) + (proj.notes[0].length > 80 ? '…' : '');
      page.drawText(`📝 ${noteText}`, {
        x: Math.min(firstRect.x + firstRect.width + 5, pages[mapping.pageIndex].getSize().width - 120),
        y: pdfY - 6,
        size: 6,
        font,
        color: rgb(0.48, 0.22, 0.0),
        maxWidth: 120,
      });
    }
  }

  const modifiedPdfBytes = await pdfDoc.save();
  return Buffer.from(modifiedPdfBytes);
}
