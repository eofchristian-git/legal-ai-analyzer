"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ChevronRight, Plus } from "lucide-react";
import { RuleCard } from "./rule-card";
import { getGroupIconConfig } from "./group-icons";
import { cn } from "@/lib/utils";
import type { PlaybookGroup, PlaybookRule } from "./types";

interface PlaybookGroupSectionProps {
  group: PlaybookGroup;
  rules: PlaybookRule[];
  expandedRules: Set<string>;
  onToggleRule: (id: string) => void;
  onEditRule: (rule: PlaybookRule) => void;
  onDeleteRule: (rule: PlaybookRule) => void;
  onAddRule: () => void;
  isExpanded: boolean;
  onToggleExpand: () => void;
  inlineForm: React.ReactNode | null;
  editingRuleId: string | null;
  index: number;
}

export function PlaybookGroupSection({
  group,
  rules,
  expandedRules,
  onToggleRule,
  onEditRule,
  onDeleteRule,
  onAddRule,
  isExpanded,
  onToggleExpand,
  inlineForm,
  editingRuleId,
  index,
}: PlaybookGroupSectionProps) {
  const isCreating = inlineForm && !editingRuleId;
  const { icon: GroupIcon, color, bg } = getGroupIconConfig(group.slug);
  const staggerClass = `stagger-${Math.min(index + 1, 7)}`;

  return (
    <div className={cn("animate-fade-up-in", staggerClass)}>
      <Collapsible open={isExpanded} onOpenChange={onToggleExpand}>
        <div
          className={cn(
            "rounded-lg border bg-card transition-shadow duration-200",
            isExpanded && "shadow-sm"
          )}
        >
          <CollapsibleTrigger asChild>
            <button className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-accent/40 transition-colors text-left group/header">
              <div className="flex items-center gap-3">
                <div
                  className={cn(
                    "flex h-8 w-8 items-center justify-center rounded-lg transition-transform duration-200 group-hover/header:scale-105",
                    bg
                  )}
                >
                  <GroupIcon className={cn("h-4 w-4", color)} />
                </div>
                <ChevronRight
                  className={cn(
                    "h-4 w-4 text-muted-foreground shrink-0 transition-transform duration-200",
                    isExpanded && "rotate-90"
                  )}
                />
                <div className="flex flex-col">
                  <div className="flex items-center gap-2.5">
                    <span className="font-semibold text-sm">{group.name}</span>
                    <Badge
                      variant="secondary"
                      className="text-[11px] px-1.5 py-0 tabular-nums"
                    >
                      {rules.length}
                    </Badge>
                  </div>
                  {group.description && (
                    <span className="text-xs text-muted-foreground hidden sm:inline mt-0.5">
                      {group.description}
                    </span>
                  )}
                </div>
              </div>
              {isExpanded && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                  onClick={(e) => {
                    e.stopPropagation();
                    onAddRule();
                  }}
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add Rule
                </Button>
              )}
            </button>
          </CollapsibleTrigger>

          <CollapsibleContent>
            <div className="border-t px-5 pb-4 pt-3 space-y-3">
              {isCreating && (
                <div className="animate-scale-fade-in">{inlineForm}</div>
              )}

              {rules.length === 0 && !inlineForm && (
                <p className="text-sm text-muted-foreground text-center py-6">
                  No rules in this category yet. Add one.
                </p>
              )}

              {rules.map((rule, ruleIdx) => {
                if (editingRuleId === rule.id && inlineForm) {
                  return (
                    <div key={rule.id} className="animate-scale-fade-in">
                      {inlineForm}
                    </div>
                  );
                }
                return (
                  <div
                    key={rule.id}
                    className="animate-fade-up-in"
                    style={{ animationDelay: `${ruleIdx * 40}ms` }}
                  >
                    <RuleCard
                      rule={rule}
                      isExpanded={expandedRules.has(rule.id)}
                      onToggle={() => onToggleRule(rule.id)}
                      onEdit={() => onEditRule(rule)}
                      onDelete={() => onDeleteRule(rule)}
                    />
                  </div>
                );
              })}
            </div>
          </CollapsibleContent>
        </div>
      </Collapsible>
    </div>
  );
}
