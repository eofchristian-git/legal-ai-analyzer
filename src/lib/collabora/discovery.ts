/**
 * Collabora WOPI Discovery Client
 * Feature 010: Fetch and cache the Collabora /hosting/discovery endpoint
 * to resolve the iframe URL pattern for document viewing.
 */

import { getDiscoveryUrl, getCollaboraServerUrl } from './config';

// ─── Cache ───────────────────────────────────────────────────────────────────

interface DiscoveryCache {
  viewUrl: string;
  fetchedAt: number;
}

/** Cache the discovery result for 1 hour */
const DISCOVERY_CACHE_TTL_MS = 60 * 60 * 1000;

let discoveryCache: DiscoveryCache | null = null;

// ─── Discovery Fetcher ───────────────────────────────────────────────────────

/**
 * Extract the viewer URL from the Collabora discovery XML.
 * Parses the XML to find the `urlsrc` for the `view` action
 * for DOCX files (application/vnd.openxmlformats-officedocument.wordprocessingml.document).
 */
function extractViewUrlFromXml(xml: string): string | null {
  // Match the <action> element with name="view" for DOCX files
  // The discovery XML structure:
  //   <app name="application/vnd.openxmlformats-officedocument.wordprocessingml.document">
  //     <action ext="docx" name="view" urlsrc="https://..."/>
  //   </app>
  const docxAppPattern =
    /<app[^>]+name\s*=\s*["']application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document["'][^>]*>([\s\S]*?)<\/app>/i;
  const appMatch = xml.match(docxAppPattern);

  if (!appMatch) {
    // Fallback: try matching any action with ext="docx" and name="view"
    const fallbackPattern =
      /<action[^>]+ext\s*=\s*["']docx["'][^>]+name\s*=\s*["']view["'][^>]+urlsrc\s*=\s*["']([^"']+)["']/i;
    const fallbackMatch = xml.match(fallbackPattern);
    return fallbackMatch?.[1] ?? null;
  }

  const appContent = appMatch[1];
  // Extract urlsrc from the view action within the matched app block
  const actionPattern =
    /<action[^>]+name\s*=\s*["']view["'][^>]+urlsrc\s*=\s*["']([^"']+)["']/i;
  const actionMatch = appContent.match(actionPattern);

  if (!actionMatch) {
    // Try reversed attribute order: urlsrc before name
    const reversedPattern =
      /<action[^>]+urlsrc\s*=\s*["']([^"']+)["'][^>]+name\s*=\s*["']view["']/i;
    const reversedMatch = appContent.match(reversedPattern);
    return reversedMatch?.[1] ?? null;
  }

  return actionMatch[1];
}

/**
 * Rewrite the host portion of a URL extracted from discovery XML.
 *
 * Collabora's discovery endpoint often returns URLs using the container-internal
 * hostname (e.g. `http://localhost/browser/…`) without the mapped port.  We
 * need to replace the origin with our configured `COLLABORA_SERVER_URL` so the
 * browser can actually reach Collabora.
 */
function rewriteDiscoveryUrl(rawUrl: string): string {
  try {
    const collaboraOrigin = getCollaboraServerUrl(); // e.g. http://localhost:9980
    const parsed = new URL(rawUrl);
    const target = new URL(collaboraOrigin);

    parsed.protocol = target.protocol;
    parsed.hostname = target.hostname;
    parsed.port = target.port;

    return parsed.toString();
  } catch {
    // If URL parsing fails, return the raw URL unchanged
    return rawUrl;
  }
}

/**
 * Fetch the Collabora WOPI discovery endpoint and extract the viewer URL.
 * Results are cached for 1 hour to avoid repeated HTTP calls.
 *
 * @returns The base URL pattern for the Collabora viewer iframe
 * @throws If the discovery endpoint is unreachable or returns invalid data
 */
export async function getCollaboraViewerUrl(): Promise<string> {
  // Return cached value if still fresh
  if (discoveryCache && Date.now() - discoveryCache.fetchedAt < DISCOVERY_CACHE_TTL_MS) {
    return discoveryCache.viewUrl;
  }

  const discoveryUrl = getDiscoveryUrl();

  const response = await fetch(discoveryUrl, {
    signal: AbortSignal.timeout(10_000), // 10 second timeout
  });

  if (!response.ok) {
    throw new Error(
      `Collabora discovery endpoint returned ${response.status}: ${response.statusText}`
    );
  }

  const xml = await response.text();
  const rawViewUrl = extractViewUrlFromXml(xml);

  if (!rawViewUrl) {
    throw new Error(
      'Failed to extract DOCX viewer URL from Collabora discovery XML'
    );
  }

  // Rewrite the host so the browser can reach the Collabora server via the
  // mapped Docker port (e.g. localhost:9980 instead of localhost:80)
  const viewUrl = rewriteDiscoveryUrl(rawViewUrl);

  // Cache the result
  discoveryCache = {
    viewUrl,
    fetchedAt: Date.now(),
  };

  return viewUrl;
}

/**
 * Build the full iframe URL for viewing a document in Collabora.
 *
 * @param viewerBaseUrl - The base URL from discovery (e.g. http://localhost:9980/browser/dist/cool.html?)
 * @param wopiSrc - The encoded WOPI source URL pointing to our CheckFileInfo endpoint
 * @param accessToken - The JWT access token for WOPI authentication
 * @returns Full iframe URL ready to be set as iframe src
 */
export function buildIframeUrl(
  viewerBaseUrl: string,
  wopiSrc: string,
  accessToken: string
): string {
  // The viewerBaseUrl from discovery may already end with '?' or may not
  const separator = viewerBaseUrl.includes('?') ? '&' : '?';
  const encodedWopiSrc = encodeURIComponent(wopiSrc);

  // NOTE: We intentionally omit `permission=readonly` here. Collabora's
  // read-only mode blocks `.uno:ExecuteSearch` via postMessage, which breaks
  // our clause navigation. Instead we set UserCanWrite: true in WOPI
  // CheckFileInfo and rely on UI stripping + no PutFile endpoint for safety.
  // ui_defaults: classic mode without the right-side Styles/Character sidebar.
  const uiDefaults = encodeURIComponent('UIMode=classic;TextSidebar=false');

  return `${viewerBaseUrl}${separator}WOPISrc=${encodedWopiSrc}&access_token=${accessToken}&closebutton=0&ui_defaults=${uiDefaults}`;
}

/**
 * Check if the Collabora discovery endpoint is reachable.
 * Used for health checks.
 */
export async function isDiscoveryAvailable(): Promise<boolean> {
  try {
    const discoveryUrl = getDiscoveryUrl();
    const response = await fetch(discoveryUrl, {
      signal: AbortSignal.timeout(5_000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Clear the discovery cache. Useful for testing or when the
 * Collabora server is restarted.
 */
export function clearDiscoveryCache(): void {
  discoveryCache = null;
}
