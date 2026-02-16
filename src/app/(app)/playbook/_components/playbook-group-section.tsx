"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { BookOpen, ChevronDown, Plus } from "lucide-react";
import { RuleCard } from "./rule-card";
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
}: PlaybookGroupSectionProps) {
  const isCreating = inlineForm && !editingRuleId;

  return (
    <Collapsible open={isExpanded} onOpenChange={onToggleExpand}>
      <CollapsibleTrigger asChild>
        <button className="flex items-center justify-between w-full rounded-lg border px-4 py-3 hover:bg-accent/50 transition-colors text-left">
          <div className="flex items-center gap-3">
            <BookOpen className="h-4 w-4 text-muted-foreground" />
            <div>
              <p className="text-sm font-semibold">{group.name}</p>
              {group.description && (
                <p className="text-xs text-muted-foreground">
                  {group.description}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Badge variant="secondary" className="text-xs">
              {rules.length} rules
            </Badge>
            <ChevronDown
              className={cn(
                "h-4 w-4 transition-transform",
                isExpanded && "rotate-180"
              )}
            />
          </div>
        </button>
      </CollapsibleTrigger>

      <CollapsibleContent>
        <div className="mt-2 space-y-2 pl-2">
          {isCreating && <div>{inlineForm}</div>}

          {rules.length === 0 && !inlineForm && (
            <p className="text-sm text-muted-foreground text-center py-6">
              No rules in this category yet. Add one.
            </p>
          )}

          {rules.map((rule) => {
            if (editingRuleId === rule.id && inlineForm) {
              return <div key={rule.id}>{inlineForm}</div>;
            }
            return (
              <RuleCard
                key={rule.id}
                rule={rule}
                isExpanded={expandedRules.has(rule.id)}
                onToggle={() => onToggleRule(rule.id)}
                onEdit={() => onEditRule(rule)}
                onDelete={() => onDeleteRule(rule)}
              />
            );
          })}

          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5 text-xs text-muted-foreground ml-2"
            onClick={(e) => {
              e.stopPropagation();
              onAddRule();
            }}
          >
            <Plus className="h-3 w-3" /> Add rule
          </Button>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
