/**
 * API Route: Users
 * Feature 006: Clause Decision Actions & Undo System
 * 
 * GET /api/users - Get list of users (filtered by permission)
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getUsersWithPermission } from '@/lib/permissions';
import { Permission } from '@/types/decisions';

/**
 * GET /api/users
 * 
 * Get list of users, optionally filtered by permission.
 * 
 * Query Parameters:
 * - permission (optional): Filter users by permission (e.g., "APPROVE_ESCALATIONS")
 * 
 * Response:
 * {
 *   users: [
 *     { id: string, name: string, email: string, role: string }
 *   ]
 * }
 */
export async function GET(request: NextRequest) {
  try {
    // Authentication check
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized - Please log in' },
        { status: 401 }
      );
    }

    // Get query parameters
    const { searchParams } = new URL(request.url);
    const permissionFilter = searchParams.get('permission') as Permission | null;

    // T054: If permission filter provided, fetch users with that permission
    if (permissionFilter) {
      const users = await getUsersWithPermission(permissionFilter);
      return NextResponse.json({ users }, { status: 200 });
    }

    // Otherwise, return error (require permission filter for now)
    return NextResponse.json(
      { error: 'Permission filter required (e.g., ?permission=APPROVE_ESCALATIONS)' },
      { status: 400 }
    );
  } catch (error) {
    console.error('[GET /api/users] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch users' },
      { status: 500 }
    );
  }
}
