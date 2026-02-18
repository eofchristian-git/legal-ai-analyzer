/**
 * GET /api/contracts/[id]/onlyoffice-tracked-changes
 *
 * Returns TrackChangeData[] for all clauses in the contract that have
 * active APPLY_FALLBACK or EDIT_MANUAL decisions. Handles UNDO and REVERT
 * using the same replay logic as the projection engine.
 *
 * Used by the ONLYOFFICE viewer to inject fallback/manual-edit changes as
 * tracked changes via the Connector API (Developer Edition).
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import type { TrackChangeData, DecisionActionType } from '@/types/onlyoffice';

interface RawPayload {
  replacementText?: string;
  undoneDecisionId?: string;
}

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: contractId } = await context.params;

    // Verify contract exists
    const contract = await db.contract.findUnique({
      where: { id: contractId },
      select: { id: true },
    });

    if (!contract) {
      return NextResponse.json({ error: 'Contract not found' }, { status: 404 });
    }

    // Fetch all clauses with their text and relevant decisions (text-modifying + UNDO + REVERT)
    const clauses = await db.analysisClause.findMany({
      where: { analysis: { contractId } },
      select: {
        id: true,
        originalText: true,
        clauseText: true,
        decisions: {
          where: {
            actionType: { in: ['APPLY_FALLBACK', 'EDIT_MANUAL', 'UNDO', 'REVERT'] },
            findingId: { not: null },
          },
          orderBy: { timestamp: 'asc' },
          select: {
            id: true,
            actionType: true,
            payload: true,
            timestamp: true,
            user: { select: { name: true } },
          },
        },
      },
    });

    const changes: TrackChangeData[] = [];

    for (const clause of clauses) {
      const originalText = clause.originalText ?? clause.clauseText;
      if (!originalText || clause.decisions.length === 0) continue;

      // Build undone set and find last REVERT index
      const undoneIds = new Set<string>();
      let lastRevertIndex = -1;

      for (let i = 0; i < clause.decisions.length; i++) {
        const d = clause.decisions[i];
        if (d.actionType === 'UNDO') {
          const p = JSON.parse(d.payload) as RawPayload;
          if (p.undoneDecisionId) undoneIds.add(p.undoneDecisionId);
        }
        if (d.actionType === 'REVERT') lastRevertIndex = i;
      }

      // Replay only decisions after the last REVERT
      const toReplay = lastRevertIndex >= 0
        ? clause.decisions.slice(lastRevertIndex + 1)
        : clause.decisions;

      // Find the last active text-modifying decision (chronological last-write-wins)
      let lastTextDecision: typeof clause.decisions[0] | null = null;
      for (const d of toReplay) {
        if (d.actionType !== 'APPLY_FALLBACK' && d.actionType !== 'EDIT_MANUAL') continue;
        if (undoneIds.has(d.id)) continue;
        lastTextDecision = d;
      }

      if (!lastTextDecision) continue;

      const p = JSON.parse(lastTextDecision.payload) as RawPayload;
      const replacementText = p.replacementText;
      if (!replacementText || replacementText === originalText) continue;

      changes.push({
        decisionId: lastTextDecision.id,
        clauseId: clause.id,
        actionType: lastTextDecision.actionType as DecisionActionType,
        originalText,
        replacementText,
        author: lastTextDecision.user.name,
        timestamp: lastTextDecision.timestamp.toISOString(),
      });
    }

    return NextResponse.json({ changes });
  } catch (error) {
    console.error('[GET /api/contracts/[id]/onlyoffice-tracked-changes] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
