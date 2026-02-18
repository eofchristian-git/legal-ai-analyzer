"use client";

import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { useState, useMemo, useEffect, useRef } from "react";
import { ArrowUpDown, Filter, CheckCircle2, AlertTriangle, CheckCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Clause } from "./types";

interface ClauseListProps {
  clauses: Clause[];
  selectedClauseId: string | null;
  finalized: boolean;
  onSelectClause: (id: string) => void;
  clauseProjections?: Record<string, {
    resolvedCount: number;
    totalFindingCount: number;
    effectiveStatus: 'PENDING' | 'PARTIALLY_RESOLVED' | 'RESOLVED' | 'ESCALATED' | 'NO_ISSUES';
  }>;
}

function getMaxRisk(findings: { riskLevel: string }[]): string {
  return findings.reduce(
    (max, f) =>
      f.riskLevel === "RED" ? "RED" : f.riskLevel === "YELLOW" && max !== "RED" ? "YELLOW" : max,
    "GREEN"
  );
}

const riskLabel: Record<string, string> = {
  RED: "High",
  YELLOW: "Med",
  GREEN: "Low",
};

const riskOrder: Record<string, number> = { RED: 0, YELLOW: 1, GREEN: 2 };

type RiskFilter = "ALL" | "RED" | "YELLOW" | "GREEN";
type SortMode = "position" | "risk" | "triage";
type ResolutionFilter = "ALL" | "PENDING" | "IN_PROGRESS" | "RESOLVED" | "ESCALATED";

export function ClauseList({ clauses, selectedClauseId, finalized, onSelectClause, clauseProjections = {} }: ClauseListProps) {
  const [riskFilter, setRiskFilter] = useState<RiskFilter>("ALL");
  const [sortMode, setSortMode] = useState<SortMode>("position");
  const [resolutionFilter, setResolutionFilter] = useState<ResolutionFilter>("ALL");
  // T027: Ref map for auto-scrolling selected clause into view
  const itemRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  // T027: Auto-scroll selected clause into view when selectedClauseId changes (from document scroll sync)
  useEffect(() => {
    if (!selectedClauseId) return;
    const el = itemRefs.current[selectedClauseId];
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [selectedClauseId]);

  const filteredAndSorted = useMemo(() => {
    let result = [...clauses];

    // Risk filter
    if (riskFilter !== "ALL") {
      result = result.filter((c) => {
        if (c.findings.length === 0) return false;
        return getMaxRisk(c.findings) === riskFilter;
      });
    }

    // T013: Resolution status filter
    if (resolutionFilter !== "ALL") {
      result = result.filter((c) => {
        const projection = clauseProjections[c.id];
        if (!projection) return false;
        
        switch (resolutionFilter) {
          case "PENDING":
            return projection.effectiveStatus === 'PENDING';
          case "IN_PROGRESS":
            return projection.effectiveStatus === 'PARTIALLY_RESOLVED';
          case "RESOLVED":
            return projection.effectiveStatus === 'RESOLVED';
          case "ESCALATED":
            return projection.effectiveStatus === 'ESCALATED';
          default:
            return true;
        }
      });
    }

    // Sort
    if (sortMode === "risk") {
      result.sort((a, b) => {
        const rA = a.findings.length > 0 ? riskOrder[getMaxRisk(a.findings)] ?? 3 : 3;
        const rB = b.findings.length > 0 ? riskOrder[getMaxRisk(b.findings)] ?? 3 : 3;
        return rA - rB;
      });
    } else if (sortMode === "triage") {
      result.sort((a, b) => {
        const pendingA = a.findings.filter((f) => !f.triageDecision).length;
        const pendingB = b.findings.filter((f) => !f.triageDecision).length;
        return pendingB - pendingA;
      });
    }

    return result;
  }, [clauses, riskFilter, sortMode, resolutionFilter, clauseProjections]);

  if (clauses.length === 0) {
    return (
      <div className="flex-1 min-h-0 flex items-center justify-center p-4 text-sm text-muted-foreground">
        No clauses found
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col bg-muted/40 overflow-hidden">
      <div className="px-3 py-2.5 border-b space-y-2 shrink-0">
        <p className="text-[10px] uppercase tracking-widest font-semibold text-muted-foreground">
          Clauses ({clauses.length})
        </p>
        {/* Filter & Sort controls */}
        <div className="flex items-center gap-1 flex-wrap">
          {/* Risk filter */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className={cn(
                "h-6 text-[10px] px-2 gap-1",
                riskFilter !== "ALL" && "bg-primary/10 text-foreground"
              )}>
                <Filter className="h-3 w-3" />
                {riskFilter === "ALL" ? "Risk: All" : riskLabel[riskFilter]}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="min-w-[100px]">
              <DropdownMenuItem onClick={() => setRiskFilter("ALL")} className="text-xs">All</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setRiskFilter("RED")} className="text-xs">High</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setRiskFilter("YELLOW")} className="text-xs">Medium</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setRiskFilter("GREEN")} className="text-xs">Low</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* T013: Resolution status filter */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className={cn(
                "h-6 text-[10px] px-2 gap-1",
                resolutionFilter !== "ALL" && "bg-primary/10 text-foreground"
              )}>
                <CheckCircle2 className="h-3 w-3" />
                {resolutionFilter === "ALL" ? "Status: All" : resolutionFilter === "IN_PROGRESS" ? "In Progress" : resolutionFilter}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="min-w-[120px]">
              <DropdownMenuItem onClick={() => setResolutionFilter("ALL")} className="text-xs">All</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setResolutionFilter("PENDING")} className="text-xs">Pending</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setResolutionFilter("IN_PROGRESS")} className="text-xs">In Progress</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setResolutionFilter("RESOLVED")} className="text-xs">Resolved</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setResolutionFilter("ESCALATED")} className="text-xs">Escalated</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Sort */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className={cn(
                "h-6 text-[10px] px-2 gap-1",
                sortMode !== "position" && "bg-primary/10 text-foreground"
              )}>
                <ArrowUpDown className="h-3 w-3" />
                {sortMode === "position" ? "Order" : sortMode === "risk" ? "Risk" : "Triage"}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="min-w-[120px]">
              <DropdownMenuItem onClick={() => setSortMode("position")} className="text-xs">Document order</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setSortMode("risk")} className="text-xs">By risk level</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setSortMode("triage")} className="text-xs">By triage status</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      <ScrollArea className="flex-1 min-h-0">
        <div className="p-2 space-y-0.5">
          {filteredAndSorted.length === 0 && (
            <p className="text-xs text-muted-foreground/60 text-center py-4">No clauses match filter</p>
          )}
          {filteredAndSorted.map((clause) => {
            const maxRisk = getMaxRisk(clause.findings);
            const isSelected = selectedClauseId === clause.id;
            const findingCount = clause.findings.length;
            const triagedFindings = clause.findings.filter((f) => f.triageDecision);
            const triagedByUsers = [...new Set(
              triagedFindings
                .map((f) => f.triagedByName)
                .filter(Boolean)
            )];
            // T012: Get resolution progress
            const projection = clauseProjections[clause.id];
            const resolvedCount = projection?.resolvedCount ?? 0;
            const totalFindingCount = projection?.totalFindingCount ?? findingCount;
            const effectiveStatus = projection?.effectiveStatus;
            
            return (
              <button
                key={clause.id}
                ref={(el) => { itemRefs.current[clause.id] = el; }}
                onClick={() => onSelectClause(clause.id)}
                className={cn(
                  "w-full text-left rounded-md px-3 py-2.5 transition-all group",
                  isSelected
                    ? "bg-primary/10 border-l-2 border-primary"
                    : "hover:bg-muted border-l-2 border-transparent",
                  finalized && "opacity-70"
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className={cn(
                    "font-medium text-xs",
                    isSelected ? "text-foreground" : "text-muted-foreground"
                  )}>
                    {clause.clauseNumber ? (
                      `§${clause.clauseNumber}`
                    ) : (
                      <span className="flex items-center gap-1.5">
                        <span className="text-[10px] opacity-60">#{clause.position}</span>
                        <span>{clause.clauseName}</span>
                      </span>
                    )}
                  </span>
                  <div className="flex items-center gap-1.5">
                    {/* T012: Resolution progress indicator */}
                    {totalFindingCount > 0 && projection && (
                      <span className={cn(
                        "text-[10px] tabular-nums",
                        effectiveStatus === 'RESOLVED' ? "text-green-600 font-medium" :
                        effectiveStatus === 'ESCALATED' ? "text-amber-600" :
                        "text-muted-foreground"
                      )}>
                        {resolvedCount}/{totalFindingCount}
                      </span>
                    )}
                    {/* T012: Status icons */}
                    {effectiveStatus === 'RESOLVED' && (
                      <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
                    )}
                    {effectiveStatus === 'ESCALATED' && (
                      <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
                    )}
                    {effectiveStatus === 'NO_ISSUES' && (
                      <CheckCheck className="h-3.5 w-3.5 text-green-600/70" />
                    )}
                    {findingCount > 0 && (
                      <span className={cn(
                        "text-xs font-medium px-2.5 py-0.5 rounded-full border",
                        maxRisk === "RED" ? "bg-risk-red-soft text-risk-red border-risk-red-border" :
                        maxRisk === "YELLOW" ? "bg-risk-yellow-soft text-risk-yellow border-risk-yellow-border" :
                        "bg-risk-green-soft text-risk-green border-risk-green-border"
                      )}>
                        {riskLabel[maxRisk]}
                      </span>
                    )}
                  </div>
                </div>
                {clause.clauseNumber && (
                  <p className={cn(
                    "text-xs truncate mt-0.5",
                    isSelected ? "text-foreground/70" : "text-muted-foreground/60"
                  )}>
                    {clause.clauseName}
                  </p>
                )}
                {/* T012: Show "No issues" label for zero-finding clauses */}
                {effectiveStatus === 'NO_ISSUES' && (
                  <p className={cn(
                    "text-[10px] mt-0.5",
                    isSelected ? "text-green-600/80" : "text-green-600/60"
                  )}>
                    No issues
                  </p>
                )}
                {/* T012: Show "Resolved" status badge for fully resolved clauses */}
                {effectiveStatus === 'RESOLVED' && (
                  <p className={cn(
                    "text-[10px] mt-0.5 font-medium",
                    isSelected ? "text-green-600" : "text-green-600/70"
                  )}>
                    Resolved
                  </p>
                )}
                {triagedFindings.length > 0 && effectiveStatus !== 'RESOLVED' && effectiveStatus !== 'NO_ISSUES' && (
                  <p className={cn(
                    "text-[10px] mt-0.5 truncate",
                    isSelected ? "text-foreground/60" : "text-muted-foreground/50"
                  )}>
                    {triagedFindings.length}/{findingCount}
                    {triagedByUsers.length > 0 && (
                      <span> by {triagedByUsers.join(", ")}</span>
                    )}
                  </p>
                )}
              </button>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}
