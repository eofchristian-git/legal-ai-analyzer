/**
 * @deprecated Replaced by src/lib/docx-modifier.ts (Feature 012).
 * Use /api/contracts/[id]/export-modified instead of /api/contracts/[id]/export-redline.
 */
// Feature 008: Interactive Document Viewer & Redline Export
// Generates a redline export that is the original contract with:
//   · Changes applied during triage shown as tracked changes (del/ins)
//   · Unresolved RED/YELLOW deviations annotated with a warning note
//   · Clean clauses rendered as-is

import {
  Document,
  Paragraph,
  TextRun,
  AlignmentType,
  Packer,
  BorderStyle,
  ShadingType,
  UnderlineType,
} from 'docx';
import type { TrackedChange } from '@/types/decisions';
import type { ExportMetadata } from '@/types/document-viewer';

// ============================================================================
// Types
// ============================================================================

export interface FindingExportData {
  riskLevel: 'RED' | 'YELLOW' | 'GREEN';
  summary: string;
  matchedRuleTitle: string;
  excerpt: string;
}

export interface ClauseExportData {
  clauseId: string;
  clauseName: string;
  clauseNumber: string;
  position: number;
  originalText: string | null;
  effectiveText: string | null;
  trackedChanges: TrackedChange[];
  hasChanges: boolean;
  findings: FindingExportData[];
}

export interface RedlineExportOptions {
  clauses: ClauseExportData[];
  metadata: ExportMetadata;
  format: 'docx' | 'pdf';
}

// ============================================================================
// Shared helpers
// ============================================================================

function clauseHeadingLabel(clause: ClauseExportData): string {
  if (clause.clauseNumber) {
    return `${clause.clauseNumber}.  ${clause.clauseName.toUpperCase()}`;
  }
  return clause.clauseName.toUpperCase();
}

/** Highest risk level among findings (ignoring GREEN) */
function highestRisk(findings: FindingExportData[]): 'RED' | 'YELLOW' | null {
  if (findings.some((f) => f.riskLevel === 'RED')) return 'RED';
  if (findings.some((f) => f.riskLevel === 'YELLOW')) return 'YELLOW';
  return null;
}

function buildTrackedChangeRuns(changes: TrackedChange[]): TextRun[] {
  return changes
    .filter((c) => c.text)
    .map((change) => {
      if (change.type === 'delete') {
        return new TextRun({ text: change.text, strike: true, color: 'CC0000' });
      } else if (change.type === 'insert') {
        return new TextRun({
          text: change.text,
          underline: { type: UnderlineType.SINGLE },
          bold: true,
          color: '006600',
        });
      } else {
        return new TextRun({ text: change.text });
      }
    });
}

// ============================================================================
// Word export
// ============================================================================

export async function generateWordDocument(
  options: RedlineExportOptions
): Promise<Buffer> {
  const { clauses, metadata } = options;
  const sorted = [...clauses].sort((a, b) => a.position - b.position);

  const children: Paragraph[] = [];

  // ── Contract title ─────────────────────────────────────────────────────────
  children.push(
    new Paragraph({
      children: [
        new TextRun({
          text: metadata.contractTitle.toUpperCase(),
          bold: true,
          size: 36,
          font: 'Times New Roman',
        }),
      ],
      alignment: AlignmentType.CENTER,
      spacing: { after: 120 },
    })
  );

  children.push(
    new Paragraph({
      children: [
        new TextRun({
          text: 'REDLINE VERSION',
          color: 'CC0000',
          size: 20,
          italics: true,
          bold: true,
          font: 'Times New Roman',
        }),
      ],
      alignment: AlignmentType.CENTER,
      spacing: { after: 160 },
    })
  );

  // ── Metadata ───────────────────────────────────────────────────────────────
  const dateStr = metadata.exportDate.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  const metaRuns: TextRun[] = [];
  if (metadata.counterparty) {
    metaRuns.push(
      new TextRun({ text: 'Counterparty: ', bold: true, size: 18, font: 'Times New Roman' }),
      new TextRun({ text: `${metadata.counterparty}     `, size: 18, font: 'Times New Roman' })
    );
  }
  metaRuns.push(
    new TextRun({ text: 'Reviewed by: ', bold: true, size: 18, font: 'Times New Roman' }),
    new TextRun({ text: `${metadata.reviewerName}     `, size: 18, font: 'Times New Roman' }),
    new TextRun({ text: 'Date: ', bold: true, size: 18, font: 'Times New Roman' }),
    new TextRun({ text: dateStr, size: 18, font: 'Times New Roman' })
  );
  children.push(
    new Paragraph({
      children: metaRuns,
      alignment: AlignmentType.CENTER,
      spacing: { after: 120 },
      shading: { type: ShadingType.SOLID, color: 'F5F5F5', fill: 'F5F5F5' },
    })
  );

  // ── Legend ─────────────────────────────────────────────────────────────────
  children.push(
    new Paragraph({
      children: [
        new TextRun({ text: 'Legend:  ', bold: true, size: 18, font: 'Times New Roman' }),
        new TextRun({
          text: 'deleted / original text',
          strike: true,
          color: 'CC0000',
          size: 18,
          font: 'Times New Roman',
        }),
        new TextRun({ text: '   ', size: 18 }),
        new TextRun({
          text: 'inserted / fallback text',
          underline: { type: UnderlineType.SINGLE },
          bold: true,
          color: '006600',
          size: 18,
          font: 'Times New Roman',
        }),
        new TextRun({ text: '   ', size: 18 }),
        new TextRun({
          text: '⚠ unresolved deviation',
          color: 'B45309',
          size: 18,
          font: 'Times New Roman',
          italics: true,
        }),
      ],
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
    })
  );

  // ── Divider ────────────────────────────────────────────────────────────────
  children.push(
    new Paragraph({
      border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: 'AAAAAA' } },
      spacing: { before: 60, after: 400 },
    })
  );

  // ── Contract body ──────────────────────────────────────────────────────────
  for (const clause of sorted) {
    const risk = highestRisk(clause.findings);
    const unresolvedDeviations = clause.findings.filter(
      (f) => f.riskLevel !== 'GREEN'
    );

    // Clause heading
    const headingRuns: TextRun[] = [
      new TextRun({
        text: clauseHeadingLabel(clause),
        bold: true,
        size: 24,
        font: 'Times New Roman',
      }),
    ];
    // Status indicator next to heading
    if (clause.hasChanges) {
      headingRuns.push(
        new TextRun({
          text: '  [REVISED]',
          color: '006600',
          size: 18,
          italics: true,
          font: 'Times New Roman',
        })
      );
    } else if (risk === 'RED') {
      headingRuns.push(
        new TextRun({
          text: '  [⚠ DEVIATION — UNRESOLVED]',
          color: 'CC0000',
          size: 18,
          italics: true,
          font: 'Times New Roman',
        })
      );
    } else if (risk === 'YELLOW') {
      headingRuns.push(
        new TextRun({
          text: '  [⚠ DEVIATION — REVIEW NEEDED]',
          color: 'B45309',
          size: 18,
          italics: true,
          font: 'Times New Roman',
        })
      );
    }

    children.push(
      new Paragraph({
        children: headingRuns,
        spacing: { before: 360, after: 120 },
      })
    );

    // Clause body
    if (clause.hasChanges && clause.trackedChanges.length > 0) {
      // Tracked changes: original ~~struck~~ → fallback __underlined__
      children.push(
        new Paragraph({
          children: buildTrackedChangeRuns(clause.trackedChanges),
          spacing: { after: 100 },
        })
      );
    } else {
      // Original text (unmodified)
      const text = clause.originalText || clause.effectiveText || '';
      if (text) {
        const lines = text.split(/\n+/).filter((l) => l.trim());
        // If there's an unresolved deviation, shade the paragraph
        const shadingProps =
          risk === 'RED'
            ? { type: ShadingType.SOLID, color: 'FEE2E2', fill: 'FEE2E2' }
            : risk === 'YELLOW'
            ? { type: ShadingType.SOLID, color: 'FEF3C7', fill: 'FEF3C7' }
            : undefined;

        for (const line of lines) {
          const para: Record<string, unknown> = {
            children: [new TextRun({ text: line, size: 24, font: 'Times New Roman' })],
            spacing: { after: 100 },
          };
          if (shadingProps) para.shading = shadingProps;
          children.push(new Paragraph(para));
        }
      }

      // Deviation annotation block (unresolved findings)
      if (unresolvedDeviations.length > 0 && !clause.hasChanges) {
        const annotationColor = risk === 'RED' ? 'CC0000' : 'B45309';
        const bgColor = risk === 'RED' ? 'FEE2E2' : 'FEF3C7';

        children.push(
          new Paragraph({
            children: [
              new TextRun({
                text: `⚠ DEVIATION${unresolvedDeviations.length > 1 ? 'S' : ''} IDENTIFIED — FALLBACK NOT YET APPLIED`,
                bold: true,
                color: annotationColor,
                size: 18,
                font: 'Times New Roman',
              }),
            ],
            shading: { type: ShadingType.SOLID, color: bgColor, fill: bgColor },
            spacing: { before: 60, after: 40 },
          })
        );

        for (const f of unresolvedDeviations) {
          children.push(
            new Paragraph({
              children: [
                new TextRun({
                  text: `[${f.riskLevel}] ${f.matchedRuleTitle}: `,
                  bold: true,
                  color: annotationColor,
                  size: 18,
                  font: 'Times New Roman',
                }),
                new TextRun({
                  text: f.summary,
                  color: annotationColor,
                  size: 18,
                  font: 'Times New Roman',
                }),
              ],
              shading: { type: ShadingType.SOLID, color: bgColor, fill: bgColor },
              spacing: { after: 40 },
            })
          );
        }
      }
    }
  }

  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            margin: { top: 1440, right: 1080, bottom: 1440, left: 1080 },
          },
        },
        children,
      },
    ],
    styles: {
      paragraphStyles: [
        {
          id: 'Normal',
          name: 'Normal',
          run: { font: 'Times New Roman', size: 24 },
          paragraph: { spacing: { line: 360 } },
        },
      ],
    },
  });

  const buffer = await Packer.toBuffer(doc);
  return Buffer.from(buffer);
}

// ============================================================================
// PDF export
// ============================================================================

export async function generatePDFDocument(
  options: RedlineExportOptions
): Promise<Buffer> {
  const { jsPDF } = await import('jspdf');
  const { clauses, metadata } = options;
  const sorted = [...clauses].sort((a, b) => a.position - b.position);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const doc: any = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  const pageWidth: number = doc.internal.pageSize.getWidth();
  const pageHeight: number = doc.internal.pageSize.getHeight();
  const margin = 25;
  const contentWidth = pageWidth - margin * 2;
  let y = margin;

  const checkPage = (needed = 10) => {
    if (y + needed > pageHeight - margin) {
      doc.addPage();
      y = margin;
    }
  };

  // ── Title ───────────────────────────────────────────────────────────────────
  doc.setFontSize(16);
  doc.setFont('times', 'bold');
  doc.setTextColor(20, 20, 20);
  const titleLines: string[] = doc.splitTextToSize(
    metadata.contractTitle.toUpperCase(),
    contentWidth
  );
  doc.text(titleLines, pageWidth / 2, y, { align: 'center' });
  y += titleLines.length * 8 + 2;

  doc.setFontSize(10);
  doc.setFont('times', 'bolditalic');
  doc.setTextColor(180, 0, 0);
  doc.text('REDLINE VERSION', pageWidth / 2, y, { align: 'center' });
  y += 8;

  // ── Metadata ────────────────────────────────────────────────────────────────
  const dateStr = metadata.exportDate.toLocaleDateString();
  doc.setFontSize(9);
  doc.setFont('times', 'normal');
  doc.setTextColor(80, 80, 80);
  const metaParts = [
    metadata.counterparty ? `Counterparty: ${metadata.counterparty}` : null,
    `Reviewed by: ${metadata.reviewerName}`,
    `Date: ${dateStr}`,
  ]
    .filter(Boolean)
    .join('     ');
  doc.text(metaParts, pageWidth / 2, y, { align: 'center' });
  y += 7;

  // ── Legend ──────────────────────────────────────────────────────────────────
  doc.setFontSize(8);
  let lx = margin;

  doc.setFont('times', 'bold');
  doc.setTextColor(60, 60, 60);
  doc.text('Legend: ', lx, y);
  lx += doc.getTextWidth('Legend: ');

  doc.setFont('times', 'normal');
  doc.setTextColor(180, 0, 0);
  const delText = 'deleted text';
  doc.text(delText, lx, y);
  const delW = doc.getTextWidth(delText);
  doc.setDrawColor(180, 0, 0);
  doc.line(lx, y - 1.2, lx + delW, y - 1.2);
  lx += delW + 5;

  doc.setFont('times', 'bold');
  doc.setTextColor(0, 120, 0);
  const insText = 'fallback text';
  doc.text(insText, lx, y);
  const insW = doc.getTextWidth(insText);
  doc.setDrawColor(0, 120, 0);
  doc.line(lx, y + 0.5, lx + insW, y + 0.5);
  lx += insW + 5;

  doc.setFont('times', 'italic');
  doc.setTextColor(180, 100, 0);
  doc.text('⚠ unresolved deviation', lx, y);
  y += 8;

  // ── Divider ──────────────────────────────────────────────────────────────────
  doc.setDrawColor(170, 170, 170);
  doc.setLineWidth(0.3);
  doc.line(margin, y, pageWidth - margin, y);
  y += 10;

  // ── Contract body ────────────────────────────────────────────────────────────
  for (const clause of sorted) {
    const risk = highestRisk(clause.findings);
    const unresolved = clause.findings.filter((f) => f.riskLevel !== 'GREEN');

    checkPage(20);

    // Heading
    doc.setFontSize(11);
    doc.setFont('times', 'bold');
    doc.setTextColor(20, 20, 20);
    let headingText = clauseHeadingLabel(clause);
    if (clause.hasChanges) headingText += '  [REVISED]';
    else if (risk === 'RED') headingText += '  [⚠ DEVIATION — UNRESOLVED]';
    else if (risk === 'YELLOW') headingText += '  [⚠ REVIEW NEEDED]';

    const headingColor =
      clause.hasChanges ? [0, 100, 0] : risk === 'RED' ? [150, 0, 0] : risk === 'YELLOW' ? [140, 80, 0] : [20, 20, 20];
    doc.setTextColor(...(headingColor as [number, number, number]));
    const headingLines: string[] = doc.splitTextToSize(headingText, contentWidth);
    doc.text(headingLines, margin, y);
    y += headingLines.length * 6 + 3;

    doc.setFontSize(10);
    doc.setTextColor(30, 30, 30);

    if (clause.hasChanges && clause.trackedChanges.length > 0) {
      y = renderTrackedChangesPDF(doc, clause.trackedChanges, margin, y, contentWidth, pageHeight, margin);
    } else {
      const text = clause.originalText || clause.effectiveText || '';
      if (text) {
        // Draw shaded background for deviation clauses
        if (risk !== null) {
          const bgRgb: [number, number, number] = risk === 'RED' ? [254, 226, 226] : [254, 243, 199];
          const lines: string[] = doc.splitTextToSize(text, contentWidth);
          const blockHeight = lines.length * 6 + 4;
          checkPage(blockHeight);
          doc.setFillColor(...bgRgb);
          doc.rect(margin - 2, y - 4, contentWidth + 4, blockHeight, 'F');
          doc.setTextColor(30, 30, 30);
          doc.setFont('times', 'normal');
          doc.text(lines, margin, y);
          y += blockHeight - 2;
        } else {
          doc.setFont('times', 'normal');
          const lines: string[] = doc.splitTextToSize(text, contentWidth);
          for (const line of lines) {
            checkPage(6);
            doc.text(line, margin, y);
            y += 6;
          }
        }
      }

      // Deviation annotation
      if (unresolved.length > 0 && !clause.hasChanges) {
        checkPage(10);
        const annotColor: [number, number, number] = risk === 'RED' ? [180, 0, 0] : [140, 80, 0];
        const bgRgb: [number, number, number] = risk === 'RED' ? [254, 226, 226] : [254, 243, 199];

        doc.setFont('times', 'bold');
        doc.setFontSize(8);
        doc.setTextColor(...annotColor);
        const label = `⚠ DEVIATION${unresolved.length > 1 ? 'S' : ''} — FALLBACK NOT APPLIED`;
        const labelW = doc.getTextWidth(label);
        doc.setFillColor(...bgRgb);
        doc.rect(margin - 2, y - 3, contentWidth + 4, 6, 'F');
        doc.text(label, margin, y);
        y += 7;

        doc.setFont('times', 'normal');
        doc.setFontSize(8);
        for (const f of unresolved) {
          checkPage(6);
          const line = `[${f.riskLevel}] ${f.matchedRuleTitle}: ${f.summary}`;
          const annotLines: string[] = doc.splitTextToSize(line, contentWidth);
          doc.setFillColor(...bgRgb);
          doc.rect(margin - 2, y - 3, contentWidth + 4, annotLines.length * 5 + 2, 'F');
          doc.text(annotLines, margin, y);
          y += annotLines.length * 5 + 3;
        }
      }
    }

    y += 10;
  }

  const arrayBuffer = doc.output('arraybuffer');
  return Buffer.from(arrayBuffer);
}

function renderTrackedChangesPDF(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  doc: any,
  changes: TrackedChange[],
  marginX: number,
  startY: number,
  maxWidth: number,
  pageHeight: number,
  pageMargin: number
): number {
  const lineHeight = 6;
  let currentY = startY;
  let currentX = marginX;

  const checkPage = () => {
    if (currentY + lineHeight > pageHeight - pageMargin) {
      doc.addPage();
      currentY = pageMargin;
      currentX = marginX;
    }
  };

  for (const change of changes) {
    if (!change.text) continue;

    if (change.type === 'delete') {
      doc.setTextColor(180, 0, 0);
      doc.setFont('times', 'normal');
    } else if (change.type === 'insert') {
      doc.setTextColor(0, 120, 0);
      doc.setFont('times', 'bold');
    } else {
      doc.setTextColor(30, 30, 30);
      doc.setFont('times', 'normal');
    }

    const words = change.text.split(' ');
    let lineBuffer = '';

    const flushLine = () => {
      if (!lineBuffer) return;
      checkPage();
      doc.text(lineBuffer, currentX, currentY);
      const w = doc.getTextWidth(lineBuffer);
      if (change.type === 'delete') {
        doc.setDrawColor(180, 0, 0);
        doc.line(currentX, currentY - 1.5, currentX + w, currentY - 1.5);
      } else if (change.type === 'insert') {
        doc.setDrawColor(0, 120, 0);
        doc.line(currentX, currentY + 0.8, currentX + w, currentY + 0.8);
      }
      currentY += lineHeight;
      currentX = marginX;
      lineBuffer = '';
    };

    for (const word of words) {
      const test = lineBuffer ? `${lineBuffer} ${word}` : word;
      if (currentX + doc.getTextWidth(test) > marginX + maxWidth && lineBuffer) {
        flushLine();
        lineBuffer = word;
      } else {
        lineBuffer = test;
      }
    }

    if (lineBuffer) {
      checkPage();
      const segW = doc.getTextWidth(lineBuffer);
      if (currentX + segW > marginX + maxWidth) { flushLine(); lineBuffer = change.text.trimStart(); }
      if (lineBuffer) {
        doc.text(lineBuffer, currentX, currentY);
        if (change.type === 'delete') {
          doc.setDrawColor(180, 0, 0);
          doc.line(currentX, currentY - 1.5, currentX + segW, currentY - 1.5);
        } else if (change.type === 'insert') {
          doc.setDrawColor(0, 120, 0);
          doc.line(currentX, currentY + 0.8, currentX + segW, currentY + 0.8);
        }
        currentX += segW;
        if (change.text.endsWith('\n')) { currentY += lineHeight; currentX = marginX; }
      }
    }
  }

  if (currentX > marginX) currentY += lineHeight;
  doc.setTextColor(0, 0, 0);
  doc.setFont('times', 'normal');
  return currentY;
}
