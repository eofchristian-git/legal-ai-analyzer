'use client';

/**
 * Decision Buttons Component
 * Feature 006: Clause Decision Actions & Undo System
 * 
 * Renders action buttons for clause decisions:
 * - Accept deviation
 * - Replace with fallback
 * - Edit manually
 * - Escalate
 * - Add internal note
 * - Undo
 * - Revert to original
 */

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { 
  CheckCircle, 
  RefreshCw, 
  Edit, 
  AlertTriangle, 
  MessageSquare, 
  Undo2, 
  RotateCcw 
} from 'lucide-react';
import { toast } from 'sonner';
import { DecisionActionType, ProjectionResult } from '@/types/decisions';
import { EscalateModal } from './escalate-modal';  // T056: Feature 006
import { NoteInput } from './note-input';  // T069: Feature 006

interface Finding {
  id: string;
  fallbackText: string;
  matchedRuleTitle: string;
  riskLevel: string;
}

interface DecisionButtonsProps {
  clauseId: string;
  clauseName?: string;  // T056: Clause name for escalation modal
  projection?: ProjectionResult | null;
  findings: Finding[];  // T033: Need findings to access fallback language
  onDecisionApplied?: () => void;  // Callback to refresh clause data after decision
  onEditManualClick?: () => void;  // T049: Callback to enable edit mode
}

export function DecisionButtons({
  clauseId,
  clauseName = 'this clause',
  projection,
  findings,
  onDecisionApplied,
  onEditManualClick,
}: DecisionButtonsProps) {
  const [isLoading, setIsLoading] = useState(false);
  // T056: Escalate modal state
  const [escalateModalOpen, setEscalateModalOpen] = useState(false);
  // T069: Note input modal state
  const [noteInputOpen, setNoteInputOpen] = useState(false);

  // T038: Check if fallback language is available
  const hasFallbackLanguage = findings.some((f) => f.fallbackText && f.fallbackText.trim().length > 0);

  /**
   * T029: Handle Accept Deviation action
   */
  const handleAcceptDeviation = async () => {
    try {
      setIsLoading(true);

      const response = await fetch(`/api/clauses/${clauseId}/decisions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          actionType: DecisionActionType.ACCEPT_DEVIATION,
          payload: {
            comment: '', // Optional - can be enhanced with a modal for input
          },
          clauseUpdatedAtWhenLoaded: new Date().toISOString(), // For conflict detection
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to accept deviation');
      }

      const data = await response.json();

      // T030: Check for conflict warning
      if (data.conflictWarning) {
        toast.warning(data.conflictWarning.message, {
          duration: 8000,
          action: {
            label: 'Undo my change',
            onClick: () => handleUndo(),
          },
        });
      } else {
        toast.success('Deviation accepted');
      }

      // Trigger parent refresh
      onDecisionApplied?.();
    } catch (error) {
      console.error('Error accepting deviation:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to accept deviation');
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * T033, T037: Handle Apply Fallback action
   */
  const handleApplyFallback = async () => {
    try {
      setIsLoading(true);

      // T033: Find the first finding with fallback language (prefer RED, then YELLOW, then GREEN)
      const findingWithFallback = findings
        .filter((f) => f.fallbackText && f.fallbackText.trim().length > 0)
        .sort((a, b) => {
          const riskOrder: Record<string, number> = { RED: 0, YELLOW: 1, GREEN: 2 };
          return (riskOrder[a.riskLevel] ?? 3) - (riskOrder[b.riskLevel] ?? 3);
        })[0];

      if (!findingWithFallback) {
        toast.error('No fallback language available for this clause');
        return;
      }

      const response = await fetch(`/api/clauses/${clauseId}/decisions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          actionType: DecisionActionType.APPLY_FALLBACK,
          payload: {
            replacementText: findingWithFallback.fallbackText,
            source: 'fallback',
            playbookRuleId: findingWithFallback.id, // Using finding ID as rule reference
          },
          clauseUpdatedAtWhenLoaded: new Date().toISOString(),
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to apply fallback');
      }

      const data = await response.json();

      // Check for conflict warning
      if (data.conflictWarning) {
        toast.warning(data.conflictWarning.message, {
          duration: 8000,
          action: {
            label: 'Undo my change',
            onClick: () => handleUndo(),
          },
        });
      } else {
        toast.success('Fallback language applied');
      }

      // Trigger parent refresh
      onDecisionApplied?.();
    } catch (error) {
      console.error('Error applying fallback:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to apply fallback');
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * T042: Handle Undo action - Undo the last decision
   */
  const handleUndo = async () => {
    try {
      setIsLoading(true);

      // Fetch decision history to get the last decision
      const historyResponse = await fetch(`/api/clauses/${clauseId}/decisions`);
      if (!historyResponse.ok) {
        throw new Error('Failed to fetch decision history');
      }

      const historyData = await historyResponse.json();
      const decisions = historyData.decisions || [];

      // Find the last non-UNDO decision
      const lastDecision = decisions
        .filter((d: any) => d.actionType !== 'UNDO' && d.actionType !== 'REVERT')
        .pop();

      if (!lastDecision) {
        toast.error('No decision to undo');
        return;
      }

      // Call API to undo the last decision
      const response = await fetch(`/api/clauses/${clauseId}/decisions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          actionType: DecisionActionType.UNDO,
          payload: {
            undoneDecisionId: lastDecision.id,
          },
          clauseUpdatedAtWhenLoaded: new Date().toISOString(),
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to undo decision');
      }

      toast.success(`Undone: ${formatActionType(lastDecision.actionType)}`);

      // Trigger parent refresh
      onDecisionApplied?.();
    } catch (error) {
      console.error('Error undoing decision:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to undo decision');
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * T063: Handle Revert action - Reset clause to original state
   */
  const handleRevert = async () => {
    // Show confirmation dialog
    const confirmed = window.confirm(
      'Are you sure you want to revert to the original clause text?\n\n' +
      'This will reset the clause to its original state, ignoring all prior decisions. ' +
      'The decision history will be preserved for audit purposes.'
    );

    if (!confirmed) {
      return;
    }

    try {
      setIsLoading(true);

      const response = await fetch(`/api/clauses/${clauseId}/decisions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          actionType: DecisionActionType.REVERT,
          payload: {}, // Empty payload for REVERT
          clauseUpdatedAtWhenLoaded: new Date().toISOString(),
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to revert clause');
      }

      const data = await response.json();

      // Check for conflict warning
      if (data.conflictWarning) {
        toast.warning(data.conflictWarning.message, { duration: 8000 });
      } else {
        toast.success('Clause reverted to original state');
      }

      // Trigger parent refresh
      onDecisionApplied?.();
    } catch (error) {
      console.error('Error reverting clause:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to revert clause');
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Helper: Format action type for display
   */
  const formatActionType = (actionType: string): string => {
    const labels: Record<string, string> = {
      ACCEPT_DEVIATION: 'Accept Deviation',
      APPLY_FALLBACK: 'Apply Fallback',
      EDIT_MANUAL: 'Manual Edit',
      ESCALATE: 'Escalation',
      ADD_NOTE: 'Note',
    };
    return labels[actionType] || actionType;
  };

  /**
   * Check if buttons should be disabled (e.g., clause is escalated to someone else)
   */
  const isButtonsDisabled = 
    isLoading || 
    (projection?.hasUnresolvedEscalation && projection?.escalatedToUserId !== null);

  return (
    <div className="flex flex-wrap gap-2">
      {/* Core Action Buttons */}
      <Button
        onClick={handleAcceptDeviation}
        disabled={isButtonsDisabled}
        variant="outline"
        size="sm"
      >
        <CheckCircle className="mr-2 h-4 w-4" />
        Accept deviation
      </Button>

      <Button
        onClick={handleApplyFallback}
        disabled={isButtonsDisabled || !hasFallbackLanguage}
        variant="outline"
        size="sm"
        title={!hasFallbackLanguage ? 'No fallback language available' : 'Replace with playbook fallback language'}
      >
        <RefreshCw className="mr-2 h-4 w-4" />
        Replace with fallback
      </Button>

      <Button
        onClick={() => onEditManualClick?.()}
        disabled={isButtonsDisabled}
        variant="outline"
        size="sm"
      >
        <Edit className="mr-2 h-4 w-4" />
        Edit manually
      </Button>

      <Button
        onClick={() => setEscalateModalOpen(true)}
        disabled={isButtonsDisabled}
        variant="outline"
        size="sm"
      >
        <AlertTriangle className="mr-2 h-4 w-4" />
        Escalate
      </Button>

      <Button
        onClick={() => setNoteInputOpen(true)}
        disabled={isLoading}
        variant="outline"
        size="sm"
      >
        <MessageSquare className="mr-2 h-4 w-4" />
        Add note
      </Button>

      {/* Safety Buttons (separator) */}
      <div className="w-full" />

      <Button
        onClick={handleUndo}
        disabled={isLoading || (projection?.decisionCount ?? 0) === 0}
        variant="ghost"
        size="sm"
      >
        <Undo2 className="mr-2 h-4 w-4" />
        Undo
      </Button>

      <Button
        onClick={handleRevert}
        disabled={isLoading || (projection?.decisionCount ?? 0) === 0}
        variant="ghost"
        size="sm"
      >
        <RotateCcw className="mr-2 h-4 w-4" />
        Revert to original
      </Button>

      {/* Escalation Lock Message */}
      {projection?.hasUnresolvedEscalation && (
        <div className="w-full mt-2 p-3 bg-yellow-50 border border-yellow-200 rounded-md text-sm">
          <strong>Awaiting decision from {projection.escalatedToUserName}</strong>
          <p className="text-gray-600 mt-1">
            This clause has been escalated. Only the assigned approver or an admin can make decisions.
          </p>
        </div>
      )}

      {/* T056: Escalate Modal */}
      <EscalateModal
        open={escalateModalOpen}
        onOpenChange={setEscalateModalOpen}
        clauseId={clauseId}
        clauseName={clauseName}
        onEscalated={() => {
          onDecisionApplied?.();
        }}
      />

      {/* T069: Note Input Modal */}
      <NoteInput
        open={noteInputOpen}
        onOpenChange={setNoteInputOpen}
        clauseId={clauseId}
        clauseName={clauseName}
        onNoteSaved={() => {
          onDecisionApplied?.();
        }}
      />
    </div>
  );
}
