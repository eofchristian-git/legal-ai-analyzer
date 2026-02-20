/**
 * Collabora Online Server Configuration Utility
 * Feature 010: Centralized Collabora configuration and URL builders
 */

// ─── Environment Configuration ───────────────────────────────────────────────

/**
 * Get the Collabora server URL (browser-accessible).
 * Used for constructing iframe URLs and health checks from the client side.
 */
export function getCollaboraServerUrl(): string {
  const url = process.env.COLLABORA_SERVER_URL;
  if (!url) {
    throw new Error('COLLABORA_SERVER_URL environment variable is not set');
  }
  return url.replace(/\/$/, ''); // Remove trailing slash
}

/**
 * Get the public Collabora server URL (exposed to browser).
 * Falls back to COLLABORA_SERVER_URL if not set separately.
 */
export function getPublicCollaboraServerUrl(): string {
  return (
    process.env.NEXT_PUBLIC_COLLABORA_SERVER_URL ||
    process.env.COLLABORA_SERVER_URL ||
    'http://localhost:9980'
  ).replace(/\/$/, '');
}

/**
 * Get the JWT secret used for signing WOPI access tokens.
 */
export function getCollaboraJwtSecret(): string {
  const secret = process.env.COLLABORA_JWT_SECRET;
  if (!secret) {
    throw new Error('COLLABORA_JWT_SECRET environment variable is not set');
  }
  return secret;
}

/**
 * Get the base URL that Collabora (inside Docker) uses to reach our Next.js app.
 * Falls back to host.docker.internal for local dev.
 */
export function getDockerAccessibleBaseUrl(): string {
  return (
    process.env.COLLABORA_APP_CALLBACK_URL ||
    'http://host.docker.internal:3000'
  ).replace(/\/$/, '');
}

/**
 * Get the application base URL (browser-accessible).
 */
export function getAppBaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  ).replace(/\/$/, '');
}

// ─── Token Configuration ─────────────────────────────────────────────────────

/** WOPI access token expiration: 4 hours */
export const WOPI_TOKEN_EXPIRY = '4h';
export const WOPI_TOKEN_EXPIRY_MS = 4 * 60 * 60 * 1000;

// ─── URL Builders ────────────────────────────────────────────────────────────

/**
 * Build the WOPI source URL that Collabora uses to call our WOPI endpoints.
 * Uses the Docker-accessible base URL since Collabora runs inside a container.
 */
export function buildWopiSrc(fileId: string): string {
  const baseUrl = getDockerAccessibleBaseUrl();
  return `${baseUrl}/api/wopi/files/${fileId}`;
}

/**
 * Build the Collabora discovery endpoint URL.
 */
export function getDiscoveryUrl(): string {
  return `${getCollaboraServerUrl()}/hosting/discovery`;
}
