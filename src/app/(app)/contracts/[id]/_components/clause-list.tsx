"use client";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Lock,
  Check,
  Eye,
  X,
} from "lucide-react";
import type { Clause, Finding } from "./types";

interface ClauseListProps {
  clauses: Clause[];
  selectedClauseId: string | null;
  finalized: boolean;
  onSelectClause: (clauseId: string) => void;
}

function getHighestRisk(
  findings: Clause["findings"]
): "RED" | "YELLOW" | "GREEN" | null {
  if (findings.length === 0) return null;
  if (findings.some((f) => f.riskLevel === "RED")) return "RED";
  if (findings.some((f) => f.riskLevel === "YELLOW")) return "YELLOW";
  return "GREEN";
}

const riskConfig = {
  RED: {
    icon: AlertCircle,
    badgeClass: "bg-red-50 text-red-700 border-red-200",
    label: "High",
  },
  YELLOW: {
    icon: AlertTriangle,
    badgeClass: "bg-amber-50 text-amber-700 border-amber-200",
    label: "Medium",
  },
  GREEN: {
    icon: CheckCircle2,
    badgeClass: "bg-emerald-50 text-emerald-700 border-emerald-200",
    label: "Low",
  },
};

/** Get triage decision counts for a clause's findings */
function getTriageSummary(findings: Finding[]) {
  let accepted = 0;
  let needsReview = 0;
  let rejected = 0;
  let pending = 0;
  let lastTriagedBy: string | null = null;
  let lastTriagedAt: string | null = null;

  for (const f of findings) {
    if (f.triageDecision === "ACCEPT") accepted++;
    else if (f.triageDecision === "NEEDS_REVIEW") needsReview++;
    else if (f.triageDecision === "REJECT") rejected++;
    else pending++;

    // Track most recent triage action
    if (f.triagedAt && (!lastTriagedAt || f.triagedAt > lastTriagedAt)) {
      lastTriagedAt = f.triagedAt;
      lastTriagedBy = f.triagedByName;
    }
  }

  return { accepted, needsReview, rejected, pending, lastTriagedBy };
}

export function ClauseList({
  clauses,
  selectedClauseId,
  finalized,
  onSelectClause,
}: ClauseListProps) {
  if (clauses.length === 0) {
    return (
      <div className="flex items-center justify-center h-full p-4 text-sm text-muted-foreground">
        No clauses found
      </div>
    );
  }

  return (
    <ScrollArea className="h-full">
      <div className="space-y-0.5 p-2">
        {clauses.map((clause) => {
          const highestRisk = getHighestRisk(clause.findings);
          const isSelected = clause.id === selectedClauseId;
          const RiskIcon = highestRisk ? riskConfig[highestRisk].icon : null;

          const totalFindings = clause.findings.length;
          const triage = getTriageSummary(clause.findings);
          const allTriaged = totalFindings > 0 && triage.pending === 0;

          return (
            <button
              key={clause.id}
              onClick={() => onSelectClause(clause.id)}
              className={cn(
                "w-full text-left rounded-lg px-3 py-2.5 transition-all",
                "hover:bg-slate-50 dark:hover:bg-slate-800/50",
                "border border-transparent",
                isSelected && "bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700",
                finalized && "border-l-2 border-l-slate-300 opacity-80"
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p
                    className={cn(
                      "text-sm font-medium truncate",
                      isSelected && "text-foreground"
                    )}
                  >
                    {clause.clauseNumber
                      ? `§${clause.clauseNumber} — ${clause.clauseName}`
                      : clause.clauseName}
                  </p>

                  {/* Triage status row */}
                  {totalFindings > 0 && (
                    <div className="mt-1.5 space-y-1">
                      {/* Decision breakdown — shown for both finalized and non-finalized */}
                      {(allTriaged || finalized) ? (
                        <div className="flex items-center gap-0.5 flex-wrap">
                          {finalized && (
                            <Lock className="h-2.5 w-2.5 text-slate-400 mr-0.5" />
                          )}
                          {triage.accepted > 0 && (
                            <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-1.5 py-0">
                              <Check className="h-2.5 w-2.5" />
                              {triage.accepted}
                            </span>
                          )}
                          {triage.needsReview > 0 && (
                            <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-1.5 py-0">
                              <Eye className="h-2.5 w-2.5" />
                              {triage.needsReview}
                            </span>
                          )}
                          {triage.rejected > 0 && (
                            <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-red-700 bg-red-50 border border-red-200 rounded-full px-1.5 py-0">
                              <X className="h-2.5 w-2.5" />
                              {triage.rejected}
                            </span>
                          )}
                        </div>
                      ) : triage.pending < totalFindings ? (
                        /* Some triaged — show inline decision pills + remaining count */
                        <div className="flex items-center gap-1 flex-wrap">
                          <div className="flex items-center gap-0.5">
                            {triage.accepted > 0 && (
                              <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-1.5 py-0">
                                <Check className="h-2.5 w-2.5" />
                                {triage.accepted}
                              </span>
                            )}
                            {triage.needsReview > 0 && (
                              <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-1.5 py-0">
                                <Eye className="h-2.5 w-2.5" />
                                {triage.needsReview}
                              </span>
                            )}
                            {triage.rejected > 0 && (
                              <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-red-700 bg-red-50 border border-red-200 rounded-full px-1.5 py-0">
                                <X className="h-2.5 w-2.5" />
                                {triage.rejected}
                              </span>
                            )}
                          </div>
                          <span className="text-[10px] text-slate-400">
                            +{triage.pending} pending
                          </span>
                        </div>
                      ) : null}

                      {/* Show who last triaged */}
                      {triage.lastTriagedBy && (
                        <p className="text-[10px] text-slate-400 truncate">
                          by {triage.lastTriagedBy}
                        </p>
                      )}
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-1.5 shrink-0 mt-0.5">
                  {clause.findings.length > 0 && (
                    <Badge
                      variant="outline"
                      className={cn(
                        "px-1.5 py-0 text-xs",
                        highestRisk && riskConfig[highestRisk].badgeClass
                      )}
                    >
                      {RiskIcon && <RiskIcon className="mr-0.5 h-3 w-3" />}
                      {clause.findings.length}
                    </Badge>
                  )}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </ScrollArea>
  );
}
