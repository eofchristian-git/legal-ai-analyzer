export type TriageDecision = "ACCEPT" | "NEEDS_REVIEW" | "REJECT";

export interface FindingComment {
  id: string;
  findingId: string;
  userId: string;
  user: { id: string; name: string; email: string };
  content: string;
  createdAt: string;
}

export interface Finding {
  id: string;
  riskLevel: "GREEN" | "YELLOW" | "RED";
  matchedRuleTitle: string;
  summary: string;
  fallbackText: string;
  whyTriggered: string;
  excerpt: string;
  triageDecision: TriageDecision | null;
  triageNote: string | null;
  triagedBy: string | null;
  triagedByName: string | null;
  triagedAt: string | null;
  comments: FindingComment[];
  // NEW: Deviation-focused analysis fields (Feature 005)
  contextBefore?: string | null;    // T051: Text before the excerpt
  contextAfter?: string | null;     // T052: Text after the excerpt
  locationPage?: number | null;     // T053: Approximate page number
  locationPosition?: string | null; // T054: Approximate position (top/middle/bottom)
}

export interface Clause {
  id: string;
  clauseNumber: string;
  clauseName: string;
  clauseText: string;
  clauseTextFormatted?: string;
  position: number;
  findings: Finding[];
}

export interface NegotiationItem {
  id: string;
  priority: string;   // "P1" | "P2" | "P3"
  title: string;
  description: string;
  clauseRef: string | null;
  position: number;
}

export interface AnalysisWithClauses {
  id: string;
  overallRisk: string;
  greenCount: number;
  yellowCount: number;
  redCount: number;
  finalized: boolean;
  finalizedAt: string | null;
  finalizedBy: string | null;
  finalizedByName: string | null;
  createdBy: string | null;
  createdByName: string | null;
  playbookSnapshotId: string | null;
  playbookVersion: number | null;
  currentPlaybookVersion: number | null;
  executiveSummary: string | null;
  negotiationStrategy: string | null;
  negotiationItems: NegotiationItem[];
  modelUsed: string;
  createdAt: string;
  clauses: Clause[];
  // NEW: Deviation-focused analysis fields (Feature 005)
  formatVersion?: number;   // 1 = old clause-based, 2 = new deviation-based
  totalClauses?: number;    // Total clauses in document (v2 only)
  // Feature 010: Collabora highlighting
  highlightsApplied?: boolean;
}

export interface ContractWithAnalysis {
  id: string;
  title: string;
  ourSide: string;
  contractType: string | null;
  counterparty: string | null;
  status: string;
  createdBy: string | null;
  createdByName: string | null;
  document: { filename: string; extractedText: string };
  analysis: AnalysisWithClauses | null;
}

export type ActivityAction =
  | "contract_created"
  | "analysis_run"
  | "finding_triaged"
  | "triage_finalized"
  | "comment_added";

export interface ActivityLogEntry {
  id: string;
  contractId: string;
  action: ActivityAction;
  userId: string;
  user: { id: string; name: string; email: string };
  targetType: string | null;
  targetId: string | null;
  metadata: string | null;
  createdAt: string;
}
