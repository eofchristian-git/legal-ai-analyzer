/**
 * API Route: Clause Projection
 * Feature 006: Clause Decision Actions & Undo System
 * 
 * GET /api/clauses/[id]/projection - Get computed effective state of a clause
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { canAccessContractReview } from '@/lib/permissions';
import { computeProjection } from '@/lib/projection';
import { getCachedProjection, setCachedProjection } from '@/lib/cache';
import { GetProjectionResponse } from '@/types/decisions';

/**
 * GET /api/clauses/[id]/projection
 * 
 * Get the computed effective state of a clause (text, status, tracked changes).
 * 
 * Uses projection cache when available to avoid expensive recomputation.
 * 
 * Authentication: Required (user must be logged in)
 * Authorization: User must have REVIEW_CONTRACTS permission
 * 
 * Response:
 * {
 *   projection: ProjectionResult,
 *   cached: boolean  // true if served from cache
 * }
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    // Authentication check
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized - Please log in' },
        { status: 401 }
      );
    }

    const { id: clauseId } = await context.params;
    const userId = session.user.id;

    // Check permissions
    const canAccess = await canAccessContractReview(userId);
    if (!canAccess) {
      return NextResponse.json(
        { error: 'Forbidden - You do not have permission to access contract review features' },
        { status: 403 }
      );
    }

    // Try to get cached projection
    let projection = getCachedProjection(clauseId);
    let cached = true;

    if (!projection) {
      // Cache miss - compute projection
      cached = false;
      projection = await computeProjection(clauseId);
      
      // Set cache for future requests
      setCachedProjection(clauseId, projection);
    }

    // Build response
    const response: GetProjectionResponse = {
      projection,
      cached,
    };

    return NextResponse.json(response, { status: 200 });
  } catch (error) {
    // T078: Enhanced error handling
    console.error('[GET /api/clauses/[id]/projection] Error:', error);
    
    // Check for Prisma-specific errors
    if (error && typeof error === 'object' && 'code' in error) {
      const prismaError = error as { code: string };
      
      if (prismaError.code === 'P2025') {
        return NextResponse.json(
          { error: 'Clause not found. It may have been deleted.' },
          { status: 404 }
        );
      }
    }
    
    return NextResponse.json(
      { error: 'Failed to compute clause projection. Please try again or contact support.' },
      { status: 500 }
    );
  }
}
