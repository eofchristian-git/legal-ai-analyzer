/**
 * Permission Utilities: Role-Based Access Control (RBAC)
 * Feature 006: Clause Decision Actions & Undo System
 * 
 * Provides permission checking functions for role-based access control.
 * Uses RolePermission table to map roles to permissions.
 */

import { db } from '@/lib/db';
import { Permission, ClauseStatus } from '@/types/decisions';

// ============================================================================
// Permission Checking Functions
// ============================================================================

/**
 * Check if a user has a specific permission based on their role.
 * 
 * Admin bypass: Admin role has all permissions by default (fallback logic)
 * 
 * @param userId - User ID to check
 * @param permission - Permission to verify
 * @returns true if user has the permission, false otherwise
 */
export async function hasPermission(
  userId: string,
  permission: Permission
): Promise<boolean> {
  // Fetch user with their role
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { role: true },
  });

  if (!user) {
    return false;
  }

  // Admin bypass: Admins have all permissions
  if (user.role === 'admin') {
    return true;
  }

  // Check RolePermission table for explicit permission mapping
  const rolePermission = await db.rolePermission.findUnique({
    where: {
      role_permission: {
        role: user.role,
        permission: permission,
      },
    },
  });

  return rolePermission !== null;
}

/**
 * Check if a user can access contract review features.
 * 
 * Required permission: REVIEW_CONTRACTS
 * 
 * @param userId - User ID to check
 * @returns true if user has REVIEW_CONTRACTS permission
 */
export async function canAccessContractReview(userId: string): Promise<boolean> {
  return hasPermission(userId, 'REVIEW_CONTRACTS');
}

/**
 * Check if a user can make a decision action on a specific clause.
 * 
 * Rules:
 * 1. User must have REVIEW_CONTRACTS permission
 * 2. If clause is ESCALATED:
 *    - User must be either:
 *      a) The assigned approver (escalatedToUserId === userId) with APPROVE_ESCALATIONS permission
 *      b) Admin (bypasses all checks)
 * 3. Otherwise, any user with REVIEW_CONTRACTS can make decisions
 * 
 * @param userId - User ID attempting the decision
 * @param clauseId - Clause ID to check
 * @param effectiveStatus - Current clause status (from projection)
 * @param escalatedToUserId - User ID of assigned approver (if escalated)
 * @returns true if user can make decision, false otherwise
 */
export async function canMakeDecisionOnClause(
  userId: string,
  clauseId: string,
  effectiveStatus: ClauseStatus,
  escalatedToUserId: string | null
): Promise<boolean> {
  // Check if user has basic review permission
  const canReview = await canAccessContractReview(userId);
  if (!canReview) {
    return false;
  }

  // Fetch user to check if admin
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { role: true },
  });

  if (!user) {
    return false;
  }

  // Admin bypass: Admins can always make decisions (even on escalated clauses)
  if (user.role === 'admin') {
    return true;
  }

  // If clause is escalated, check escalation-specific permissions
  if (effectiveStatus === ClauseStatus.ESCALATED) {
    // Only assigned approver (with APPROVE_ESCALATIONS permission) can decide
    if (escalatedToUserId !== userId) {
      return false;
    }

    // Verify user has APPROVE_ESCALATIONS permission
    const canApprove = await hasPermission(userId, 'APPROVE_ESCALATIONS');
    return canApprove;
  }

  // For non-escalated clauses, REVIEW_CONTRACTS permission is sufficient
  return true;
}

/**
 * Get all permissions for a specific role.
 * 
 * @param role - Role to fetch permissions for
 * @returns Array of permission strings
 */
export async function getPermissionsForRole(role: string): Promise<Permission[]> {
  // Admin bypass: Return all permissions
  if (role === 'admin') {
    return [
      'REVIEW_CONTRACTS',
      'APPROVE_ESCALATIONS',
      'MANAGE_USERS',
      'MANAGE_PLAYBOOK',
    ];
  }

  const rolePermissions = await db.rolePermission.findMany({
    where: { role },
    select: { permission: true },
  });

  return rolePermissions.map((rp) => rp.permission as Permission);
}

/**
 * Get all users with a specific permission.
 * 
 * Useful for fetching escalation assignees (users with APPROVE_ESCALATIONS).
 * 
 * @param permission - Permission to filter by
 * @returns Array of users with the permission
 */
export async function getUsersWithPermission(permission: Permission): Promise<{
  id: string;
  name: string;
  email: string;
  role: string;
}[]> {
  // Get all roles that have this permission
  const rolePermissions = await db.rolePermission.findMany({
    where: { permission },
    select: { role: true },
  });

  const roles = rolePermissions.map((rp) => rp.role);

  // Always include admin role (admin bypass)
  if (!roles.includes('admin')) {
    roles.push('admin');
  }

  // Fetch users with those roles
  const users = await db.user.findMany({
    where: { role: { in: roles } },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
    },
  });

  return users;
}
