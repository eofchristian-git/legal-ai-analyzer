/**
 * ONLYOFFICE JWT Utilities
 * Feature 009: Token generation and validation for access, download, and config tokens
 */

import jwt from 'jsonwebtoken';
import type { SessionMode, AccessTokenPayload, DownloadTokenPayload, ConfigTokenPayload } from '@/types/onlyoffice';
import {
  getOnlyOfficeJwtSecret,
  ACCESS_TOKEN_EXPIRY,
  DOWNLOAD_TOKEN_EXPIRY,
} from './config';

// ─── Access Token (4h) ──────────────────────────────────────────────────────

/**
 * Generate a JWT access token for ONLYOFFICE Document Editor authentication.
 * Expires in 4 hours.
 */
export function generateAccessToken(
  contractId: string,
  userId: string,
  mode: SessionMode
): string {
  const secret = getOnlyOfficeJwtSecret();
  return jwt.sign(
    { contractId, userId, mode },
    secret,
    { expiresIn: ACCESS_TOKEN_EXPIRY }
  );
}

/**
 * Validate and decode an access token.
 * Throws if token is invalid or expired.
 */
export function validateAccessToken(token: string): AccessTokenPayload {
  const secret = getOnlyOfficeJwtSecret();
  return jwt.verify(token, secret) as AccessTokenPayload;
}

// ─── Download Token (1h) ────────────────────────────────────────────────────

/**
 * Generate a JWT download token for the document download endpoint.
 * Expires in 1 hour. Purpose-bound to 'onlyoffice-download'.
 */
export function generateDownloadToken(contractId: string): string {
  const secret = getOnlyOfficeJwtSecret();
  return jwt.sign(
    { contractId, purpose: 'onlyoffice-download' as const },
    secret,
    { expiresIn: DOWNLOAD_TOKEN_EXPIRY }
  );
}

/**
 * Validate and decode a download token.
 * Throws if token is invalid, expired, or has wrong purpose.
 */
export function validateDownloadToken(token: string): DownloadTokenPayload {
  const secret = getOnlyOfficeJwtSecret();
  const decoded = jwt.verify(token, secret) as DownloadTokenPayload;

  if (decoded.purpose !== 'onlyoffice-download') {
    throw new Error('Invalid token purpose');
  }

  return decoded;
}

// ─── Config Token ────────────────────────────────────────────────────────────

/**
 * Sign the full ONLYOFFICE editor configuration as a JWT.
 * ONLYOFFICE validates this token to ensure config hasn't been tampered with.
 */
export function generateConfigToken(config: ConfigTokenPayload): string {
  const secret = getOnlyOfficeJwtSecret();
  return jwt.sign(config, secret);
}

// ─── Generic Token Verification ──────────────────────────────────────────────

/**
 * Verify any JWT token signed with the ONLYOFFICE secret.
 * Used for callback token verification.
 */
export function verifyToken(token: string): Record<string, unknown> {
  const secret = getOnlyOfficeJwtSecret();
  return jwt.verify(token, secret) as Record<string, unknown>;
}
