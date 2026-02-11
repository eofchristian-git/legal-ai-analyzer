"use client";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AlertCircle, AlertTriangle, CheckCircle2 } from "lucide-react";
import type { Clause } from "./types";

interface ClauseListProps {
  clauses: Clause[];
  selectedClauseId: string | null;
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
    badgeClass: "bg-red-100 text-red-800 border-red-200",
  },
  YELLOW: {
    icon: AlertTriangle,
    badgeClass: "bg-amber-100 text-amber-800 border-amber-200",
  },
  GREEN: {
    icon: CheckCircle2,
    badgeClass: "bg-emerald-100 text-emerald-800 border-emerald-200",
  },
};

export function ClauseList({
  clauses,
  selectedClauseId,
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
      <div className="space-y-1 p-2">
        {clauses.map((clause) => {
          const highestRisk = getHighestRisk(clause.findings);
          const isSelected = clause.id === selectedClauseId;
          const RiskIcon = highestRisk ? riskConfig[highestRisk].icon : null;

          return (
            <button
              key={clause.id}
              onClick={() => onSelectClause(clause.id)}
              className={cn(
                "w-full text-left rounded-lg px-3 py-2.5 transition-colors",
                "hover:bg-accent/50",
                isSelected && "bg-accent border border-border"
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
                      ? `${clause.clauseNumber} — ${clause.clauseName}`
                      : `${clause.position}. ${clause.clauseName}`}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
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
