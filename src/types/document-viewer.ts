// Feature 008: Interactive Document Viewer & Redline Export
// TypeScript interfaces for document conversion and rendering

/**
 * Position data for a clause in the rendered document
 */
export interface ClausePosition {
  clauseId: string;        // AnalysisClause.id
  page: number;            // 1-indexed page number
  x: number;               // Horizontal position (px)
  y: number;               // Vertical position (px)
  width: number;           // Bounding box width (px)
  height: number;          // Bounding box height (px)
}

/**
 * Position data for a finding in the rendered document
 */
export interface FindingPosition {
  findingId: string;       // AnalysisFinding.id
  clauseId: string;        // Parent clause ID
  page: number;            // 1-indexed page number
  x: number;               // Horizontal position (px)
  y: number;               // Vertical position (px)
  width: number;           // Bounding box width (px)
  height: number;          // Bounding box height (px)
  riskLevel?: string;      // 'RED' | 'YELLOW' | 'GREEN'
}

/**
 * Options for document conversion
 */
export interface ConversionOptions {
  fileBuffer: Buffer;
  format: 'word' | 'pdf';
  contractId: string;
}

/**
 * Result of document conversion
 */
export interface ConversionResult {
  html: string;
  pageCount: number;
  warnings?: string[];
}

/**
 * Options for position calculation
 */
export interface PositionCalculationOptions {
  html: string;
  documentId: string;
  clauses: Array<{
    id: string;
    clauseNumber: string;
    clauseText?: string | null;
  }>;
  findings: Array<{
    id: string;
    clauseId: string;
    excerpt: string;
    locationPage?: number | null;
    locationPosition?: string | null;
  }>;
}

/**
 * Result of position calculation
 */
export interface PositionCalculationResult {
  clausePositions: ClausePosition[];
  findingPositions: FindingPosition[];
}

/**
 * Props for DocumentViewer component
 */
export interface DocumentViewerProps {
  contractId: string;
  htmlContent: string;
  pageCount: number;
  clausePositions: ClausePosition[];
  findingPositions: FindingPosition[];
  selectedClauseId?: string | null;
  onClauseClick?: (clauseId: string) => void;
  onFindingClick?: (findingId: string, clauseId: string) => void;
}

/**
 * Conversion status type
 */
export type ConversionStatus = 'pending' | 'processing' | 'completed' | 'failed';

/**
 * Document data from API
 */
export interface ContractDocumentData {
  id: string;
  htmlContent: string | null;
  pageCount: number;
  conversionStatus: ConversionStatus;
  conversionError?: string | null;
  clausePositions: ClausePosition[];
  findingPositions: FindingPosition[];
}

/**
 * Finding data needed for client-side text highlighting
 */
export interface HighlightFinding {
  findingId: string;
  clauseId: string;
  excerpt: string;
  riskLevel: string; // 'RED' | 'YELLOW' | 'GREEN'
}

/**
 * Clause data needed for client-side data-clause-id marker injection
 */
export interface HighlightClause {
  clauseId: string;
  clauseNumber: string;
  clauseName: string;
  clauseText: string;
}

/**
 * Export format options
 */
export type ExportFormat = 'docx' | 'pdf';

/**
 * Export metadata
 */
export interface ExportMetadata {
  contractTitle: string;
  counterparty?: string | null;
  exportDate: Date;
  reviewerName: string;
  organizationName?: string;
}
