/**
 * Collabora Health Check Endpoint
 * Feature 010 T011: GET /api/collabora/health
 *
 * Probes the Collabora /hosting/discovery endpoint to verify the
 * server is running and responsive.
 *
 * Replaces: GET /api/onlyoffice/health
 */

import { NextResponse } from 'next/server';
import { getCollaboraServerUrl } from '@/lib/collabora/config';
import { isDiscoveryAvailable } from '@/lib/collabora/discovery';
import type { CollaboraHealthResponse } from '@/types/collabora';

export async function GET() {
  try {
    const serverUrl = getCollaboraServerUrl();
    const discoveryAvailable = await isDiscoveryAvailable();

    const response: CollaboraHealthResponse = {
      healthy: discoveryAvailable,
      serverUrl,
      discoveryAvailable,
      timestamp: new Date().toISOString(),
    };

    return NextResponse.json(response, {
      status: discoveryAvailable ? 200 : 503,
    });
  } catch (error) {
    console.error('[Collabora Health] Error:', error);
    return NextResponse.json(
      {
        healthy: false,
        serverUrl: process.env.COLLABORA_SERVER_URL || 'unknown',
        discoveryAvailable: false,
        timestamp: new Date().toISOString(),
      } satisfies CollaboraHealthResponse,
      { status: 503 }
    );
  }
}
