"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { TriageDecision } from "./types";

interface TriageControlsProps {
  findingId: string;
  currentDecision: TriageDecision | null;
  currentNote: string | null;
  disabled: boolean;
  onDecision: (
    findingId: string,
    decision: TriageDecision,
    note?: string
  ) => void;
}

const decisionConfig: Record<
  TriageDecision,
  { label: string; activeClass: string }
> = {
  ACCEPT: {
    label: "Accept",
    activeClass:
      "bg-emerald-50 text-emerald-700 border-emerald-300 hover:bg-emerald-100",
  },
  NEEDS_REVIEW: {
    label: "Negotiate",
    activeClass:
      "bg-amber-50 text-amber-700 border-amber-300 hover:bg-amber-100",
  },
  REJECT: {
    label: "Escalate",
    activeClass:
      "bg-red-50 text-red-700 border-red-300 hover:bg-red-100",
  },
};

export function TriageControls({
  findingId,
  currentDecision,
  disabled,
  onDecision,
}: TriageControlsProps) {
  function handleDecision(decision: TriageDecision) {
    if (disabled) return;
    onDecision(findingId, decision);
  }

  return (
    <div className="flex gap-2 pt-1">
      {(Object.keys(decisionConfig) as TriageDecision[]).map((decision) => {
        const config = decisionConfig[decision];
        const isActive = currentDecision === decision;

        return (
          <Button
            key={decision}
            variant="outline"
            size="sm"
            disabled={disabled}
            onClick={() => handleDecision(decision)}
            className={cn(
              "h-7 px-3 text-xs font-medium rounded-md",
              isActive
                ? config.activeClass
                : "text-foreground/70 hover:text-foreground hover:bg-muted/60"
            )}
          >
            {config.label}
          </Button>
        );
      })}
    </div>
  );
}
