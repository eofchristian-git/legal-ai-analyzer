"use client";

import { Lock, FileText } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface RiskHeatmapProps {
  overallRisk: string;
  redCount: number;
  yellowCount: number;
  greenCount: number;
  clauseCount: number;
  resolvedCount: number;
  totalFindings: number;
  playbookVersion: number | null;
  isFinalized: boolean;
  finalizing: boolean;
  onFinalize: () => void;
}

const riskConfig: Record<string, { label: string; className: string }> = {
  high: {
    label: "High",
    className: "bg-risk-red-soft text-risk-red border-risk-red-border",
  },
  medium: {
    label: "Medium",
    className: "bg-risk-yellow-soft text-risk-yellow border-risk-yellow-border",
  },
  low: {
    label: "Low",
    className: "bg-risk-green-soft text-risk-green border-risk-green-border",
  },
};

export function RiskHeatmap({
  overallRisk,
  redCount,
  yellowCount,
  greenCount,
  clauseCount,
  resolvedCount,
  totalFindings,
  playbookVersion,
  isFinalized,
  finalizing,
  onFinalize,
}: RiskHeatmapProps) {
  const resolutionPct = totalFindings ? (resolvedCount / totalFindings) * 100 : 0;
  const allResolved = totalFindings > 0 && resolvedCount === totalFindings;
  const risk = riskConfig[overallRisk.toLowerCase()] ?? riskConfig.medium;

  return (
    <div className="flex-1 flex items-center gap-5 flex-wrap">
      {/* Risk Badge */}
      <Badge
        variant="outline"
        className={cn("text-xs font-semibold px-3 py-1", risk.className)}
      >
        {risk.label} Risk
      </Badge>

      {/* Stat pills */}
      <div className="flex items-center gap-1.5">
        <StatPill count={redCount} label="High" />
        <StatPill count={yellowCount} label="Med" />
        <StatPill count={greenCount} label="Low" />
        <span className="text-xs text-muted-foreground ml-1.5">
          across {clauseCount} clauses
        </span>
      </div>

      {/* Playbook version */}
      {playbookVersion && (
        <Badge variant="secondary" className="text-[11px] font-normal gap-1">
          <FileText className="h-3 w-3" />
          Playbook v{playbookVersion}
        </Badge>
      )}

      {/* Resolution progress */}
      <div className="ml-auto flex items-center gap-4">
        <div className="flex items-center gap-2.5">
          <span className="text-xs text-muted-foreground">Resolved</span>
          <div className="flex items-center gap-2">
            <div className="w-20 h-1.5 bg-muted rounded-full overflow-hidden">
              <div
                className={cn(
                  "h-full rounded-full transition-all duration-500",
                  allResolved ? "bg-emerald-500" : "bg-foreground/30"
                )}
                style={{ width: `${resolutionPct}%` }}
              />
            </div>
            <span className={cn(
              "text-xs font-medium tabular-nums",
              allResolved ? "text-emerald-600" : "text-muted-foreground"
            )}>
              {resolvedCount}/{totalFindings}
            </span>
          </div>
        </div>

        <Button
          size="sm"
          variant={allResolved && !isFinalized ? "default" : "outline"}
          className="gap-1.5 h-7 text-xs"
          disabled={isFinalized || !allResolved || finalizing}
          onClick={onFinalize}
        >
          <Lock className="h-3 w-3" />
          {isFinalized ? "Finalized" : "Finalize"}
        </Button>
      </div>
    </div>
  );
}

function StatPill({ count, label }: { count: number; label: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
      <span className="text-foreground tabular-nums">{count}</span>
      {label}
    </span>
  );
}
