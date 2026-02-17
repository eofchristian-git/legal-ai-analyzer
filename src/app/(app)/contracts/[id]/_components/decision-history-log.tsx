'use client';

/**
 * Decision History Log Component
 * Feature 006: Clause Decision Actions & Undo System
 * 
 * Displays chronological decision history for a clause with visual indicators
 * for undone decisions and action types.
 */

import { useEffect, useState } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { 
  CheckCircle, 
  RefreshCw, 
  Edit, 
  AlertTriangle, 
  MessageSquare, 
  Undo2, 
  RotateCcw,
  Clock,
  User,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { ClauseDecision } from '@/types/decisions';

interface DecisionHistoryLogProps {
  clauseId: string;
  refreshTrigger?: number; // Increment to force refresh
}

/**
 * T044: Decision history log component
 */
export function DecisionHistoryLog({ clauseId, refreshTrigger }: DecisionHistoryLogProps) {
  const [decisions, setDecisions] = useState<ClauseDecision[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch decision history
  useEffect(() => {
    const fetchHistory = async () => {
      try {
        setLoading(true);
        setError(null);
        
        const response = await fetch(`/api/clauses/${clauseId}/decisions`);
        if (!response.ok) {
          throw new Error('Failed to fetch decision history');
        }

        const data = await response.json();
        setDecisions(data.decisions || []);
      } catch (err) {
        console.error('Error fetching decision history:', err);
        setError(err instanceof Error ? err.message : 'Failed to load history');
      } finally {
        setLoading(false);
      }
    };

    if (clauseId) {
      fetchHistory();
    }
  }, [clauseId, refreshTrigger]);

  // Build set of undone decision IDs
  const undoneDecisionIds = new Set<string>();
  for (const decision of decisions) {
    if (decision.actionType === 'UNDO' && decision.payload) {
      const payload = decision.payload as any;
      if (payload.undoneDecisionId) {
        undoneDecisionIds.add(payload.undoneDecisionId);
      }
    }
  }

  if (loading) {
    return (
      <div className="p-4 text-center text-sm text-muted-foreground">
        Loading history...
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 text-center text-sm text-destructive">
        {error}
      </div>
    );
  }

  if (decisions.length === 0) {
    return (
      <div className="p-4 text-center text-sm text-muted-foreground">
        No decisions yet
      </div>
    );
  }

  return (
    <ScrollArea className="h-full">
      <div className="p-4 space-y-3">
        {decisions.map((decision, index) => {
          const isUndone = undoneDecisionIds.has(decision.id);
          const isUndo = decision.actionType === 'UNDO';
          const isRevert = decision.actionType === 'REVERT';

          return (
            <div
              key={decision.id}
              className={cn(
                'relative pl-8 pb-3 border-l-2',
                isUndone ? 'border-gray-300 opacity-50' : 'border-primary',
                index === decisions.length - 1 && 'border-l-0'
              )}
            >
              {/* Timeline dot */}
              <div
                className={cn(
                  'absolute left-0 top-1 -translate-x-1/2 w-3 h-3 rounded-full border-2',
                  isUndone
                    ? 'bg-gray-300 border-gray-400'
                    : 'bg-primary border-primary-foreground'
                )}
              />

              {/* Decision content */}
              <div className="space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    {getActionIcon(decision.actionType)}
                    <span
                      className={cn(
                        'text-sm font-medium',
                        isUndone && 'line-through text-muted-foreground'
                      )}
                    >
                      {formatActionType(decision.actionType)}
                    </span>
                    {isUndone && (
                      <Badge variant="outline" className="text-xs">
                        UNDONE
                      </Badge>
                    )}
                  </div>
                  <time className="text-xs text-muted-foreground whitespace-nowrap flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {formatTimestamp(decision.timestamp)}
                  </time>
                </div>

                {/* User info */}
                {decision.user && (
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <User className="h-3 w-3" />
                    <span>{decision.user.name}</span>
                  </div>
                )}

                {/* Payload details */}
                {renderPayloadDetails(decision)}
              </div>
            </div>
          );
        })}
      </div>
    </ScrollArea>
  );
}

/**
 * Helper: Get icon for action type
 */
function getActionIcon(actionType: string) {
  const iconMap: Record<string, React.ReactNode> = {
    ACCEPT_DEVIATION: <CheckCircle className="h-4 w-4 text-green-600" />,
    APPLY_FALLBACK: <RefreshCw className="h-4 w-4 text-blue-600" />,
    EDIT_MANUAL: <Edit className="h-4 w-4 text-purple-600" />,
    ESCALATE: <AlertTriangle className="h-4 w-4 text-yellow-600" />,
    ADD_NOTE: <MessageSquare className="h-4 w-4 text-gray-600" />,
    UNDO: <Undo2 className="h-4 w-4 text-orange-600" />,
    REVERT: <RotateCcw className="h-4 w-4 text-red-600" />,
  };
  return iconMap[actionType] || null;
}

/**
 * Helper: Format action type for display
 */
function formatActionType(actionType: string): string {
  const labels: Record<string, string> = {
    ACCEPT_DEVIATION: 'Accepted Deviation',
    APPLY_FALLBACK: 'Applied Fallback',
    EDIT_MANUAL: 'Manual Edit',
    ESCALATE: 'Escalated',
    ADD_NOTE: 'Added Note',
    UNDO: 'Undone',
    REVERT: 'Reverted to Original',
  };
  return labels[actionType] || actionType;
}

/**
 * Helper: Format timestamp
 */
function formatTimestamp(timestamp: Date | string): string {
  const date = typeof timestamp === 'string' ? new Date(timestamp) : timestamp;
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/**
 * Helper: Render payload details based on action type
 */
function renderPayloadDetails(decision: ClauseDecision) {
  const payload = decision.payload as any;

  if (decision.actionType === 'ACCEPT_DEVIATION' && payload?.comment) {
    return (
      <p className="text-xs text-muted-foreground italic">
        "{payload.comment}"
      </p>
    );
  }

  if (decision.actionType === 'APPLY_FALLBACK' && payload?.source) {
    return (
      <p className="text-xs text-muted-foreground">
        Source: {payload.source}
      </p>
    );
  }

  if (decision.actionType === 'ESCALATE' && payload?.reason) {
    return (
      <div className="text-xs space-y-1">
        <p className="text-muted-foreground">
          <strong>Reason:</strong> {payload.reason}
        </p>
        {payload.comment && (
          <p className="text-muted-foreground italic">
            "{payload.comment}"
          </p>
        )}
      </div>
    );
  }

  if (decision.actionType === 'ADD_NOTE' && payload?.noteText) {
    return (
      <p className="text-xs text-muted-foreground italic bg-muted/50 p-2 rounded">
        {payload.noteText}
      </p>
    );
  }

  if (decision.actionType === 'UNDO' && payload?.undoneDecisionId) {
    return (
      <p className="text-xs text-muted-foreground">
        Undid previous decision
      </p>
    );
  }

  return null;
}
