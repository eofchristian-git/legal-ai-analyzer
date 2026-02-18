/**
 * ONLYOFFICE Document Viewer Integration — Type Definitions
 * Feature 009: Type definitions for session, config, callback, and token interfaces
 */

// ─── Session Types ───────────────────────────────────────────────────────────

export type SessionMode = 'view' | 'edit';
export type SessionStatus = 'active' | 'expired' | 'revoked';

export interface OnlyOfficeSessionData {
  id: string;
  contractId: string;
  userId: string;
  documentKey: string;
  accessToken: string;
  downloadToken: string;
  mode: SessionMode;
  status: SessionStatus;
  expiresAt: string; // ISO 8601
  lastRefreshedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

// ─── Token Types ─────────────────────────────────────────────────────────────

export interface AccessTokenPayload {
  contractId: string;
  userId: string;
  mode: SessionMode;
  iat: number;
  exp: number;
}

export interface DownloadTokenPayload {
  contractId: string;
  purpose: 'onlyoffice-download';
  iat: number;
  exp: number;
}

export interface ConfigTokenPayload {
  document: ONLYOFFICEDocumentConfig;
  documentType: string;
  editorConfig: ONLYOFFICEEditorConfig;
}

// ─── ONLYOFFICE Editor Configuration ─────────────────────────────────────────

export interface ONLYOFFICEDocumentPermissions {
  comment: boolean;
  download: boolean;
  edit: boolean;
  print: boolean;
  review: boolean;
}

export interface ONLYOFFICEDocumentConfig {
  fileType: string;
  key: string;
  title: string;
  url: string;
  permissions: ONLYOFFICEDocumentPermissions;
}

export interface ONLYOFFICEUserConfig {
  id: string;
  name: string;
}

export interface ONLYOFFICEReviewConfig {
  showReviewChanges: boolean;
  trackChanges: boolean;
}

export interface ONLYOFFICECustomizationConfig {
  comments: boolean;
  compactToolbar: boolean;
  review: ONLYOFFICEReviewConfig;
}

export interface ONLYOFFICEEditorConfig {
  mode: SessionMode;
  lang: string;
  callbackUrl: string;
  user: ONLYOFFICEUserConfig;
  customization: ONLYOFFICECustomizationConfig;
}

export interface ONLYOFFICEConfig {
  document: ONLYOFFICEDocumentConfig;
  documentType: string;
  editorConfig: ONLYOFFICEEditorConfig;
  token: string;
}

// ─── API Request/Response Types ──────────────────────────────────────────────

export interface TokenRequest {
  contractId: string;
  mode?: SessionMode;
}

export interface TokenResponse {
  sessionId: string;
  documentKey: string;
  accessToken: string;
  downloadToken: string;
  downloadUrl: string;
  callbackUrl: string;
  mode: SessionMode;
  expiresAt: string;
  config: ONLYOFFICEConfig;
}

// ─── Callback Types ──────────────────────────────────────────────────────────

export type CallbackStatus =
  | 0   // NotFound
  | 1   // Editing
  | 2   // MustSave
  | 3   // Corrupted
  | 4   // Closed (no changes)
  | 6   // MustForceSave
  | 7;  // CorruptedForceSave

export interface CallbackRequest {
  key: string;
  status: CallbackStatus;
  url?: string;
  changesurl?: string;
  history?: Record<string, unknown>;
  users?: string[];
  actions?: Record<string, unknown>[];
  lastsave?: string;
  notmodified?: boolean;
  token?: string;
  forcesavetype?: number;
}

export interface CallbackResponse {
  error: 0 | 1; // 0 = success, 1 = error
}

// ─── Component Props ─────────────────────────────────────────────────────────

export interface OnlyOfficeViewerProps {
  contractId: string;
  contractTitle: string;
  fileType: string;
  mode?: SessionMode;
  onDocumentReady?: () => void;
  onError?: (error: string) => void;
}

// ─── Finding / Comment Injection Types ───────────────────────────────────────

export interface FindingCommentData {
  findingId: string;
  clauseId: string;
  riskLevel: 'RED' | 'YELLOW' | 'GREEN';
  matchedRuleTitle: string;
  matchedRuleId?: string;
  summary: string;
  excerpt: string;
}

export interface CommentInjectionResult {
  findingId: string;
  success: boolean;
  positioned: boolean; // true if exact text match, false if fallback
  error?: string;
}

// ─── Track Changes Types ─────────────────────────────────────────────────────

export type DecisionActionType =
  | 'ACCEPT_DEVIATION'
  | 'APPLY_FALLBACK'
  | 'EDIT_MANUAL'
  | 'ESCALATE'
  | 'ADD_NOTE'
  | 'UNDO'
  | 'REVERT';

export interface TrackChangeData {
  decisionId: string;
  clauseId: string;
  actionType: DecisionActionType;
  originalText: string;
  replacementText: string;
  author: string;
  timestamp: string;
}

export interface TrackChangeInjectionResult {
  decisionId: string;
  success: boolean;
  error?: string;
}

// ─── Health Check ────────────────────────────────────────────────────────────

export interface HealthCheckResponse {
  status: boolean;
  serverUrl: string;
  timestamp: string;
}
