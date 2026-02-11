"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { Check, AlertTriangle, X, MessageSquare } from "lucide-react";
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

const decisionConfig = {
  ACCEPT: {
    label: "Accept",
    icon: Check,
    activeClass: "bg-emerald-100 text-emerald-800 border-emerald-300 hover:bg-emerald-200",
    inactiveClass: "hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-200",
  },
  NEEDS_REVIEW: {
    label: "Needs Review",
    icon: AlertTriangle,
    activeClass: "bg-amber-100 text-amber-800 border-amber-300 hover:bg-amber-200",
    inactiveClass: "hover:bg-amber-50 hover:text-amber-700 hover:border-amber-200",
  },
  REJECT: {
    label: "Reject",
    icon: X,
    activeClass: "bg-red-100 text-red-800 border-red-300 hover:bg-red-200",
    inactiveClass: "hover:bg-red-50 hover:text-red-700 hover:border-red-200",
  },
};

export function TriageControls({
  findingId,
  currentDecision,
  currentNote,
  disabled,
  onDecision,
}: TriageControlsProps) {
  const [showNote, setShowNote] = useState(!!currentNote);
  const [note, setNote] = useState(currentNote || "");

  function handleDecision(decision: TriageDecision) {
    if (disabled) return;
    onDecision(findingId, decision, note || undefined);
  }

  function handleNoteBlur() {
    if (currentDecision && note !== (currentNote || "")) {
      onDecision(findingId, currentDecision, note || undefined);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-1.5">
        {(Object.keys(decisionConfig) as TriageDecision[]).map((decision) => {
          const config = decisionConfig[decision];
          const Icon = config.icon;
          const isActive = currentDecision === decision;

          return (
            <Button
              key={decision}
              variant="outline"
              size="xs"
              disabled={disabled}
              onClick={() => handleDecision(decision)}
              className={cn(
                "flex-1 gap-1",
                isActive ? config.activeClass : config.inactiveClass
              )}
            >
              <Icon className="h-3 w-3" />
              {config.label}
            </Button>
          );
        })}
      </div>

      {/* Note toggle + input */}
      {!showNote && !disabled && (
        <button
          onClick={() => setShowNote(true)}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <MessageSquare className="h-3 w-3" />
          Add note
        </button>
      )}
      {showNote && (
        <Input
          placeholder="Optional triage note..."
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onBlur={handleNoteBlur}
          disabled={disabled}
          className="text-xs h-7"
        />
      )}
    </div>
  );
}
