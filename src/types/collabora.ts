/**
 * Collabora Online Viewer Integration — Type Definitions
 * Feature 010: Type definitions for WOPI protocol, postMessage API, and viewer session
 */

// ─── WOPI Access Token ───────────────────────────────────────────────────────

export interface WopiAccessTokenPayload {
  /** The contract/file ID this token grants access to */
  fileId: string;
  /** The authenticated user ID */
  userId: string;
  /** User display name */
  userName: string;
  /** Permission level */
  permission: 'view' | 'edit';
  /** Token issued at (standard JWT claim) */
  iat: number;
  /** Token expires at (standard JWT claim) */
  exp: number;
}

// ─── WOPI CheckFileInfo Response ─────────────────────────────────────────────

export interface CheckFileInfoResponse {
  BaseFileName: string;
  Size: number;
  Version: string;
  OwnerId: string;
  UserId: string;
  UserFriendlyName: string;

  // Permission flags
  UserCanWrite: boolean;
  UserCanNotWriteRelative: boolean;
  UserCanRename: boolean;

  // UI flags
  DisablePrint: boolean;
  DisableExport: boolean;
  HidePrintOption: boolean;
  HideExportOption: boolean;
  HideSaveOption: boolean;

  // PostMessage integration
  PostMessageOrigin: string;

  // Optional watermark
  WatermarkText?: string | null;
}

// ─── Collabora PostMessage Types ─────────────────────────────────────────────

/** Messages sent from Host → Collabora iframe */
export type CollaboraOutboundMessageId =
  | 'Host_PostmessageReady'
  | 'Action_Exec'
  | 'Hide_Menu_Bar'
  | 'Hide_Status_Bar'
  | 'Show_Toolbar'
  | 'Action_Print'
  | 'Action_Export';

/** Messages received from Collabora iframe → Host */
export type CollaboraInboundMessageId =
  | 'App_LoadingStatus'
  | 'UI_Error'
  | 'View_Added'
  | 'Doc_ModifiedStatus'
  | 'Action_Save_Resp';

export interface CollaboraOutboundMessage {
  MessageId: CollaboraOutboundMessageId;
  Values?: Record<string, unknown>;
}

export interface CollaboraInboundMessage {
  MessageId: CollaboraInboundMessageId;
  Values?: Record<string, unknown>;
}

/** App_LoadingStatus values from Collabora */
export type CollaboraLoadingStatus =
  | 'Frame_Ready'
  | 'Document_Loaded'
  | 'Failed';

// ─── Viewer Session API Types ────────────────────────────────────────────────

export interface CreateSessionRequest {
  contractId: string;
}

export interface CreateSessionResponse {
  /** Full URL to set as the iframe src */
  iframeUrl: string;
  /** JWT access token (also embedded in iframeUrl) */
  accessToken: string;
  /** Token time-to-live in milliseconds */
  accessTokenTtl: number;
  /** The contract/file ID */
  fileId: string;
  /** Origin of the Collabora server (for postMessage validation) */
  collaboraOrigin: string;
  /** Current file version string */
  fileVersion: string;
}

// ─── Health Check ────────────────────────────────────────────────────────────

export interface CollaboraHealthResponse {
  healthy: boolean;
  serverUrl: string;
  discoveryAvailable: boolean;
  timestamp: string;
}

// ─── Finding Redline Data (fallback / manual edit applied) ───────────────────

export interface FindingRedlineData {
  /** Finding ID that was resolved */
  findingId: string;
  /** Original excerpt text to strikethrough in the document */
  excerpt: string;
  /** Replacement text to insert after the strikethrough */
  replacementText: string;
}

// ─── Finding Undo Redline Data (revert a previously applied fallback) ────────

export interface FindingUndoRedlineData {
  /** Finding ID whose redline should be reverted */
  findingId: string;
  /** The original excerpt (currently strikethrough + gray in the document) */
  excerpt: string;
  /** The fallback text that was inserted (currently bold green — to be deleted) */
  insertedText: string;
  /** Risk level to re-apply highlight after undo */
  riskLevel: 'RED' | 'YELLOW' | 'GREEN';
}

// ─── Viewer Component Props ──────────────────────────────────────────────────

export interface CollaboraViewerProps {
  contractId: string;
  contractTitle: string;
  fileType: string;
  /** Currently selected clause ID for navigation */
  selectedClauseId?: string | null;
  /** Clause data for navigation (id → text mapping) */
  clauses?: ClauseNavigationData[];
  /** Called when document finishes loading */
  onDocumentReady?: () => void;
  /** Called on viewer error */
  onError?: (error: string) => void;
  /** Trigger to force reload (increment to reload) */
  reloadTrigger?: number;
  /** Pending redline to apply when user applies fallback/manual edit */
  pendingRedline?: FindingRedlineData | null;
  /** Called after the redline has been applied in the viewer */
  onRedlineApplied?: () => void;
  /** Whether risk-level highlights are already baked into the DOCX file */
  highlightsApplied?: boolean;
  /** Called after highlights have been applied and saved — parent should persist the flag */
  onHighlightingComplete?: () => void;
  /** Pending undo redline to revert (set when user undoes a fallback decision) */
  pendingUndoRedline?: FindingUndoRedlineData | null;
  /** Called after the undo redline has been applied and saved in the viewer */
  onUndoRedlineApplied?: () => void;
}

// ─── Clause Navigation ───────────────────────────────────────────────────────

export interface ClauseNavigationData {
  id: string;
  clauseName: string;
  /** Full clause text (v1 format) — may be empty for formatVersion=2 contracts */
  clauseText: string;
  position: number;
  /** Finding excerpts from the document (v2 format) — used as fallback when clauseText is empty */
  findingExcerpts?: string[];
  /** Per-finding data for in-document highlighting (excerpt + risk level) */
  findingDetails?: FindingHighlightData[];
}

// ─── Finding Highlight Data ──────────────────────────────────────────────────

export interface FindingHighlightData {
  /** Unique finding ID */
  id: string;
  /** Verbatim excerpt text from the DOCX */
  excerpt: string;
  /** Risk level for highlight color */
  riskLevel: 'RED' | 'YELLOW' | 'GREEN';
}
