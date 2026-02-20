/**
 * ONLYOFFICE Server Configuration Utility
 * Feature 009: Centralized ONLYOFFICE configuration and defaults
 */

import jwt from 'jsonwebtoken';
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

/**
 * Get the base URL that ONLYOFFICE Document Server (inside Docker) uses
 * to reach our Next.js app. Falls back to host.docker.internal for local dev.
 */
export function getDockerAccessibleBaseUrl(): string {
  return process.env.ONLYOFFICE_APP_CALLBACK_URL || 'http://host.docker.internal:3000';
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
    comment: true,    // Required for programmatically injected finding comments to display
    download: true,
    edit: false,       // Always read-only — changes come from triage decisions only
    print: true,
    review: false,     // Track changes are injected, not manually created
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
  } = options;

  // Map MIME type to ONLYOFFICE file type
  const ooFileType = fileType === 'application/pdf' ? 'pdf' : 'docx';

  // Always use 'view' mode — document is read-only, changes come from triage decisions
  const effectiveMode = 'view' as const;

  // Build the config payload (without token)
  const configPayload = {
    type: 'embedded' as const, // Removes the top menu bar — shows document only
    document: {
      fileType: ooFileType,
      key: documentKey,
      title: contractTitle,
      url: downloadUrl,
      permissions: getPermissions(effectiveMode),
    },
    documentType: 'word',
    editorConfig: {
      mode: effectiveMode,
      lang: 'en',
      callbackUrl,
      user: {
        id: userId,
        name: userName,
      },
      customization: {
        // ── Hide all ONLYOFFICE UI chrome — show only the document ──
        autosave: false,
        chat: false,
        comments: true,   // Show comments panel so injected finding annotations are visible
        compactHeader: true,
        compactToolbar: true,
        feedback: false,
        forcesave: false,
        goback: false,
        help: false,
        hideRightMenu: false, // Must be false for comments sidebar to be accessible
        hideRulers: true,
        plugins: false,
        toolbarHideFileName: true,
        toolbarNoTabs: true,
        logo: { visible: false },
        review: {
          showReviewChanges: false,
          trackChanges: false,
        },
      },
    },
  };

  // Sign the FULL config as JWT — ONLYOFFICE validates this token
  // and expects the decoded payload to match the config structure
  const secret = getOnlyOfficeJwtSecret();
  const token = jwt.sign(configPayload, secret);

  return {
    ...configPayload,
    token,
  };
}

// ─── URL Builders ────────────────────────────────────────────────────────────

/**
 * Build the document download URL that ONLYOFFICE server will use to fetch the file.
 * Uses Docker-accessible URL since ONLYOFFICE runs inside a container.
 */
export function buildDownloadUrl(contractId: string, downloadToken: string): string {
  const baseUrl = getDockerAccessibleBaseUrl();
  return `${baseUrl}/api/contracts/${contractId}/download?token=${downloadToken}`;
}

/**
 * Build the callback URL that ONLYOFFICE server will call on document events.
 * Uses Docker-accessible URL since ONLYOFFICE runs inside a container.
 */
export function buildCallbackUrl(contractId: string): string {
  const baseUrl = getDockerAccessibleBaseUrl();
  return `${baseUrl}/api/onlyoffice/callback/${contractId}`;
}

// ─── Health Check URL ────────────────────────────────────────────────────────

export function getHealthCheckUrl(): string {
  return `${getOnlyOfficeServerUrl()}/healthcheck`;
}
