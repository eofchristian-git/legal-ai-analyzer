/**
 * @deprecated Feature 008 — Document Converter (DEPRECATED)
 * Replaced by Feature 009: ONLYOFFICE renders documents natively without HTML conversion.
 * Retained for backward compatibility with contracts already converted to HTML.
 * Removal planned after ONLYOFFICE validation is complete.
 */
// Feature 008: Interactive Document Viewer & Redline Export
// Document conversion utilities (Word/PDF → HTML)

import mammoth from 'mammoth';
import type { ConversionOptions, ConversionResult } from '@/types/document-viewer';

// Conditional import of PDF.js based on environment
let pdfjsLib: any;
if (typeof window === 'undefined') {
  // Server-side: use legacy build for Node.js compatibility
  pdfjsLib = require('pdfjs-dist/legacy/build/pdf.mjs');
} else {
  // Client-side: use standard build with web worker
  pdfjsLib = require('pdfjs-dist');
  pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.js';
}

/**
 * Detect document format from file buffer
 */
export function detectFormat(filename: string): 'word' | 'pdf' {
  const ext = filename.toLowerCase().split('.').pop();
  if (ext === 'pdf') return 'pdf';
  if (ext === 'docx' || ext === 'doc') return 'word';
  throw new Error(`Unsupported file format: ${ext}`);
}

/**
 * Convert Word document to HTML
 */
export async function convertWordToHTML(
  fileBuffer: Buffer,
  contractId: string
): Promise<{ html: string; warnings: string[] }> {
  try {
    const conversionOptions = {
      // Style mapping for semantic HTML
      styleMap: [
        "p[style-name='Heading 1'] => h1.clause-heading",
        "p[style-name='Heading 2'] => h2.section-heading",
        "p[style-name='Heading 3'] => h3.subsection-heading",
        "p[style-name='Normal'] => p.clause-text",
      ],
      
      // Include default style mappings
      includeDefaultStyleMap: true,
      
      // Convert embedded images to base64
      convertImage: mammoth.images.imgElement((image) => {
        return image.read("base64").then((imageBuffer) => {
          return {
            src: `data:${image.contentType};base64,${imageBuffer}`
          };
        });
      })
    };

    const result = await mammoth.convertToHtml(
      { buffer: fileBuffer },
      conversionOptions
    );
    
    // Extract HTML
    const html = result.value;
    
    // Collect warnings
    const warnings = result.messages
      .filter(m => m.type === 'warning')
      .map(m => m.message);
    
    return { html, warnings };
    
  } catch (error) {
    throw new Error(`Word conversion failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Convert PDF to HTML using PDF.js
 * Note: This is a simplified implementation. Full PDF rendering would require puppeteer.
 */
export async function convertPDFToHTML(
  fileBuffer: Buffer,
  contractId: string
): Promise<{ html: string; pageCount: number }> {
  try {
    // Load PDF document
    const loadingTask = pdfjsLib.getDocument({
      data: new Uint8Array(fileBuffer),
      useSystemFonts: true,
    });
    
    const pdf = await loadingTask.promise;
    const pageCount = pdf.numPages;
    
    const pages: string[] = [];
    
    // Process each page
    for (let pageNum = 1; pageNum <= pageCount; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const pageHTML = await convertPDFPage(page, pageNum);
      pages.push(pageHTML);
    }
    
    // Combine pages
    const html = `
      <div class="pdf-document">
        ${pages.join('\n')}
      </div>
    `;
    
    return { html, pageCount };
    
  } catch (error) {
    throw new Error(`PDF conversion failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Convert a single PDF page to HTML
 */
async function convertPDFPage(
  page: any, // PDFPageProxy type
  pageNum: number
): Promise<string> {
  // Get viewport
  const viewport = page.getViewport({ scale: 1.5 });
  
  // Get text content with positions
  const textContent = await page.getTextContent();
  
  // Build HTML from text items
  const textItems = textContent.items.map((item: any) => {
    if (!item.transform) return '';
    
    const tx = item.transform;
    const x = tx[4];
    const rawY = tx[5];
    const width = item.width || 0;
    const height = item.height || 12;
    // PDF y-axis is bottom-up; CSS top is top-down — flip the coordinate
    const y = viewport.height - rawY - height;

    return `
      <span
        class="pdf-text-item"
        style="
          position: absolute;
          left: ${x}px;
          top: ${y}px;
          width: ${width}px;
          height: ${height}px;
          font-size: ${height}px;
        "
        data-page="${pageNum}"
      >
        ${escapeHTML(item.str)}
      </span>
    `;
  });
  
  return `
    <div 
      class="pdf-page" 
      data-page-number="${pageNum}"
      style="
        position: relative;
        width: ${viewport.width}px;
        height: ${viewport.height}px;
        page-break-after: always;
        margin-bottom: 20px;
      "
    >
      ${textItems.join('')}
    </div>
  `;
}

/**
 * Escape HTML special characters
 */
function escapeHTML(str: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return str.replace(/[&<>"']/g, (m) => map[m]);
}

/**
 * Main conversion function with retry logic
 */
export async function convertDocument(
  options: ConversionOptions,
  maxRetries: number = 3
): Promise<ConversionResult> {
  let lastError: Error | null = null;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      if (options.format === 'word') {
        const { html, warnings } = await convertWordToHTML(
          options.fileBuffer,
          options.contractId
        );
        return { html, pageCount: 1, warnings }; // Word page count would need separate logic
      } else {
        const { html, pageCount } = await convertPDFToHTML(
          options.fileBuffer,
          options.contractId
        );
        return { html, pageCount };
      }
    } catch (error) {
      lastError = error as Error;
      console.error(`Conversion attempt ${attempt} failed:`, error);
      
      // Wait before retry (exponential backoff)
      if (attempt < maxRetries) {
        await sleep(Math.pow(2, attempt) * 1000);
      }
    }
  }
  
  throw new Error(
    `Conversion failed after ${maxRetries} attempts: ${lastError?.message || 'Unknown error'}`
  );
}

/**
 * Sleep utility for retry backoff
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
