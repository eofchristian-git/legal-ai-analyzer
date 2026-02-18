/**
 * Collabora WOPI Token Utilities
 * Feature 010: Stateless JWT token generation and validation for WOPI access
 */

import jwt from 'jsonwebtoken';
import type { WopiAccessTokenPayload } from '@/types/collabora';
import { getCollaboraJwtSecret, WOPI_TOKEN_EXPIRY } from './config';

// ─── Token Generation ────────────────────────────────────────────────────────

/**
 * Generate a stateless WOPI access token (JWT).
 * This token is passed in the iframe URL and forwarded by Collabora
 * on every WOPI request (CheckFileInfo, GetFile).
 */
export function generateWopiToken(
  fileId: string,
  userId: string,
  userName: string,
  permission: 'view' | 'edit' = 'view'
): string {
  const secret = getCollaboraJwtSecret();
  return jwt.sign(
    { fileId, userId, userName, permission } satisfies Omit<WopiAccessTokenPayload, 'iat' | 'exp'>,
    secret,
    { expiresIn: WOPI_TOKEN_EXPIRY }
  );
}

// ─── Token Validation ────────────────────────────────────────────────────────

/**
 * Validate and decode a WOPI access token.
 * Throws if the token is invalid, expired, or malformed.
 */
export function validateWopiToken(token: string): WopiAccessTokenPayload {
  const secret = getCollaboraJwtSecret();
  const decoded = jwt.verify(token, secret) as WopiAccessTokenPayload;

  // Verify required claims
  if (!decoded.fileId || !decoded.userId || !decoded.permission) {
    throw new Error('WOPI token missing required claims');
  }

  return decoded;
}

/**
 * Validate a WOPI token and verify it grants access to the specified file.
 * Returns the decoded token or throws on mismatch/invalid token.
 */
export function validateWopiTokenForFile(
  token: string,
  fileId: string
): WopiAccessTokenPayload {
  const decoded = validateWopiToken(token);

  if (decoded.fileId !== fileId) {
    throw new Error('WOPI token fileId does not match requested file');
  }

  return decoded;
}
