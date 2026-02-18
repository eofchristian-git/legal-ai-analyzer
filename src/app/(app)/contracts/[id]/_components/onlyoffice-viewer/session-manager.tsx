"use client";

/**
 * ONLYOFFICE Client-Side Session Manager
 * Feature 009 T014: Automatic token refresh with 3.5h interval
 * Runs as a hidden component that manages the session lifecycle
 */

import { useEffect, useRef, useCallback } from "react";

/** Client-side refresh interval: 3.5 hours (30 min before 4h expiry) */
const REFRESH_INTERVAL_MS = 3.5 * 60 * 60 * 1000;

/** Minimum time before expiry to trigger refresh: 30 minutes */
const MIN_REFRESH_WINDOW_MS = 30 * 60 * 1000;

interface SessionManagerProps {
  sessionId: string;
  expiresAt: string; // ISO 8601
  onTokenRefreshed: (newToken: string) => void;
  onRefreshError: (error: string) => void;
}

export function SessionManager({
  sessionId,
  expiresAt,
  onTokenRefreshed,
  onRefreshError,
}: SessionManagerProps) {
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sessionIdRef = useRef(sessionId);

  // Keep ref up to date
  useEffect(() => {
    sessionIdRef.current = sessionId;
  }, [sessionId]);

  // Refresh the token via API
  const refreshToken = useCallback(async () => {
    try {
      console.log("[ONLYOFFICE] Refreshing session token...");

      const response = await fetch("/api/onlyoffice/token", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: sessionIdRef.current }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || `Token refresh failed (${response.status})`);
      }

      const data = await response.json();
      console.log(
        `[ONLYOFFICE] Token refreshed. New expiry: ${data.expiresAt}`
      );

      onTokenRefreshed(data.accessToken);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Token refresh failed";
      console.error("[ONLYOFFICE] Token refresh error:", message);
      onRefreshError(message);
    }
  }, [onTokenRefreshed, onRefreshError]);

  // Set up automatic refresh timer
  useEffect(() => {
    // Calculate time until first refresh
    const expiresAtMs = new Date(expiresAt).getTime();
    const now = Date.now();
    const timeUntilExpiry = expiresAtMs - now;
    const timeUntilRefresh = Math.max(
      timeUntilExpiry - MIN_REFRESH_WINDOW_MS,
      60 * 1000 // At least 1 minute from now
    );

    console.log(
      `[ONLYOFFICE] Session expires at: ${expiresAt}`,
      `\n  Time until expiry: ${Math.round(timeUntilExpiry / 60000)} min`,
      `\n  First refresh in: ${Math.round(timeUntilRefresh / 60000)} min`
    );

    // Schedule first refresh
    const firstRefresh = setTimeout(() => {
      refreshToken();

      // Then set up recurring refresh at the standard interval
      timerRef.current = setInterval(refreshToken, REFRESH_INTERVAL_MS);
    }, timeUntilRefresh);

    return () => {
      clearTimeout(firstRefresh);
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [expiresAt, refreshToken]);

  // This component renders nothing — it's purely a lifecycle manager
  return null;
}
