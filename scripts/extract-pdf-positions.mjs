/**
 * Standalone script to extract text positions from a PDF using pdfjs-dist.
 * Run as a child process from pdf-pipeline.ts to avoid Next.js bundling issues.
 *
 * Usage: node scripts/extract-pdf-positions.mjs <pdfPath>
 * Output: JSON array of TextPosition objects on stdout
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { pathToFileURL, fileURLToPath } from 'url';

const pdfPath = process.argv[2];
if (!pdfPath) {
  process.stderr.write('Usage: extract-pdf-positions.mjs <pdfPath>\n');
  process.exit(1);
}

// Import pdfjs-dist — running outside Next.js so no bundling issues
const { getDocument, GlobalWorkerOptions } = await import('pdfjs-dist/legacy/build/pdf.mjs').catch(
  () => import('pdfjs-dist')
);

// Point worker at the real file so Node.js can spawn it
const workerPath = resolve(process.cwd(), 'node_modules/pdfjs-dist/build/pdf.worker.mjs');
GlobalWorkerOptions.workerSrc = pathToFileURL(workerPath).href;

const data = readFileSync(pdfPath);
const pdfDocument = await getDocument({ data: new Uint8Array(data) }).promise;

const positions = [];

for (let pageIndex = 0; pageIndex < pdfDocument.numPages; pageIndex++) {
  const page = await pdfDocument.getPage(pageIndex + 1);
  const viewport = page.getViewport({ scale: 1 });
  const pageHeight = viewport.height;
  const textContent = await page.getTextContent();

  for (const item of textContent.items) {
    if (!('str' in item) || !item.str) continue;

    // Flip Y: PDF origin is bottom-left, we want top-left
    const tx = item.transform;
    const x = tx[4];
    const yBottom = tx[5];
    const itemHeight = item.height ?? 12;
    const y = pageHeight - yBottom - itemHeight;

    positions.push({
      text: item.str,
      pageIndex,
      x,
      y,
      width: item.width ?? 0,
      height: itemHeight,
    });
  }
}

process.stdout.write(JSON.stringify({ pageCount: pdfDocument.numPages, positions }));
