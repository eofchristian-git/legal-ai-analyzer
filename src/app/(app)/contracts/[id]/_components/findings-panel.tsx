"use client";

import { useState, useCallback, useMemo } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  Swords,
  Search,
  Loader2,
  MapPin,
  Check,
  RotateCcw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { MarkdownViewer } from "@/components/shared/markdown-viewer";
import type { Clause, Finding, FindingComment, NegotiationItem, TriageDecision } from "./types";
import type { ProjectionResult } from "@/types/decisions";
import { FindingActions } from "./finding-actions";
import { DecisionHistoryLog } from "./decision-history-log";

interface FindingsPanelProps {
  clause: Clause | null;
  finalized: boolean;
  contractId: string;
  executiveSummary?: string | null;
  negotiationItems?: NegotiationItem[];
  onTriageDecision: (
    findingId: string,
    decision: TriageDecision,
    note?: string
  ) => void;
  // NEW: Feature 006 - Decision actions
  projection?: ProjectionResult | null;
  onDecisionApplied?: () => void;
  historyRefreshKey?: number;
  onEditManualClick?: (findingId?: string) => void;
  onEscalateClick?: (findingId: string) => void;
  onNoteClick?: (findingId: string) => void;
  currentUserId?: string;
  currentUserRole?: string;
  /** Called after fallback is applied — carries data for viewer redline */
  onFallbackApplied?: (data: { findingId: string; excerpt: string; replacementText: string }) => void;
  /** Called after a fallback decision is undone — carries data to revert the DOCX redline */
  onFallbackUndone?: (data: { findingId: string; excerpt: string; insertedText: string; riskLevel: string }) => void;
}

const severityOrder: Record<string, number> = { RED: 0, YELLOW: 1, GREEN: 2 };

const riskIcon = {
  RED: AlertCircle,
  YELLOW: AlertTriangle,
  GREEN: CheckCircle2,
};

const riskLabel: Record<string, string> = {
  RED: "High",
  YELLOW: "Medium",
  GREEN: "Low",
};

export function FindingsPanel({
  clause,
  finalized,
  contractId,
  executiveSummary,
  negotiationItems = [],
  onTriageDecision,
  projection,
  onDecisionApplied,
  historyRefreshKey,
  onEditManualClick,
  onEscalateClick,
  onNoteClick,
  currentUserId,
  currentUserRole,
  onFallbackApplied,
  onFallbackUndone,
}: FindingsPanelProps) {
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [strategyOpen, setStrategyOpen] = useState(false);

  // Sort findings by severity: RED → YELLOW → GREEN
  const sortedFindings = useMemo(() => {
    if (!clause) return [];
    return [...clause.findings].sort(
      (a, b) =>
        (severityOrder[a.riskLevel] ?? 3) - (severityOrder[b.riskLevel] ?? 3)
    );
  }, [clause]);

  if (!clause) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2">
        <Search className="h-8 w-8" />
        <p className="text-sm">Select a clause to view findings</p>
      </div>
    );
  }

  if (clause.findings.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2">
        <p className="text-sm">No findings for this clause</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-card overflow-hidden">
      <div className="px-4 py-3 border-b shrink-0">
        <p className="text-[10px] uppercase tracking-widest font-semibold text-muted-foreground">
          Findings & Triage
        </p>
      </div>
      <ScrollArea className="flex-1 min-h-0">
        <div className="p-4 space-y-3">
          {/* Executive Summary collapsible */}
          {executiveSummary && (
            <Collapsible open={summaryOpen} onOpenChange={setSummaryOpen}>
              <CollapsibleTrigger asChild>
                <button className="flex items-center gap-2 w-full text-left text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors uppercase tracking-wider py-1">
                  <ChevronDown className={cn("h-3 w-3 transition-transform", summaryOpen && "rotate-180")} />
                  Executive Summary
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="mt-2 p-3 rounded-md bg-muted/50 border text-xs">
                  <MarkdownViewer content={executiveSummary} />
                </div>
              </CollapsibleContent>
            </Collapsible>
          )}

          {/* Negotiation Strategy collapsible */}
          {negotiationItems.length > 0 && (
            <Collapsible open={strategyOpen} onOpenChange={setStrategyOpen}>
              <CollapsibleTrigger asChild>
                <button className="flex items-center gap-2 w-full text-left text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors uppercase tracking-wider py-1">
                  <ChevronDown className={cn("h-3 w-3 transition-transform", strategyOpen && "rotate-180")} />
                  <Swords className="h-3 w-3" />
                  Strategy ({negotiationItems.length})
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="mt-2 space-y-1.5">
                  {negotiationItems.map((item) => (
                    <div key={item.id} className="flex items-start gap-2 p-2 rounded-md bg-muted/50 border text-xs">
                      <Badge variant="outline" className={cn(
                        "shrink-0 text-xs px-2 py-0.5",
                        item.priority === "P1" ? "bg-risk-red-soft text-risk-red border-risk-red-border" :
                        item.priority === "P2" ? "bg-risk-yellow-soft text-risk-yellow border-risk-yellow-border" :
                        "bg-risk-info-soft text-risk-info border-risk-info-border"
                      )}>
                        {item.priority}
                      </Badge>
                      <div>
                        <p className="font-medium text-foreground">{item.title}</p>
                        <p className="text-muted-foreground mt-0.5">{item.description}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </CollapsibleContent>
            </Collapsible>
          )}

          <Separator />

          {/* Current clause findings */}
          <p className="text-[10px] uppercase tracking-widest font-semibold text-muted-foreground">
            {clause.clauseName} — {clause.findings.length} finding{clause.findings.length !== 1 ? "s" : ""}
          </p>

          {/* T021: Accept All & Reset All shortcuts */}
          {!finalized && clause.findings.length > 0 && (
            <BulkActionButtons
              clause={clause}
              projection={projection}
              onDecisionApplied={onDecisionApplied}
            />
          )}

          {sortedFindings.map((finding) => (
            <FindingCard
              key={finding.id}
              finding={finding}
              finalized={finalized}
              contractId={contractId}
              onTriageDecision={onTriageDecision}
              clauseId={clause.id}
              findingStatus={projection?.findingStatuses?.[finding.id]}
              onDecisionApplied={onDecisionApplied}
              currentUserId={currentUserId}
              currentUserRole={currentUserRole}
              clauseUpdatedAt={undefined}
              onEscalateClick={onEscalateClick}
              onNoteClick={onNoteClick}
              onEditManualClick={onEditManualClick}
              onFallbackApplied={onFallbackApplied}
              onFallbackUndone={onFallbackUndone}
            />
          ))}

          {/* Decision History */}
          {clause && (
            <div className="mt-6">
              <p className="text-[10px] uppercase tracking-widest font-semibold text-muted-foreground mb-3">
                Decision History
              </p>
              <DecisionHistoryLog
                clauseId={clause.id}
                refreshTrigger={historyRefreshKey}
              />
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

function FindingCard({
  finding,
  finalized,
  contractId,
  onTriageDecision,
  clauseId,
  findingStatus,
  onDecisionApplied,
  currentUserId,
  currentUserRole,
  clauseUpdatedAt,
  onEscalateClick,
  onNoteClick,
  onEditManualClick,
  onFallbackApplied,
  onFallbackUndone,
}: {
  finding: Finding;
  finalized: boolean;
  contractId: string;
  onTriageDecision: (
    findingId: string,
    decision: TriageDecision,
    note?: string
  ) => void;
  clauseId: string;
  findingStatus?: import("@/types/decisions").FindingStatusEntry;
  onDecisionApplied?: () => void;
  currentUserId?: string;
  currentUserRole?: string;
  clauseUpdatedAt?: string;
  onEscalateClick?: (findingId: string) => void;
  onNoteClick?: (findingId: string) => void;
  onEditManualClick?: (findingId?: string) => void;
  onFallbackApplied?: (data: { findingId: string; excerpt: string; replacementText: string }) => void;
  onFallbackUndone?: (data: { findingId: string; excerpt: string; insertedText: string; riskLevel: string }) => void;
}) {
  const Icon = riskIcon[finding.riskLevel as keyof typeof riskIcon] ?? AlertCircle;

  return (
    <div
      className={cn(
        "rounded-lg border-l-[3px] bg-card p-3 space-y-2 shadow-sm border border-border",
        finding.riskLevel === "RED" ? "border-l-risk-red" :
        finding.riskLevel === "YELLOW" ? "border-l-risk-yellow" : "border-l-risk-green",
        finalized && "opacity-70"
      )}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <Icon className={cn(
            "h-4 w-4 shrink-0",
            finding.riskLevel === "RED" ? "text-risk-red" :
            finding.riskLevel === "YELLOW" ? "text-risk-yellow" : "text-risk-green"
          )} />
          <Badge variant="outline" className={cn(
            "text-xs px-2 py-0.5",
            finding.riskLevel === "RED" ? "bg-risk-red-soft text-risk-red border-risk-red-border" :
            finding.riskLevel === "YELLOW" ? "bg-risk-yellow-soft text-risk-yellow border-risk-yellow-border" :
            "bg-risk-green-soft text-risk-green border-risk-green-border"
          )}>
            {riskLabel[finding.riskLevel] ?? finding.riskLevel}
          </Badge>
        </div>
      </div>

      {/* Location (v2 format only) */}
      {finding.locationPage && (
        <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
          <MapPin className="h-3 w-3" />
          <span>
            Page {finding.locationPage}
            {finding.locationPosition && ` (${finding.locationPosition})`}
          </span>
        </div>
      )}

      {/* Rule + Summary */}
      <div>
        <p className="text-[10px] text-muted-foreground">{finding.matchedRuleTitle}</p>
        <p className="text-xs font-medium text-foreground mt-0.5">{finding.summary}</p>
      </div>

      {/* Excerpt */}
      {finding.excerpt && (
        <blockquote className={cn(
          "border-l-2 pl-2.5 text-[11px] text-muted-foreground italic",
          finding.riskLevel === "RED" ? "border-l-risk-red" :
          finding.riskLevel === "YELLOW" ? "border-l-risk-yellow" : "border-l-risk-green"
        )}>
          &ldquo;{finding.excerpt}&rdquo;
        </blockquote>
      )}

      {/* Fallback */}
      {finding.fallbackText && (
        <p className="border-l-2 border-l-risk-green pl-2.5 text-[11px] text-muted-foreground">{finding.fallbackText}</p>
      )}

      {/* Per-Finding Decision Actions (Feature 007) */}
      {!finalized && clauseId && (
        <FindingActions
          finding={finding}
          clauseId={clauseId}
          contractId={contractId}
          findingStatus={findingStatus}
          onDecisionApplied={onDecisionApplied}
          currentUserId={currentUserId}
          currentUserRole={currentUserRole}
          clauseUpdatedAt={clauseUpdatedAt}
          onEscalateClick={onEscalateClick}
          onNoteClick={onNoteClick}
          onEditManualClick={onEditManualClick ? () => onEditManualClick(finding.id) : undefined}
          onFallbackApplied={onFallbackApplied}
          onFallbackUndone={onFallbackUndone}
        />
      )}
    </div>
  );
}

/**
 * T021: Bulk Action Buttons - Accept All & Reset All
 * Feature 007: Per-Finding Decision Actions
 */
function BulkActionButtons({
  clause,
  projection,
  onDecisionApplied,
}: {
  clause: import("./types").Clause;
  projection?: import("@/types/decisions").ProjectionResult | null;
  onDecisionApplied?: () => void;
}) {
  const [isProcessing, setIsProcessing] = useState(false);

  // Determine which buttons to show/enable
  const findingStatuses = projection?.findingStatuses || {};
  
  // Accept All: only for findings that are PENDING (not escalated, not already resolved)
  const acceptableFindings = clause.findings.filter((f) => {
    const status = findingStatuses[f.id]?.status;
    return !status || status === 'PENDING';
  });
  
  // Reset All: only for findings that have active decisions
  const resettableFindings = clause.findings.filter((f) => {
    const status = findingStatuses[f.id]?.status;
    return status && status !== 'PENDING';
  });

  const handleAcceptAll = async () => {
    if (acceptableFindings.length === 0) {
      toast.error('No findings to accept');
      return;
    }

    const confirmed = confirm(
      `Accept all ${acceptableFindings.length} unresolved finding(s)? This will mark them as accepted.`
    );
    if (!confirmed) return;

    setIsProcessing(true);
    let succeeded = 0;
    let failed = 0;
    let errorMessage = '';

    try {
      for (const finding of acceptableFindings) {
        try {
          const response = await fetch(`/api/clauses/${clause.id}/decisions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              actionType: 'ACCEPT_DEVIATION',
              findingId: finding.id,
              payload: { comment: 'Bulk accept' },
              clauseUpdatedAtWhenLoaded: new Date().toISOString(),
            }),
          });

          if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to accept finding');
          }

          succeeded++;
        } catch (err) {
          failed++;
          errorMessage = err instanceof Error ? err.message : 'Unknown error';
          // Stop on first failure per T021 error handling
          break;
        }
      }

      if (failed > 0) {
        toast.error(
          `${succeeded}/${acceptableFindings.length} completed — ${errorMessage}`
        );
      } else {
        toast.success(`All ${succeeded} findings accepted`);
      }

      // Refresh UI with partial state
      onDecisionApplied?.();
    } finally {
      setIsProcessing(false);
    }
  };

  const handleResetAll = async () => {
    if (resettableFindings.length === 0) {
      toast.error('No findings to reset');
      return;
    }

    const confirmed = confirm(
      `Reset all ${resettableFindings.length} finding(s) to pending? All decisions will be reverted. This action is recorded in the audit trail.`
    );
    if (!confirmed) return;

    setIsProcessing(true);
    let succeeded = 0;
    let failed = 0;
    let errorMessage = '';

    try {
      for (const finding of resettableFindings) {
        try {
          const response = await fetch(`/api/clauses/${clause.id}/decisions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              actionType: 'REVERT',
              findingId: finding.id,
              payload: {},
              clauseUpdatedAtWhenLoaded: new Date().toISOString(),
            }),
          });

          if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to revert finding');
          }

          succeeded++;
        } catch (err) {
          failed++;
          errorMessage = err instanceof Error ? err.message : 'Unknown error';
          // Stop on first failure per T021 error handling
          break;
        }
      }

      if (failed > 0) {
        toast.error(
          `${succeeded}/${resettableFindings.length} completed — ${errorMessage}`
        );
      } else {
        toast.success(`All ${succeeded} findings reset to pending`);
      }

      // Refresh UI with partial state
      onDecisionApplied?.();
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="flex gap-2 mb-2">
      <Button
        variant="outline"
        size="sm"
        onClick={handleAcceptAll}
        disabled={isProcessing || acceptableFindings.length === 0}
        className="text-xs h-7"
      >
        {isProcessing ? (
          <>
            <Loader2 className="h-3 w-3 mr-1.5 animate-spin" />
            Processing...
          </>
        ) : (
          <>
            <Check className="h-3 w-3 mr-1.5" />
            Accept All ({acceptableFindings.length})
          </>
        )}
      </Button>

      <Button
        variant="outline"
        size="sm"
        onClick={handleResetAll}
        disabled={isProcessing || resettableFindings.length === 0}
        className="text-xs h-7"
      >
        {isProcessing ? (
          <>
            <Loader2 className="h-3 w-3 mr-1.5 animate-spin" />
            Processing...
          </>
        ) : (
          <>
            <RotateCcw className="h-3 w-3 mr-1.5" />
            Reset All ({resettableFindings.length})
          </>
        )}
      </Button>
    </div>
  );
}
