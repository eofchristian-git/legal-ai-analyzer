/**
 * API Route: Clause Decisions
 * Feature 006: Clause Decision Actions & Undo System
 * 
 * POST /api/clauses/[id]/decisions - Apply a decision action to a clause
 * GET /api/clauses/[id]/decisions - Get decision history for a clause
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { 
  ApplyDecisionRequest, 
  ApplyDecisionResponse,
  DecisionActionType,
  ClauseDecisionPayload,
} from '@/types/decisions';
import { canMakeDecisionOnClause } from '@/lib/permissions';
import { computeProjection } from '@/lib/projection';
import { invalidateCachedProjection } from '@/lib/cache';

/**
 * POST /api/clauses/[id]/decisions
 * 
 * Apply a decision action to a clause (e.g., accept, replace, edit, escalate, undo, revert).
 * 
 * Authentication: Required (user must be logged in)
 * Authorization: User must have REVIEW_CONTRACTS permission (checked in implementation)
 * 
 * Request Body:
 * {
 *   actionType: DecisionActionType,
 *   payload: ClauseDecisionPayload,
 *   clauseUpdatedAtWhenLoaded?: string  // For conflict detection
 * }
 * 
 * Response:
 * {
 *   success: boolean,
 *   decision: ClauseDecision,
 *   projection: ProjectionResult,
 *   conflictWarning?: { message: string, lastUpdatedAt: string, lastUpdatedBy: string }
 * }
 */
export async function POST(
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

    // Parse request body
    const body: ApplyDecisionRequest = await request.json();
    const { actionType, payload, clauseUpdatedAtWhenLoaded } = body;

    // Validate actionType
    const validActionTypes = Object.values(DecisionActionType);
    if (!validActionTypes.includes(actionType)) {
      return NextResponse.json(
        { error: `Invalid actionType. Must be one of: ${validActionTypes.join(', ')}` },
        { status: 400 }
      );
    }

    // T032: Validate payload for specific action types
    if (actionType === DecisionActionType.APPLY_FALLBACK) {
      const fallbackPayload = payload as any;
      if (!fallbackPayload.replacementText || !fallbackPayload.source || !fallbackPayload.playbookRuleId) {
        return NextResponse.json(
          { error: 'APPLY_FALLBACK requires replacementText, source, and playbookRuleId in payload' },
          { status: 400 }
        );
      }
    } else if (actionType === DecisionActionType.EDIT_MANUAL) {
      const editPayload = payload as any;
      if (!editPayload.replacementText) {
        return NextResponse.json(
          { error: 'EDIT_MANUAL requires replacementText in payload' },
          { status: 400 }
        );
      }
    } else if (actionType === DecisionActionType.ESCALATE) {
      const escalatePayload = payload as any;
      if (!escalatePayload.reason || !escalatePayload.comment || !escalatePayload.assigneeId) {
        return NextResponse.json(
          { error: 'ESCALATE requires reason, comment, and assigneeId in payload' },
          { status: 400 }
        );
      }
      
      // T052: Validate assigneeId has APPROVE_ESCALATIONS permission
      const assignee = await db.user.findUnique({
        where: { id: escalatePayload.assigneeId },
        select: { id: true, role: true },
      });
      
      if (!assignee) {
        return NextResponse.json(
          { error: 'Assignee user not found' },
          { status: 400 }
        );
      }
      
      // Check if assignee has APPROVE_ESCALATIONS permission
      const hasApprovalPermission = await db.rolePermission.findFirst({
        where: {
          role: assignee.role,
          permission: 'APPROVE_ESCALATIONS',
        },
      });
      
      if (!hasApprovalPermission && assignee.role !== 'admin') {
        return NextResponse.json(
          { error: 'Assignee does not have approval permissions' },
          { status: 400 }
        );
      }
    } else if (actionType === DecisionActionType.ADD_NOTE) {
      const notePayload = payload as any;
      if (!notePayload.noteText) {
        return NextResponse.json(
          { error: 'ADD_NOTE requires noteText in payload' },
          { status: 400 }
        );
      }
    } else if (actionType === DecisionActionType.UNDO) {
      const undoPayload = payload as any;
      if (!undoPayload.undoneDecisionId) {
        return NextResponse.json(
          { error: 'UNDO requires undoneDecisionId in payload' },
          { status: 400 }
        );
      }
    }
    // T061: REVERT has empty payload - no validation needed

    // Fetch clause to check existence and get current state
    const clause = await db.analysisClause.findUnique({
      where: { id: clauseId },
      select: {
        id: true,
        updatedAt: true,
      },
    });

    if (!clause) {
      return NextResponse.json(
        { error: 'Clause not found' },
        { status: 404 }
      );
    }

    // Compute current projection for permission check
    const currentProjection = await computeProjection(clauseId);

    // Check permissions
    const canMakeDecision = await canMakeDecisionOnClause(
      userId,
      clauseId,
      currentProjection.effectiveStatus,
      currentProjection.escalatedToUserId
    );

    if (!canMakeDecision) {
      return NextResponse.json(
        { error: 'Forbidden - You do not have permission to make decisions on this clause' },
        { status: 403 }
      );
    }

    // Conflict detection (optimistic locking)
    let conflictWarning = undefined;
    if (clauseUpdatedAtWhenLoaded) {
      const loadedAt = new Date(clauseUpdatedAtWhenLoaded);
      if (clause.updatedAt > loadedAt) {
        // Clause was modified after user loaded it - warn but allow
        conflictWarning = {
          message: 'This clause was modified by another user since you loaded it. Your change has been applied, but you may want to review.',
          lastUpdatedAt: clause.updatedAt.toISOString(),
          lastUpdatedBy: 'Unknown', // Can be enhanced to track last modifier
        };
      }
    }

    // Create ClauseDecision record
    const decision = await db.clauseDecision.create({
      data: {
        clauseId,
        userId,
        actionType,
        payload: JSON.stringify(payload),
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    // Invalidate projection cache
    invalidateCachedProjection(clauseId);

    // Compute new projection
    const newProjection = await computeProjection(clauseId);

    // Build response
    const response: ApplyDecisionResponse = {
      success: true,
      decision: {
        id: decision.id,
        clauseId: decision.clauseId,
        userId: decision.userId,
        actionType: decision.actionType as DecisionActionType,
        timestamp: decision.timestamp,
        payload: JSON.parse(decision.payload) as ClauseDecisionPayload,
        user: decision.user,
      },
      projection: newProjection,
      conflictWarning,
    };

    return NextResponse.json(response, { status: 200 });
  } catch (error) {
    // T078: Enhanced database error handling
    console.error('[POST /api/clauses/[id]/decisions] Error:', error);
    
    // Check for Prisma-specific errors
    if (error && typeof error === 'object' && 'code' in error) {
      const prismaError = error as { code: string; meta?: any };
      
      if (prismaError.code === 'P2002') {
        return NextResponse.json(
          { error: 'Duplicate decision detected. Please refresh and try again.' },
          { status: 409 }
        );
      } else if (prismaError.code === 'P2025') {
        return NextResponse.json(
          { error: 'Clause not found. It may have been deleted.' },
          { status: 404 }
        );
      }
    }
    
    return NextResponse.json(
      { error: 'Internal server error. Please try again or contact support.' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/clauses/[id]/decisions
 * 
 * Get decision history for a clause (chronological order).
 * 
 * Authentication: Required (user must be logged in)
 * Authorization: User must have REVIEW_CONTRACTS permission
 * 
 * Query Parameters: None (future: actionType, userId, date filters)
 * 
 * Response:
 * {
 *   decisions: ClauseDecision[]
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
    const { canAccessContractReview } = await import('@/lib/permissions');
    const canAccess = await canAccessContractReview(userId);
    
    if (!canAccess) {
      return NextResponse.json(
        { error: 'Forbidden - You do not have permission to access contract review features' },
        { status: 403 }
      );
    }

    // Fetch decision history
    const rawDecisions = await db.clauseDecision.findMany({
      where: { clauseId },
      orderBy: { timestamp: 'asc' },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    // Parse payloads
    const decisions = rawDecisions.map((d) => ({
      id: d.id,
      clauseId: d.clauseId,
      userId: d.userId,
      actionType: d.actionType as DecisionActionType,
      timestamp: d.timestamp,
      payload: JSON.parse(d.payload) as ClauseDecisionPayload,
      user: d.user,
    }));

    return NextResponse.json({ decisions }, { status: 200 });
  } catch (error) {
    // T078: Enhanced database error handling
    console.error('[GET /api/clauses/[id]/decisions] Error:', error);
    
    return NextResponse.json(
      { error: 'Failed to retrieve decision history. Please try again or contact support.' },
      { status: 500 }
    );
  }
}
