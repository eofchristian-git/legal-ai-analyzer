/**
 * ONLYOFFICE Health Check Endpoint
 * Feature 009 T036: Monitors ONLYOFFICE Document Server availability
 *
 * Returns:
 * - status: true/false — whether ONLYOFFICE is reachable
 * - serverUrl: the configured ONLYOFFICE server URL
 * - latencyMs: response time in milliseconds
 * - timestamp: check time
 */

import { NextResponse } from 'next/server';
import { getHealthCheckUrl, getOnlyOfficeServerUrl } from '@/lib/onlyoffice/config';

export async function GET() {
  const serverUrl = (() => {
    try {
      return getOnlyOfficeServerUrl();
    } catch {
      return null;
    }
  })();

  if (!serverUrl) {
    return NextResponse.json({
      status: false,
      serverUrl: null,
      error: 'ONLYOFFICE_SERVER_URL not configured',
      latencyMs: null,
      timestamp: new Date().toISOString(),
    });
  }

  const healthCheckUrl = getHealthCheckUrl();
  const startTime = Date.now();

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000); // 5s timeout

    const response = await fetch(healthCheckUrl, {
      method: 'GET',
      signal: controller.signal,
    });
    clearTimeout(timeout);

    const latencyMs = Date.now() - startTime;
    const healthy = response.ok;
    let body: string | null = null;

    try {
      body = await response.text();
    } catch {
      // Ignore body read errors
    }

    return NextResponse.json({
      status: healthy,
      serverUrl,
      latencyMs,
      httpStatus: response.status,
      body: body?.substring(0, 200) || null, // Truncate for safety
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const latencyMs = Date.now() - startTime;
    const message = error instanceof Error ? error.message : 'Unknown error';

    return NextResponse.json({
      status: false,
      serverUrl,
      latencyMs,
      error: message.includes('abort') ? 'Timeout (5s)' : message,
      timestamp: new Date().toISOString(),
    });
  }
}
