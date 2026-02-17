"use client";

import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Check,
  ArrowLeftRight,
  AlertTriangle,
  MessageSquarePlus,
  Undo2,
  RotateCcw,
  Pencil,
  Loader2,
  Lock,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { Finding } from "./types";
import type {
  FindingStatusEntry,
  ProjectionResult,
  DecisionActionType,
  ClauseDecisionPayload,
} from "@/types/decisions";

interface FindingActionsProps {
  finding: Finding;
  clauseId: string;
  contractId: string;
  findingStatus: FindingStatusEntry | undefined;
  onDecisionApplied?: () => void;
  currentUserId?: string;
  currentUserRole?: string;
  clauseUpdatedAt?: string;
  // Modal openers for escalate / note / edit
  onEscalateClick?: (findingId: string) => void;
  onNoteClick?: (findingId: string) => void;
  onEditManualClick?: (findingId: string) => void;
}

export function FindingActions({
  finding,
  clauseId,
  contractId,
  findingStatus,
  onDecisionApplied,
  currentUserId,
  currentUserRole,
  clauseUpdatedAt,
  onEscalateClick,
  onNoteClick,
  onEditManualClick,
}: FindingActionsProps) {
  const [loading, setLoading] = useState<string | null>(null); // tracks which action is loading

  const status = findingStatus?.status;
  const isEscalated = status === "ESCALATED";
  const isResolved =
    status === "ACCEPTED" ||
    status === "RESOLVED_APPLIED_FALLBACK" ||
    status === "RESOLVED_MANUAL_EDIT";
  const hasActiveDecisions = !!findingStatus?.lastActionType;

  // Lock check: if this finding is escalated and user is not assignee/admin
  const isLockedForUser =
    isEscalated &&
    currentUserRole !== "admin" &&
    findingStatus?.escalatedTo !== currentUserId;

  const postDecision = useCallback(
    async (
      actionType: string,
      payload: Record<string, unknown>
    ) => {
      setLoading(actionType);
      try {
        const res = await fetch(`/api/clauses/${clauseId}/decisions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            actionType,
            findingId: finding.id,
            payload,
            clauseUpdatedAtWhenLoaded: clauseUpdatedAt,
          }),
        });

        if (!res.ok) {
          const err = await res.json();
          toast.error(err.error || "Failed to apply decision");
          return null;
        }

        const data = await res.json();
        onDecisionApplied?.();
        return data;
      } catch {
        toast.error("Failed to apply decision");
        return null;
      } finally {
        setLoading(null);
      }
    },
    [clauseId, finding.id, clauseUpdatedAt, onDecisionApplied]
  );

  const handleAccept = useCallback(async () => {
    await postDecision("ACCEPT_DEVIATION", {});
    toast.success("Finding accepted");
  }, [postDecision]);

  const handleApplyFallback = useCallback(async () => {
    await postDecision("APPLY_FALLBACK", {
      replacementText: finding.fallbackText,
      source: "fallback",
      playbookRuleId: finding.id,
    });
    toast.success("Fallback applied");
  }, [postDecision, finding.fallbackText, finding.id]);

  const handleUndo = useCallback(async () => {
    // Fetch decision history for this clause, find last active decision for this finding
    try {
      setLoading("UNDO");
      const histRes = await fetch(`/api/clauses/${clauseId}/decisions`);
      if (!histRes.ok) {
        toast.error("Failed to fetch decision history");
        setLoading(null);
        return;
      }
      const { decisions } = await histRes.json();

      // Filter to this finding's decisions
      const findingDecisions = decisions.filter(
        (d: any) => d.findingId === finding.id
      );

      // Build undone set
      const undoneIds = new Set<string>();
      for (const d of findingDecisions) {
        if (d.actionType === "UNDO") {
          undoneIds.add(d.payload?.undoneDecisionId);
        }
      }

      // Find last active non-meta decision
      const activeDecs = findingDecisions.filter(
        (d: any) =>
          !undoneIds.has(d.id) &&
          d.actionType !== "UNDO" &&
          d.actionType !== "REVERT"
      );

      if (activeDecs.length === 0) {
        toast.error("No active decision to undo");
        setLoading(null);
        return;
      }

      const lastActive = activeDecs[activeDecs.length - 1];
      await postDecision("UNDO", { undoneDecisionId: lastActive.id });
      toast.success("Decision undone");
    } catch {
      toast.error("Failed to undo");
    } finally {
      setLoading(null);
    }
  }, [clauseId, finding.id, postDecision]);

  const handleRevert = useCallback(async () => {
    await postDecision("REVERT", {});
    toast.success("Finding reverted to original");
  }, [postDecision]);

  // Status badge
  const statusBadge = (() => {
    if (!status || status === "PENDING") return null;
    switch (status) {
      case "ACCEPTED":
        return (
          <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 text-[10px] px-1.5 py-0">
            <Check className="h-3 w-3 mr-0.5" />
            Accepted
          </Badge>
        );
      case "RESOLVED_APPLIED_FALLBACK":
        return (
          <Badge className="bg-blue-100 text-blue-700 border-blue-200 text-[10px] px-1.5 py-0">
            <ArrowLeftRight className="h-3 w-3 mr-0.5" />
            Fallback Applied
          </Badge>
        );
      case "RESOLVED_MANUAL_EDIT":
        return (
          <Badge className="bg-purple-100 text-purple-700 border-purple-200 text-[10px] px-1.5 py-0">
            <Pencil className="h-3 w-3 mr-0.5" />
            Manually Edited
          </Badge>
        );
      case "ESCALATED":
        return (
          <Badge className="bg-amber-100 text-amber-700 border-amber-200 text-[10px] px-1.5 py-0">
            <AlertTriangle className="h-3 w-3 mr-0.5" />
            Escalated{findingStatus?.escalatedToName ? ` to ${findingStatus.escalatedToName}` : ""}
          </Badge>
        );
      default:
        return null;
    }
  })();

  return (
    <div className="space-y-1.5">
      {/* Status badge row */}
      {statusBadge && (
        <div className="flex items-center gap-1.5">
          {statusBadge}
          {isLockedForUser && (
            <Lock className="h-3 w-3 text-amber-500" />
          )}
          {(findingStatus?.noteCount ?? 0) > 0 && (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0">
              <MessageSquarePlus className="h-3 w-3 mr-0.5" />
              {findingStatus!.noteCount}
            </Badge>
          )}
        </div>
      )}

      {/* Escalation details */}
      {isEscalated && findingStatus && (
        <div className="bg-amber-50 border border-amber-200 rounded-md p-2 space-y-1">
          {findingStatus.escalationReason && (
            <div className="text-[11px]">
              <span className="font-medium text-amber-900">Reason:</span>{" "}
              <span className="text-amber-800">{findingStatus.escalationReason}</span>
            </div>
          )}
          {findingStatus.escalationComment && (
            <div className="text-[11px]">
              <span className="font-medium text-amber-900">Comment:</span>{" "}
              <span className="text-amber-800 italic">"{findingStatus.escalationComment}"</span>
            </div>
          )}
        </div>
      )}

      {/* Internal notes */}
      {findingStatus?.notes && findingStatus.notes.length > 0 && (
        <div className="bg-gray-50 border border-gray-200 rounded-md p-2 space-y-1.5">
          <div className="text-[10px] font-medium text-gray-600 uppercase tracking-wide">
            Internal Notes ({findingStatus.notes.length})
          </div>
          {findingStatus.notes.map((note, idx) => (
            <div key={idx} className="text-[11px] text-gray-700 pl-2 border-l-2 border-gray-300">
              <div className="font-medium">{note.userName}</div>
              <div className="italic">"{note.text}"</div>
              <div className="text-[10px] text-gray-500 mt-0.5">
                {new Date(note.timestamp).toLocaleString()}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Action buttons */}
      {!isLockedForUser && (
        <div className="flex flex-wrap gap-1">
          {/* Accept */}
          <Button
            size="sm"
            variant="outline"
            className="text-[10px] h-6 px-2 gap-1"
            disabled={isResolved || loading !== null}
            onClick={handleAccept}
          >
            {loading === "ACCEPT_DEVIATION" ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Check className="h-3 w-3" />
            )}
            Accept
          </Button>

          {/* Apply Fallback */}
          {finding.fallbackText && (
            <Button
              size="sm"
              variant="outline"
              className="text-[10px] h-6 px-2 gap-1"
              disabled={isResolved || loading !== null}
              onClick={handleApplyFallback}
            >
              {loading === "APPLY_FALLBACK" ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <ArrowLeftRight className="h-3 w-3" />
              )}
              Fallback
            </Button>
          )}

          {/* Escalate */}
          <Button
            size="sm"
            variant="outline"
            className="text-[10px] h-6 px-2 gap-1"
            disabled={isResolved || isEscalated || loading !== null}
            onClick={() => onEscalateClick?.(finding.id)}
          >
            <AlertTriangle className="h-3 w-3" />
            Escalate
          </Button>

          {/* Note */}
          <Button
            size="sm"
            variant="outline"
            className="text-[10px] h-6 px-2 gap-1"
            disabled={loading !== null}
            onClick={() => onNoteClick?.(finding.id)}
          >
            <MessageSquarePlus className="h-3 w-3" />
            Note
          </Button>

          {/* Edit Manually */}
          <Button
            size="sm"
            variant="outline"
            className="text-[10px] h-6 px-2 gap-1"
            disabled={isResolved || loading !== null}
            onClick={() => onEditManualClick?.(finding.id)}
          >
            <Pencil className="h-3 w-3" />
            Edit
          </Button>

          {/* Undo (only when has active decisions) */}
          {hasActiveDecisions && (
            <Button
              size="sm"
              variant="ghost"
              className="text-[10px] h-6 px-2 gap-1 text-muted-foreground"
              disabled={loading !== null}
              onClick={handleUndo}
            >
              {loading === "UNDO" ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Undo2 className="h-3 w-3" />
              )}
              Undo
            </Button>
          )}

          {/* Revert (only when has active decisions) */}
          {hasActiveDecisions && (
            <Button
              size="sm"
              variant="ghost"
              className="text-[10px] h-6 px-2 gap-1 text-muted-foreground"
              disabled={loading !== null}
              onClick={handleRevert}
            >
              {loading === "REVERT" ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <RotateCcw className="h-3 w-3" />
              )}
              Revert
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
