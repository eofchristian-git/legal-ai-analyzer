"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ChevronDown, Edit2, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PlaybookRule } from "./types";

const RISK_COLORS: Record<string, string> = {
  CRITICAL: "bg-red-100 text-red-800 border-red-200",
  HIGH: "bg-orange-100 text-orange-800 border-orange-200",
  MEDIUM: "bg-amber-100 text-amber-800 border-amber-200",
  LOW: "bg-emerald-100 text-emerald-800 border-emerald-200",
};

interface RuleCardProps {
  rule: PlaybookRule;
  isExpanded: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

export function RuleCard({
  rule,
  isExpanded,
  onToggle,
  onEdit,
  onDelete,
}: RuleCardProps) {
  return (
    <Collapsible open={isExpanded} onOpenChange={onToggle}>
      <Card className="overflow-hidden py-0 gap-0">
        <CardContent className="py-3 px-4">
          <CollapsibleTrigger asChild>
            <button className="w-full text-left group/rule">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Badge
                    variant="outline"
                    className={cn("text-xs", RISK_COLORS[rule.riskLevel])}
                  >
                    {rule.riskLevel}
                  </Badge>
                  <span className="text-sm font-medium">{rule.title}</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="flex items-center gap-0.5 opacity-0 group-hover/rule:opacity-100 transition-opacity">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 text-muted-foreground hover:text-foreground"
                      onClick={(e) => {
                        e.stopPropagation();
                        onEdit();
                      }}
                    >
                      <Edit2 className="h-3 w-3" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 text-muted-foreground hover:text-destructive"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDelete();
                      }}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                  <ChevronDown
                    className={cn(
                      "h-3.5 w-3.5 text-muted-foreground transition-transform",
                      isExpanded && "rotate-180"
                    )}
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {rule.description}
              </p>
            </button>
          </CollapsibleTrigger>

          <CollapsibleContent>
            <div className="mt-3 pt-3 border-t space-y-2 text-xs">
              {rule.standardPosition && (
                <div>
                  <span className="font-medium text-muted-foreground">
                    Standard Position:
                  </span>{" "}
                  <span>{rule.standardPosition}</span>
                </div>
              )}
              {rule.acceptableRange && (
                <div>
                  <span className="font-medium text-muted-foreground">
                    Acceptable Range:
                  </span>{" "}
                  <span>{rule.acceptableRange}</span>
                </div>
              )}
              {rule.escalationTrigger && (
                <div>
                  <span className="font-medium text-muted-foreground">
                    Escalation Trigger:
                  </span>{" "}
                  <span>{rule.escalationTrigger}</span>
                </div>
              )}
              {rule.negotiationGuidance && (
                <div>
                  <span className="font-medium text-muted-foreground">
                    Negotiation Guidance:
                  </span>{" "}
                  <span>{rule.negotiationGuidance}</span>
                </div>
              )}
              <p className="text-muted-foreground pt-1">
                Created by {rule.createdByName} ·{" "}
                {new Date(rule.createdAt).toLocaleDateString()}
              </p>
            </div>
          </CollapsibleContent>
        </CardContent>
      </Card>
    </Collapsible>
  );
}
