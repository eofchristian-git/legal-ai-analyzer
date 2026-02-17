/**
 * API Route: Clause Decisions
 * Feature 007: Per-Finding Decision Actions
 *
 * POST /api/clauses/[id]/decisions - Apply a finding-level decision action
 * GET /api/clauses/[id]/decisions - Get decision history (includes legacy + finding-level)
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
import { canMakeDecisionOnFinding } from '@/lib/permissions';
import { computeProjection } from '@/lib/projection';
import { invalidateCachedProjection } from '@/lib/cache';

/**
 * POST /api/clauses/[id]/decisions
 *
 * Apply a finding-level decision action.
 * Requires findingId for all new decisions (Feature 007).
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized - Please log in' },
        { status: 401 }
      );
    }

    const { id: clauseId } = await context.params;
    const userId = session.user.id;

    const body: ApplyDecisionRequest = await request.json();
    const { actionType, payload, clauseUpdatedAtWhenLoaded, findingId } = body;

    // Validate findingId is present (Feature 007: required for all decisions)
    if (!findingId) {
      return NextResponse.json(
        { error: 'findingId is required for all decisions' },
        { status: 400 }
      );
    }

    // Validate actionType
    const validActionTypes = Object.values(DecisionActionType);
    if (!validActionTypes.includes(actionType)) {
      return NextResponse.json(
        { error: `Invalid actionType. Must be one of: ${validActionTypes.join(', ')}` },
        { status: 400 }
      );
    }

    // Validate finding exists and belongs to this clause
    const finding = await db.analysisFinding.findUnique({
      where: { id: findingId },
      select: { id: true, clauseId: true },
    });

    if (!finding) {
      return NextResponse.json(
        { error: 'Finding not found' },
        { status: 404 }
      );
    }

    if (finding.clauseId !== clauseId) {
      return NextResponse.json(
        { error: 'Finding does not belong to this clause' },
        { status: 400 }
      );
    }

    // Validate payload for specific action types
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

      const hasApprovalPermission = await db.rolePermission.findFirst({
        where: { role: assignee.role, permission: 'APPROVE_ESCALATIONS' },
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

      // Validate undoneDecisionId references a decision with the same findingId
      const targetDecision = await db.clauseDecision.findUnique({
        where: { id: undoPayload.undoneDecisionId },
        select: { findingId: true },
      });

      if (!targetDecision) {
        return NextResponse.json(
          { error: 'Target decision for undo not found' },
          { status: 400 }
        );
      }

      if (targetDecision.findingId !== findingId) {
        return NextResponse.json(
          { error: 'Cannot undo a decision from a different finding' },
          { status: 400 }
        );
      }
    }

    // Fetch clause for conflict detection
    const clause = await db.analysisClause.findUnique({
      where: { id: clauseId },
      select: { id: true, updatedAt: true },
    });

    if (!clause) {
      return NextResponse.json(
        { error: 'Clause not found' },
        { status: 404 }
      );
    }

    // Permission check: finding-level escalation lock
    const currentProjection = await computeProjection(clauseId);
    const canMakeDecision = await canMakeDecisionOnFinding(
      userId,
      clauseId,
      findingId,
      currentProjection.findingStatuses
    );

    if (!canMakeDecision) {
      return NextResponse.json(
        { error: 'Forbidden - You do not have permission to make decisions on this finding' },
        { status: 403 }
      );
    }

    // Conflict detection
    let conflictWarning = undefined;
    if (clauseUpdatedAtWhenLoaded) {
      const loadedAt = new Date(clauseUpdatedAtWhenLoaded);
      if (clause.updatedAt > loadedAt) {
        conflictWarning = {
          message: 'This clause was modified by another user since you loaded it. Your change has been applied, but you may want to review.',
          lastUpdatedAt: clause.updatedAt.toISOString(),
          lastUpdatedBy: 'Unknown',
        };
      }
    }

    // Create ClauseDecision with findingId
    const decision = await db.clauseDecision.create({
      data: {
        clause: { connect: { id: clauseId } },
        user: { connect: { id: userId } },
        finding: { connect: { id: findingId } },
        actionType,
        payload: JSON.stringify(payload),
      },
      include: {
        user: {
          select: { id: true, name: true, email: true },
        },
        finding: {
          select: { id: true, riskLevel: true, matchedRuleTitle: true },
        },
      },
    });

    // Invalidate cache and recompute
    invalidateCachedProjection(clauseId);
    const newProjection = await computeProjection(clauseId);

    const response: ApplyDecisionResponse = {
      success: true,
      decision: {
        id: decision.id,
        clauseId: decision.clauseId,
        findingId: decision.findingId,
        userId: decision.userId,
        actionType: decision.actionType as DecisionActionType,
        timestamp: decision.timestamp,
        payload: JSON.parse(decision.payload) as ClauseDecisionPayload,
        user: decision.user,
        finding: decision.finding,
      },
      projection: newProjection,
      conflictWarning,
    };

    return NextResponse.json(response, { status: 200 });
  } catch (error) {
    console.error('[POST /api/clauses/[id]/decisions] Error:', error);

    if (error && typeof error === 'object' && 'code' in error) {
      const prismaError = error as { code: string };
      if (prismaError.code === 'P2002') {
        return NextResponse.json(
          { error: 'Duplicate decision detected. Please refresh and try again.' },
          { status: 409 }
        );
      } else if (prismaError.code === 'P2025') {
        return NextResponse.json(
          { error: 'Clause or finding not found. It may have been deleted.' },
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
 * Includes finding info and legacy indicator.
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized - Please log in' },
        { status: 401 }
      );
    }

    const { id: clauseId } = await context.params;
    const userId = session.user.id;

    const { canAccessContractReview } = await import('@/lib/permissions');
    const canAccess = await canAccessContractReview(userId);

    if (!canAccess) {
      return NextResponse.json(
        { error: 'Forbidden - You do not have permission to access contract review features' },
        { status: 403 }
      );
    }

    const rawDecisions = await db.clauseDecision.findMany({
      where: { clauseId },
      orderBy: { timestamp: 'asc' },
      include: {
        user: {
          select: { id: true, name: true, email: true },
        },
        finding: {
          select: { id: true, riskLevel: true, matchedRuleTitle: true },
        },
      },
    });

    const decisions = rawDecisions.map(d => ({
      id: d.id,
      clauseId: d.clauseId,
      findingId: d.findingId,
      userId: d.userId,
      actionType: d.actionType as DecisionActionType,
      timestamp: d.timestamp,
      payload: JSON.parse(d.payload) as ClauseDecisionPayload,
      user: d.user,
      finding: d.finding ?? null,
      isLegacy: d.findingId === null,
    }));

    return NextResponse.json({ decisions }, { status: 200 });
  } catch (error) {
    console.error('[GET /api/clauses/[id]/decisions] Error:', error);

    return NextResponse.json(
      { error: 'Failed to retrieve decision history. Please try again or contact support.' },
      { status: 500 }
    );
  }
}
