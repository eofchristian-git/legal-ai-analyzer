/**
 * PDF Viewer Types — Feature 012
 * TextPosition, ClausePdfMapping, FindingPdfMapping, PageOverlayData, PdfDocumentResponse
 */

/** A single text span extracted from the PDF with its coordinates */
export interface TextPosition {
  /** The text content of this span */
  text: string;
  /** Zero-based page index in the PDF */
  pageIndex: number;
  /** Left edge in PDF points (72 points = 1 inch) */
  x: number;
  /** Top edge in PDF points (origin: top-left after coordinate flip) */
  y: number;
  /** Width in PDF points */
  width: number;
  /** Height in PDF points */
  height: number;
}

/** A rectangle in PDF coordinate space */
export interface PdfRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Mapping from an AnalysisClause to its position in the PDF */
export interface ClausePdfMapping {
  /** References AnalysisClause.id */
  clauseId: string;
  /** Page where the clause starts */
  pageIndex: number;
  /** Bounding rectangle of the clause heading/start text */
  startRect: PdfRect;
  /** Match confidence: 1.0 = exact, <1.0 = fuzzy */
  confidence: number;
  /** True if mapping failed — clause exists in list but has no position */
  unmapped: boolean;
}

/** Mapping from an AnalysisFinding to its position(s) in the PDF */
export interface FindingPdfMapping {
  /** References AnalysisFinding.id */
  findingId: string;
  /** References AnalysisClause.id (for grouping) */
  clauseId: string;
  /** Risk level for highlight coloring */
  riskLevel: 'RED' | 'YELLOW' | 'GREEN';
  /** Page where the finding excerpt starts */
  pageIndex: number;
  /** One or more rectangles covering the excerpt text (may span lines) */
  rects: PdfRect[];
  /** Match confidence */
  confidence: number;
  /** True if mapping failed */
  unmapped: boolean;
}

/** Overlay data for a single page */
export interface PageOverlayData {
  pageIndex: number;
  findingMappings: FindingPdfMapping[];
  clauseMappings: ClausePdfMapping[];
}

/** Response from GET /api/contracts/[id]/pdf-document */
export interface PdfDocumentResponse {
  pdfUrl: string | null;
  pageCount: number;
  conversionStatus: 'pending' | 'converting' | 'extracting' | 'mapping' | 'completed' | 'failed';
  conversionError?: string;
  clauseMappings: ClausePdfMapping[];
  findingMappings: FindingPdfMapping[];
}
