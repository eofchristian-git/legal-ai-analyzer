/**
 * ONLYOFFICE Callback API Endpoint
 * Feature 009: POST /api/onlyoffice/callback/[contractId]
 * Receives document save events from ONLYOFFICE Document Server
 * Authentication: JWT token in request body
 */

import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import { db } from '@/lib/db';
import { verifyToken } from '@/lib/onlyoffice/jwt';
import { isJwtEnabled } from '@/lib/onlyoffice/config';
import type { CallbackRequest, CallbackResponse } from '@/types/onlyoffice';

function jsonResponse(body: CallbackResponse): NextResponse {
  return NextResponse.json(body, { status: 200 });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ contractId: string }> }
) {
  try {
    const { contractId } = await params;
    const body: CallbackRequest = await request.json();
    const { key, status, url, token } = body;

    console.log(`ONLYOFFICE callback - Contract: ${contractId}, Status: ${status}, Key: ${key}`);

    // Verify JWT token if JWT authentication is enabled
    if (isJwtEnabled() && token) {
      try {
        verifyToken(token);
      } catch (error) {
        console.error('Invalid ONLYOFFICE callback token:', error);
        return jsonResponse({ error: 1 });
      }
    }

    // Validate document key format matches contract ID
    if (!key.startsWith(`contract-${contractId}-`)) {
      console.error(`Document key mismatch: expected contract-${contractId}-*, got ${key}`);
      return jsonResponse({ error: 1 });
    }

    // Handle different ONLYOFFICE status codes
    switch (status) {
      case 1: // Editing — document is being edited, no action needed
        console.log('Document is being edited');
        return jsonResponse({ error: 0 });

      case 2: // MustSave — document ready for saving
      case 6: { // MustForceSave — force save requested
        if (!url) {
          console.error('Missing download URL for save callback');
          return jsonResponse({ error: 1 });
        }

        // Download edited document from ONLYOFFICE server
        const response = await fetch(url);
        if (!response.ok) {
          console.error(`Failed to download edited document from ONLYOFFICE: ${response.status}`);
          return jsonResponse({ error: 1 });
        }

        const fileBuffer = Buffer.from(await response.arrayBuffer());

        // Find contract and associated document
        const contract = await db.contract.findUnique({
          where: { id: contractId },
          include: { document: true },
        });

        if (!contract || !contract.document) {
          console.error(`Contract not found: ${contractId}`);
          return jsonResponse({ error: 1 });
        }

        // Generate new filename with timestamp to avoid overwriting
        const uploadDir = path.dirname(contract.document.filePath);
        const ext = path.extname(contract.document.filename);
        const baseName = path.basename(contract.document.filename, ext);
        const timestamp = Date.now();
        const newFilename = `${baseName}-edited-${timestamp}${ext}`;
        const newFilePath = path.join(uploadDir, newFilename);

        // Save edited document to file system
        await fs.writeFile(newFilePath, fileBuffer);

        // Update document record to point to new version
        await db.document.update({
          where: { id: contract.document.id },
          data: {
            filePath: newFilePath,
            filename: newFilename,
          },
        });

        console.log(`Document saved: ${newFilePath}`);
        return jsonResponse({ error: 0 });
      }

      case 4: // Closed — document closed with no changes
        console.log('Document closed with no changes');
        return jsonResponse({ error: 0 });

      case 0: // NotFound
      case 3: // Corrupted
      case 7: // CorruptedForceSave
        console.error(`Document error (status ${status})`);
        return jsonResponse({ error: 1 });

      default:
        console.warn(`Unknown ONLYOFFICE callback status: ${status}`);
        return jsonResponse({ error: 0 }); // Don't block ONLYOFFICE
    }
  } catch (error) {
    console.error('ONLYOFFICE callback error:', error);
    return jsonResponse({ error: 1 });
  }
}
