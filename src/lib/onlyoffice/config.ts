/**
 * ONLYOFFICE Server Configuration Utility
 * Feature 009: Centralized ONLYOFFICE configuration and defaults
 */

import type { SessionMode, ONLYOFFICEConfig, ONLYOFFICEDocumentPermissions } from '@/types/onlyoffice';

// ─── Environment Configuration ───────────────────────────────────────────────

export function getOnlyOfficeServerUrl(): string {
  const url = process.env.ONLYOFFICE_SERVER_URL;
  if (!url) {
    throw new Error('ONLYOFFICE_SERVER_URL environment variable is not set');
  }
  return url.replace(/\/$/, ''); // Remove trailing slash
}

export function getOnlyOfficeJwtSecret(): string {
  const secret = process.env.ONLYOFFICE_JWT_SECRET;
  if (!secret) {
    throw new Error('ONLYOFFICE_JWT_SECRET environment variable is not set');
  }
  return secret;
}

export function isJwtEnabled(): boolean {
  return process.env.ONLYOFFICE_JWT_ENABLED === 'true';
}

export function getAppBaseUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
}

// ─── Token Expiration Defaults ───────────────────────────────────────────────

/** Access token expiration: 4 hours */
export const ACCESS_TOKEN_EXPIRY = '4h';
export const ACCESS_TOKEN_EXPIRY_MS = 4 * 60 * 60 * 1000;

/** Download token expiration: 1 hour */
export const DOWNLOAD_TOKEN_EXPIRY = '1h';
export const DOWNLOAD_TOKEN_EXPIRY_MS = 1 * 60 * 60 * 1000;

/** Client-side token refresh interval: 3.5 hours (30 min before expiry) */
export const TOKEN_REFRESH_INTERVAL_MS = 3.5 * 60 * 60 * 1000;

// ─── Session Defaults ────────────────────────────────────────────────────────

/** Session cleanup: delete expired/revoked sessions older than 7 days */
export const SESSION_CLEANUP_DAYS = 7;

/** Editor idle timeout: 15 minutes */
export const EDITOR_IDLE_TIMEOUT_MS = 15 * 60 * 1000;

// ─── Document Key Generation ─────────────────────────────────────────────────

export function generateDocumentKey(contractId: string): string {
  return `contract-${contractId}-${Date.now()}`;
}

export function validateDocumentKey(key: string, contractId: string): boolean {
  const pattern = new RegExp(`^contract-${contractId}-\\d+$`);
  return pattern.test(key);
}

// ─── Permissions ─────────────────────────────────────────────────────────────

export function getPermissions(mode: SessionMode): ONLYOFFICEDocumentPermissions {
  return {
    comment: true,
    download: true,
    edit: mode === 'edit',
    print: true,
    review: mode === 'edit',
  };
}

// ─── ONLYOFFICE Editor Config Builder ────────────────────────────────────────

export interface BuildConfigOptions {
  documentKey: string;
  contractTitle: string;
  fileType: string;
  downloadUrl: string;
  callbackUrl: string;
  mode: SessionMode;
  userId: string;
  userName: string;
  accessToken: string;
}

export function buildOnlyOfficeConfig(options: BuildConfigOptions): ONLYOFFICEConfig {
  const {
    documentKey,
    contractTitle,
    fileType,
    downloadUrl,
    callbackUrl,
    mode,
    userId,
    userName,
    accessToken,
  } = options;

  // Map MIME type to ONLYOFFICE file type
  const ooFileType = fileType === 'application/pdf' ? 'pdf' : 'docx';

  return {
    document: {
      fileType: ooFileType,
      key: documentKey,
      title: contractTitle,
      url: downloadUrl,
      permissions: getPermissions(mode),
    },
    documentType: 'word',
    editorConfig: {
      mode,
      lang: 'en',
      callbackUrl,
      user: {
        id: userId,
        name: userName,
      },
      customization: {
        comments: true,
        compactToolbar: true,
        review: {
          showReviewChanges: mode === 'edit',
          trackChanges: mode === 'edit',
        },
      },
    },
    token: accessToken,
  };
}

// ─── URL Builders ────────────────────────────────────────────────────────────

export function buildDownloadUrl(contractId: string, downloadToken: string): string {
  const baseUrl = getAppBaseUrl();
  return `${baseUrl}/api/contracts/${contractId}/download?token=${downloadToken}`;
}

export function buildCallbackUrl(contractId: string): string {
  const baseUrl = getAppBaseUrl();
  return `${baseUrl}/api/onlyoffice/callback/${contractId}`;
}

// ─── Health Check URL ────────────────────────────────────────────────────────

export function getHealthCheckUrl(): string {
  return `${getOnlyOfficeServerUrl()}/healthcheck`;
}
