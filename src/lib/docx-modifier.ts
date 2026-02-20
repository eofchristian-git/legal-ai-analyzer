/**
 * DOCX Modifier — Feature 012
 * Server-side DOCX XML manipulation for the "Original with Changes" export.
 *
 * Injects visual redline formatting and Word Comments into the original
 * uploaded DOCX file, preserving all original formatting.
 *
 * Key design choices:
 *  - Visual formatting (not native track changes) for reliable colors:
 *      deleted text → <w:strike/> + <w:color w:val="FF0000"/> (red)
 *      inserted text → <w:u w:val="single"/> + <w:color w:val="00B050"/> (green)
 *    Word overrides <w:color> inside <w:del>/<w:ins> with the author's single
 *    revision color, so native track changes cannot guarantee two distinct colors.
 *  - Author: "Legal AI Analyzer" (hardcoded per spec clarification C3)
 *  - fast-xml-parser options: preserveOrder:true, ignoreAttributes:false, trimValues:false
 *  - jszip for unzip/rezip
 *
 * Functions:
 *  findTextInDocXml()       — find excerpt in <w:t> runs
 *  splitRunAtOffset()       — split a <w:r> at character boundary
 *  injectTrackedChange()    — apply visual del (strike+red) + ins (underline+green)
 *  buildCommentsXml()       — generate word/comments.xml
 *  ensureCommentsRelationship() — add comments.xml to content types + rels
 *  modifyOriginalDocx()     — orchestrate the full export
 */

import JSZip from 'jszip';
import { XMLParser, XMLBuilder } from 'fast-xml-parser';
import { db } from '@/lib/db';
import { computeProjection } from '@/lib/projection';
import fs from 'fs/promises';

const AUTHOR = 'Legal AI Analyzer';

// XML parser options that preserve document fidelity
const PARSER_OPTIONS = {
  preserveOrder: true,
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  trimValues: false,
  parseAttributeValue: false,
  processEntities: true,
};

const BUILDER_OPTIONS = {
  preserveOrder: true,
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  format: false,
  processEntities: true,
};

/** Text run information from the parsed document */
interface RunInfo {
  paragraphIndex: number;
  runIndex: number;
  text: string;
  charStart: number; // absolute character offset within paragraph text
  charEnd: number;
}

/** Match result from findTextInDocXml */
interface ExcerptMatch {
  paragraphIndex: number;
  runs: RunInfo[];
  matchStart: number; // char offset within para text
  matchEnd: number;
}

/** Normalize text for comparison: collapse whitespace + unify smart quotes/dashes */
function normalizeForMatch(text: string): string {
  return text
    // Smart single quotes → ASCII apostrophe
    .replace(/[\u2018\u2019\u201A\u201B\u2032\u2035]/g, "'")
    // Smart double quotes → ASCII quote
    .replace(/[\u201C\u201D\u201E\u201F\u2033\u2036]/g, '"')
    // Em-dash / en-dash → hyphen
    .replace(/[\u2013\u2014\u2015]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/**
 * T024: Find excerpt text in word/document.xml paragraphs.
 * Concatenates <w:t> content across <w:r> runs per <w:p>.
 * Returns match info including which runs cover the excerpt.
 *
 * Disambiguation: if multiple matches, prefer the one whose context matches clauseText.
 */
export function findTextInDocXml(
  parsedXml: unknown[],
  excerpt: string,
  clauseText: string = ''
): ExcerptMatch | null {
  const normalizedExcerpt = normalizeForMatch(excerpt);
  const normalizedClause = normalizeForMatch(clauseText);

  // Extract paragraphs from the body
  const body = getBodyElement(parsedXml);
  if (!body) return null;

  const paragraphs = getParagraphs(body);
  const candidates: ExcerptMatch[] = [];

  for (let pIdx = 0; pIdx < paragraphs.length; pIdx++) {
    const para = paragraphs[pIdx];
    const runs = getRunsFromParagraph(para, pIdx);

    // Build the full paragraph text
    let paraText = '';
    for (const run of runs) {
      paraText += run.text;
    }

    const normalizedPara = normalizeForMatch(paraText);

    // Try the full excerpt first; if it overruns the paragraph (excerpt spans multiple
    // paragraphs) fall back to the first 150 chars — enough to uniquely locate the clause.
    let matchIdx = normalizedPara.indexOf(normalizedExcerpt);
    let effectiveExcerptLen = normalizedExcerpt.length;
    if (matchIdx === -1 && normalizedExcerpt.length > 150) {
      const shortExcerpt = normalizedExcerpt.slice(0, 150);
      matchIdx = normalizedPara.indexOf(shortExcerpt);
      if (matchIdx !== -1) effectiveExcerptLen = shortExcerpt.length;
    }

    if (matchIdx === -1) continue;

    // Found a match — determine which runs cover [matchIdx, matchIdx + effectiveExcerptLen]
    const matchStart = matchIdx;
    const matchEnd = matchStart + effectiveExcerptLen;

    const coveredRuns = runs.filter(
      (r) => r.charEnd > matchStart && r.charStart < matchEnd
    );

    candidates.push({ paragraphIndex: pIdx, runs: coveredRuns, matchStart, matchEnd });
  }

  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];

  // Disambiguate: prefer match in a paragraph that contains clause text
  if (clauseText) {
    for (const candidate of candidates) {
      const para = paragraphs[candidate.paragraphIndex];
      const runs = getRunsFromParagraph(para, candidate.paragraphIndex);
      const paraText = runs.map((r) => r.text).join('');
      if (normalizeForMatch(paraText).includes(normalizedClause.slice(0, 50))) {
        return candidate;
      }
    }
  }

  // Fall back to first match
  console.warn(`[DocxModifier] Multiple matches for excerpt "${excerpt.slice(0, 40)}..." — using first`);
  return candidates[0];
}

/** Extract the <w:body> element from parsed XML */
function getBodyElement(parsed: unknown[]): unknown[] | null {
  // Look for w:document > w:body
  for (const node of parsed as Record<string, unknown>[]) {
    if (node['w:document']) {
      const doc = node['w:document'] as unknown[];
      for (const child of doc) {
        if ((child as Record<string, unknown>)['w:body']) {
          return (child as Record<string, unknown>)['w:body'] as unknown[];
        }
      }
    }
  }
  return null;
}

/** Get all <w:p> elements from body */
function getParagraphs(body: unknown[]): unknown[][] {
  const result: unknown[][] = [];
  for (const node of body as Record<string, unknown>[]) {
    if (node['w:p']) {
      result.push(node['w:p'] as unknown[]);
    }
  }
  return result;
}

/** Extract run info from a paragraph */
function getRunsFromParagraph(para: unknown[], paraIdx: number): RunInfo[] {
  const runs: RunInfo[] = [];
  let charOffset = 0;

  for (let rIdx = 0; rIdx < (para as Record<string, unknown>[]).length; rIdx++) {
    const node = (para as Record<string, unknown>[])[rIdx];
    if (!node['w:r']) continue;

    const runChildren = node['w:r'] as Record<string, unknown>[];
    let text = '';

    for (const child of runChildren) {
      if (child['w:t']) {
        const tNodes = child['w:t'] as Record<string, unknown>[];
        for (const tNode of tNodes) {
          if (typeof tNode === 'string') text += tNode;
          else if (tNode['#text'] !== undefined) text += String(tNode['#text']);
        }
      }
    }

    if (text) {
      runs.push({
        paragraphIndex: paraIdx,
        runIndex: rIdx,
        text,
        charStart: charOffset,
        charEnd: charOffset + text.length,
      });
      charOffset += text.length;
    }
  }

  return runs;
}

/**
 * T025: Split a run at a character offset within a paragraph.
 * Modifies the paragraph in-place.
 */
export function splitRunAtOffset(
  para: unknown[],
  runIndex: number,
  offset: number
): void {
  const runNode = (para as Record<string, unknown>[])[runIndex];
  if (!runNode['w:r']) return;

  const runChildren = runNode['w:r'] as Record<string, unknown>[];

  // Find the <w:t> element
  let tIdx = -1;
  let tText = '';
  for (let i = 0; i < runChildren.length; i++) {
    if (runChildren[i]['w:t']) {
      tIdx = i;
      const tNodes = runChildren[i]['w:t'] as Record<string, unknown>[];
      for (const t of tNodes) {
        if (typeof t === 'string') tText += t;
        else if (t['#text'] !== undefined) tText += String(t['#text']);
      }
      break;
    }
  }

  if (tIdx === -1 || offset <= 0 || offset >= tText.length) return;

  const textBefore = tText.slice(0, offset);
  const textAfter = tText.slice(offset);

  // Get rPr (formatting) to copy to the split run
  const rPr = runChildren.find((c) => c['w:rPr']) ?? null;

  // Modify original run's <w:t>
  const origT: Record<string, unknown>[] = [{ '#text': textBefore }];
  if (textBefore.startsWith(' ') || textBefore.endsWith(' ')) {
    // Need xml:space="preserve" on <w:t>
    origT[0]['@_xml:space'] = 'preserve';
  }
  runChildren[tIdx] = { 'w:t': origT };

  // Build new run for the after-text
  const newRunChildren: Record<string, unknown>[] = [];
  if (rPr) newRunChildren.push({ ...rPr });

  const newT: Record<string, unknown>[] = [{ '#text': textAfter }];
  if (textAfter.startsWith(' ') || textAfter.endsWith(' ')) {
    newT[0]['@_xml:space'] = 'preserve';
  }
  newRunChildren.push({ 'w:t': newT });

  const newRunNode: Record<string, unknown> = { 'w:r': newRunChildren };

  // Insert after the current run
  (para as Record<string, unknown>[]).splice(runIndex + 1, 0, newRunNode);
}

/**
 * Inject <w:commentRangeStart/>, <w:commentRangeEnd/>, and a <w:commentReference> run
 * into the paragraph at paragraphIndex. These anchor the comment balloon in Word.
 * The markers are appended at the end of the paragraph content.
 */
function injectCommentMarkers(
  paragraphs: unknown[][],
  paragraphIndex: number,
  commentId: number
): void {
  if (paragraphIndex >= paragraphs.length) return;
  const para = paragraphs[paragraphIndex] as Record<string, unknown>[];

  // Find the insertion point for commentRangeStart: right after w:pPr (if present)
  let insertIdx = 0;
  if (para.length > 0 && para[0]['w:pPr']) {
    insertIdx = 1;
  }

  // Insert <w:commentRangeStart w:id="commentId"/> before the run content
  para.splice(insertIdx, 0, {
    'w:commentRangeStart': [],
    ':@': { '@_w:id': String(commentId) },
  });

  // Append <w:commentRangeEnd/> and a run with <w:commentReference/> at end
  para.push(
    {
      'w:commentRangeEnd': [],
      ':@': { '@_w:id': String(commentId) },
    },
    {
      'w:r': [
        {
          'w:rPr': [
            {
              'w:rStyle': [],
              ':@': { '@_w:val': 'CommentReference' },
            },
          ],
        },
        {
          'w:commentReference': [],
          ':@': { '@_w:id': String(commentId) },
        },
      ],
    }
  );
}

/**
 * T026: Inject a visual redline change around matched runs in a paragraph.
 *
 * Uses direct run formatting instead of native <w:del>/<w:ins> wrappers because
 * Word overrides explicit <w:color> inside revision elements with the author's
 * single revision color — making both deleted and inserted text the same color.
 *
 * Visual approach:
 *  - Deleted runs: kept as <w:r>, formatting replaced with <w:strike/> + red color
 *  - Inserted run: new <w:r> with underline + green color
 *
 * @param paragraphs  All paragraph elements from the document body
 * @param match       The excerpt match info
 * @param fallbackText The replacement text to insert
 * @param timestamp   ISO timestamp (unused — kept for API compatibility)
 */
export function injectTrackedChange(
  paragraphs: unknown[][],
  match: ExcerptMatch,
  fallbackText: string,
  _timestamp: string
): void {
  const para = paragraphs[match.paragraphIndex];
  const paraArr = para as Record<string, unknown>[];

  // Get the run indices that cover the match
  const coveredRunIndices = match.runs.map((r) => r.runIndex).sort((a, b) => a - b);
  if (coveredRunIndices.length === 0) return;

  const firstRunIdx = coveredRunIndices[0];

  // Split first run if match doesn't start at the beginning of the run
  const firstRun = match.runs[0];
  if (firstRun && firstRun.charStart < match.matchStart) {
    const splitOffset = match.matchStart - firstRun.charStart;
    splitRunAtOffset(para, firstRunIdx, splitOffset);
    // After split, indices shift by 1 for all subsequent runs
    for (let i = 1; i < match.runs.length; i++) {
      match.runs[i].runIndex += 1;
    }
    firstRun.runIndex += 1;
    coveredRunIndices.forEach((_, i) => (coveredRunIndices[i] += 1));
  }

  // Split last run if match doesn't end at the end of the run
  const lastRun = match.runs[match.runs.length - 1];
  if (lastRun && lastRun.charEnd > match.matchEnd) {
    const splitOffset = match.matchEnd - lastRun.charStart;
    const currentLastIdx = lastRun.runIndex;
    splitRunAtOffset(para, currentLastIdx, splitOffset);
    // The matched portion is the first half; the tail becomes runIndex+1 (not part of del)
  }

  // Re-read the updated indices
  const delRunIndices = match.runs.map((r) => r.runIndex).sort((a, b) => a - b);
  const firstDelIdx = delRunIndices[0];
  const lastDelIdx = delRunIndices[delRunIndices.length - 1];

  // Get the run nodes that are being deleted
  const delRunNodes = paraArr.slice(firstDelIdx, lastDelIdx + 1);

  // Get rPr from first deleted run to inherit formatting for the insertion
  const firstDelRun = delRunNodes[0] as Record<string, unknown>;
  const firstDelRunChildren = (firstDelRun?.['w:r'] as Record<string, unknown>[]) ?? [];
  const rPr = firstDelRunChildren.find((c) => c['w:rPr']) ?? null;

  // Style deleted runs: add <w:strike/> + red color, keep <w:t> (not <w:delText>)
  const styledDeletedRuns = delRunNodes.map((node) => {
    const runNode = { ...(node as Record<string, unknown>) };
    if (!runNode['w:r']) return runNode;

    const children = [...(runNode['w:r'] as Record<string, unknown>[])];
    const rPrIdx = children.findIndex((c) => (c as Record<string, unknown>)['w:rPr']);

    if (rPrIdx >= 0) {
      const rPrNode = children[rPrIdx] as Record<string, unknown>;
      const rPrChildren = [...((rPrNode['w:rPr'] as Record<string, unknown>[]) ?? [])];
      // Remove existing color and strike, then add strike + red
      const filtered = rPrChildren.filter(
        (c) =>
          !(c as Record<string, unknown>)['w:color'] &&
          !(c as Record<string, unknown>)['w:strike']
      );
      filtered.push(
        { 'w:strike': [] },
        { 'w:color': [], ':@': { '@_w:val': 'FF0000' } }
      );
      children[rPrIdx] = { 'w:rPr': filtered };
    } else {
      children.unshift({
        'w:rPr': [
          { 'w:strike': [] },
          { 'w:color': [], ':@': { '@_w:val': 'FF0000' } },
        ],
      });
    }

    runNode['w:r'] = children;
    return runNode;
  });

  // Build inserted run: inherit base formatting, add underline + green color
  const baseRprChildren: Record<string, unknown>[] = rPr
    ? [...((rPr['w:rPr'] as Record<string, unknown>[]) ?? [])]
    : [];
  const insRprChildren = [
    ...baseRprChildren.filter(
      (c) =>
        !(c as Record<string, unknown>)['w:color'] &&
        !(c as Record<string, unknown>)['w:u'] &&
        !(c as Record<string, unknown>)['w:strike']
    ),
    { 'w:u': [], ':@': { '@_w:val': 'single' } },
    { 'w:color': [], ':@': { '@_w:val': '00B050' } },
  ];

  const insT: Record<string, unknown>[] = [{ '#text': fallbackText }];
  const insTAttrs: Record<string, unknown> = {};
  if (fallbackText.startsWith(' ') || fallbackText.endsWith(' ')) {
    insTAttrs['@_xml:space'] = 'preserve';
  }

  const insRunNode: Record<string, unknown> = {
    'w:r': [
      { 'w:rPr': insRprChildren },
      Object.keys(insTAttrs).length > 0
        ? { 'w:t': insT, ':@': insTAttrs }
        : { 'w:t': insT },
    ],
  };

  // Replace the original runs with styled-deleted runs + inserted run
  paraArr.splice(firstDelIdx, lastDelIdx - firstDelIdx + 1, ...styledDeletedRuns, insRunNode);
}

/**
 * T027: Build word/comments.xml content.
 * @param findings Array of findings with their summary, riskLevel, and reviewer notes
 * @returns { commentsXml: string, commentIdMap: Map<findingId, commentId> }
 */
export function buildCommentsXml(
  findings: Array<{
    findingId: string;
    riskLevel: string;
    summary: string;
    notes?: string;
    timestamp: string;
  }>
): { commentsXml: string; commentIdMap: Map<string, number> } {
  const commentIdMap = new Map<string, number>();
  let idCounter = 1;

  const commentElements = findings.map((f) => {
    const commentId = idCounter++;
    commentIdMap.set(f.findingId, commentId);

    const riskEmoji =
      f.riskLevel === 'RED' ? '⚠' : f.riskLevel === 'YELLOW' ? '⚡' : '✓';

    let commentText = `${riskEmoji} ${f.riskLevel}: ${f.summary}`;
    if (f.notes) commentText += `\n\n${f.notes}`;

    return (
      `<w:comment w:id="${commentId}" w:author="${AUTHOR}" w:date="${f.timestamp}" w:initials="LA">` +
      `<w:p><w:r><w:t xml:space="preserve">${escapeXml(commentText)}</w:t></w:r></w:p>` +
      `</w:comment>`
    );
  });

  const commentsXml =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<w:comments xmlns:wpc="http://schemas.microsoft.com/office/word/2010/wordprocessingCanvas" ` +
    `xmlns:cx="http://schemas.microsoft.com/office/drawing/2014/chartex" ` +
    `xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" ` +
    `xmlns:aink="http://schemas.microsoft.com/office/drawing/2016/ink" ` +
    `xmlns:am3d="http://schemas.microsoft.com/office/drawing/2017/model3d" ` +
    `xmlns:o="urn:schemas-microsoft-com:office:office" ` +
    `xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ` +
    `xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math" ` +
    `xmlns:v="urn:schemas-microsoft-com:vml" ` +
    `xmlns:wp14="http://schemas.microsoft.com/office/word/2010/wordprocessingDrawing" ` +
    `xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" ` +
    `xmlns:w10="urn:schemas-microsoft-com:office:word" ` +
    `xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" ` +
    `xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml" ` +
    `xmlns:w15="http://schemas.microsoft.com/office/word/2012/wordml" ` +
    `xmlns:w16cex="http://schemas.microsoft.com/office/word/2018/wordml/cex" ` +
    `xmlns:w16cid="http://schemas.microsoft.com/office/word/2016/wordml/cid" ` +
    `xmlns:w16="http://schemas.microsoft.com/office/word/2018/wordml" ` +
    `xmlns:w16se="http://schemas.microsoft.com/office/word/2015/wordml/symex" ` +
    `xmlns:wpg="http://schemas.microsoft.com/office/word/2010/wordprocessingGroup" ` +
    `xmlns:wpi="http://schemas.microsoft.com/office/word/2010/wordprocessingInk" ` +
    `xmlns:wne="http://schemas.microsoft.com/office/word/2006/wordml" ` +
    `xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape" mc:Ignorable="w14 w15 w16se w16cid w16 w16cex aink am3d">` +
    commentElements.join('') +
    `</w:comments>`;

  return { commentsXml, commentIdMap };
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * T028: Ensure word/comments.xml is referenced in content types and document relationships.
 * Also injects <w:commentRangeStart/End> + <w:commentReference> into document.xml.
 */
export async function ensureCommentsRelationship(
  zip: JSZip,
  commentIdMap: Map<string, number>,
  commentsXml: string,
  parsedDocXml: unknown[],
  findings: Array<{ findingId: string; excerpt: string; clauseText?: string }>
): Promise<void> {
  // Add or update word/comments.xml
  zip.file('word/comments.xml', commentsXml);

  // Update [Content_Types].xml
  const contentTypesFile = zip.file('[Content_Types].xml');
  if (contentTypesFile) {
    let ct = await contentTypesFile.async('string');
    if (!ct.includes('comments+xml')) {
      ct = ct.replace(
        '</Types>',
        `<Override PartName="/word/comments.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.comments+xml"/></Types>`
      );
      zip.file('[Content_Types].xml', ct);
    }
  }

  // Update word/_rels/document.xml.rels
  const relsFile = zip.file('word/_rels/document.xml.rels');
  if (relsFile) {
    let rels = await relsFile.async('string');
    if (!rels.includes('comments')) {
      const rId = 'rIdComments';
      rels = rels.replace(
        '</Relationships>',
        `<Relationship Id="${rId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/comments" Target="comments.xml"/></Relationships>`
      );
      zip.file('word/_rels/document.xml.rels', rels);
    }
  }

  // Inject comment range markers into document.xml paragraphs
  // We do this at the raw XML level (simpler than navigating parsed tree for markers)
  // Markers are injected using a document.xml string replacement approach
  const docFile = zip.file('word/document.xml');
  if (!docFile) return;

  // At this point parsedDocXml has already been modified for tracked changes.
  // We work on the raw XML string for comment markers (simpler for range start/end).
  // This will be serialized after tracked changes in modifyOriginalDocx.
}

/**
 * T029: Main export orchestrator.
 * Reads the original DOCX, modifies it with tracked changes + comments, returns Buffer.
 */
export async function modifyOriginalDocx(
  contractId: string
): Promise<Buffer> {
  // Load contract, document, analysis, clauses, findings, decisions
  const contract = await db.contract.findUnique({
    where: { id: contractId },
    include: {
      document: true,
      analysis: {
        include: {
          clauses: {
            include: {
              findings: {
                include: {
                  decisions: {
                    orderBy: { timestamp: 'asc' },
                  },
                },
              },
            },
          },
        },
      },
    },
  });

  if (!contract) throw new Error('Contract not found');
  if (!contract.document) throw new Error('Contract has no document');

  const filePath = contract.document.filePath;
  const filename = contract.document.filename;

  // Only DOCX supported
  if (!filename.endsWith('.docx') && !filename.endsWith('.doc')) {
    throw new Error('UNPROCESSABLE: Only DOCX files can be exported with track changes');
  }

  // Read original DOCX
  let fileBuffer: Buffer;
  try {
    fileBuffer = await fs.readFile(filePath);
  } catch {
    throw new Error(`Original DOCX file not found at: ${filePath}`);
  }

  // Unzip
  const zip = await JSZip.loadAsync(fileBuffer);

  // Parse word/document.xml
  const docFile = zip.file('word/document.xml');
  if (!docFile) throw new Error('Invalid DOCX: word/document.xml not found');

  const docXmlStr = await docFile.async('string');
  const parser = new XMLParser(PARSER_OPTIONS);
  const parsedDocXml = parser.parse(docXmlStr);

  // Compute projections for all findings
  const clauses = contract.analysis?.clauses ?? [];
  const timestamp = new Date().toISOString();

  // Collect findings with applied fallbacks
  const fallbackFindings: Array<{
    findingId: string;
    excerpt: string;
    fallbackText: string;
    clauseText?: string;
    clauseId: string;
  }> = [];

  // Collect all findings for comments
  const commentFindings: Array<{
    findingId: string;
    riskLevel: string;
    summary: string;
    notes?: string;
    timestamp: string;
    excerpt: string;
    clauseText: string;
  }> = [];

  for (const clause of clauses) {
    // Compute projection for this clause
    let projection;
    try {
      projection = await computeProjection(clause.id);
    } catch {
      projection = null;
    }

    for (const finding of clause.findings) {
      // Check if fallback is applied for this finding
      const findingStatus = projection?.findingStatuses?.[finding.id];
      const isFallbackApplied =
        findingStatus?.status === 'RESOLVED_APPLIED_FALLBACK' ||
        findingStatus?.status === 'RESOLVED_MANUAL_EDIT';

      if (isFallbackApplied && finding.excerpt && finding.fallbackText) {
        const effectiveFallback = findingStatus?.replacementText ?? finding.fallbackText;
        fallbackFindings.push({
          findingId: finding.id,
          excerpt: finding.excerpt,
          fallbackText: effectiveFallback,
          clauseText: clause.clauseText ?? undefined,
          clauseId: clause.id,
        });
      }

      // Collect notes from projection
      const noteEntries = projection?.findingStatuses?.[finding.id]?.notes;
      const notes = noteEntries?.map((n) => n.text).join('\n');
      commentFindings.push({
        findingId: finding.id,
        riskLevel: finding.riskLevel,
        summary: finding.summary,
        notes: notes || undefined,
        timestamp,
        excerpt: finding.excerpt ?? '',
        clauseText: clause.clauseText ?? '',
      });
    }
  }

  console.log(
    `[DocxModifier] Export summary: ` +
    `${clauses.length} clauses, ` +
    `${commentFindings.length} comment findings, ` +
    `${fallbackFindings.length} fallback findings eligible for tracked changes`
  );
  if (fallbackFindings.length > 0) {
    console.log(
      `[DocxModifier] Fallback findings:`,
      fallbackFindings.map(f => ({
        id: f.findingId.slice(-6),
        excerpt: f.excerpt.slice(0, 40),
        fallback: f.fallbackText.slice(0, 40),
      }))
    );
  }

  // Get body paragraphs for modification
  const body = getBodyElement(parsedDocXml);
  if (!body) throw new Error('Invalid DOCX: word:body not found');
  const paragraphs = getParagraphs(body);

  // Pre-compute paragraph indices for comment findings BEFORE tracked changes
  // alter the XML (tracked changes replace <w:t> with <w:delText>, so the text
  // would no longer be found by findTextInDocXml afterwards).
  const commentParagraphIndices = new Map<string, number>();
  for (const finding of commentFindings) {
    if (!finding.excerpt) continue;
    const match = findTextInDocXml(parsedDocXml, finding.excerpt, finding.clauseText);
    if (match) {
      commentParagraphIndices.set(finding.findingId, match.paragraphIndex);
    } else {
      console.warn(
        `[DocxModifier] Comment anchor not found for finding ${finding.findingId}: ` +
        `"${finding.excerpt.slice(0, 60)}..."`
      );
    }
  }

  // Inject tracked changes for each fallback finding
  let injectedCount = 0;
  for (const finding of fallbackFindings) {
    try {
      const match = findTextInDocXml(
        parsedDocXml,
        finding.excerpt,
        finding.clauseText ?? ''
      );

      if (!match) {
        console.warn(
          `[DocxModifier] Excerpt not found in document for finding ${finding.findingId}: ` +
          `"${finding.excerpt.slice(0, 60)}..."`
        );
        continue;
      }

      injectTrackedChange(paragraphs, match, finding.fallbackText, timestamp);
      injectedCount++;
    } catch (err) {
      console.warn(
        `[DocxModifier] Failed to inject tracked change for finding ${finding.findingId}:`,
        err instanceof Error ? err.message : err
      );
    }
  }

  console.log(
    `[DocxModifier] Injected ${injectedCount}/${fallbackFindings.length} tracked changes`
  );

  // Build comments XML
  const { commentsXml, commentIdMap } = buildCommentsXml(commentFindings);

  // Inject comment range markers into paragraphs (now that we have commentIdMap)
  let commentMarkersInjected = 0;
  for (const finding of commentFindings) {
    const paraIdx = commentParagraphIndices.get(finding.findingId);
    const commentId = commentIdMap.get(finding.findingId);
    if (paraIdx !== undefined && commentId !== undefined) {
      injectCommentMarkers(paragraphs, paraIdx, commentId);
      commentMarkersInjected++;
    }
  }
  console.log(
    `[DocxModifier] Injected ${commentMarkersInjected}/${commentFindings.length} comment markers`
  );

  // Serialize modified document.xml
  const builder = new XMLBuilder(BUILDER_OPTIONS);
  const modifiedDocXml = builder.build(parsedDocXml);

  // Update the DOCX zip
  zip.file('word/document.xml', modifiedDocXml);

  // Add comments relationship and xml
  if (commentFindings.length > 0) {
    await ensureCommentsRelationship(
      zip,
      commentIdMap,
      commentsXml,
      parsedDocXml,
      commentFindings.map((f) => ({
        findingId: f.findingId,
        excerpt: '',
        clauseText: '',
      }))
    );
  }

  // Repack to buffer
  const outputBuffer = await zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });

  return outputBuffer;
}
