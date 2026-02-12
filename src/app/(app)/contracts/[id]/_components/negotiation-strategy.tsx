"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  AlertCircle,
  AlertTriangle,
  Lightbulb,
  ChevronDown,
  ExternalLink,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { NegotiationItem } from "./types";

interface NegotiationStrategyProps {
  negotiationItems: NegotiationItem[];
  /** Legacy Markdown string fallback for analyses without structured items */
  legacyMarkdown: string | null;
}

const priorityConfig: Record<
  string,
  {
    label: string;
    fullLabel: string;
    icon: typeof AlertCircle;
    badgeClass: string;
    cardAccent: string;
  }
> = {
  P1: {
    label: "P1",
    fullLabel: "Critical",
    icon: AlertCircle,
    badgeClass: "bg-red-50 text-red-700 border-red-200",
    cardAccent: "border-l-red-400",
  },
  P2: {
    label: "P2",
    fullLabel: "Important",
    icon: AlertTriangle,
    badgeClass: "bg-amber-50 text-amber-700 border-amber-200",
    cardAccent: "border-l-amber-400",
  },
  P3: {
    label: "P3",
    fullLabel: "Nice-to-have",
    icon: Lightbulb,
    badgeClass: "bg-sky-50 text-sky-700 border-sky-200",
    cardAccent: "border-l-sky-400",
  },
};

export function NegotiationStrategy({
  negotiationItems,
  legacyMarkdown,
}: NegotiationStrategyProps) {
  // If no structured items and we have legacy Markdown, render fallback
  if (negotiationItems.length === 0 && legacyMarkdown) {
    return (
      <div className="space-y-3">
        <div
          className="prose prose-sm max-w-none text-foreground/80 whitespace-pre-wrap font-legal"
        >
          {legacyMarkdown}
        </div>
      </div>
    );
  }

  // If no items at all, hide
  if (negotiationItems.length === 0 && !legacyMarkdown) {
    return null;
  }

  // Summary counts
  const p1Count = negotiationItems.filter((i) => i.priority === "P1").length;
  const p2Count = negotiationItems.filter((i) => i.priority === "P2").length;
  const p3Count = negotiationItems.filter((i) => i.priority === "P3").length;

  // Sort by priority (P1 first)
  const sorted = [...negotiationItems].sort((a, b) => {
    const order: Record<string, number> = { P1: 0, P2: 1, P3: 2 };
    return (order[a.priority] ?? 3) - (order[b.priority] ?? 3);
  });

  return (
    <div className="space-y-4">
      {/* Summary header */}
      <div className="flex items-center gap-2 flex-wrap">
        {p1Count > 0 && (
          <Badge
            variant="outline"
            className="gap-1 px-2 py-0.5 text-xs bg-red-50 text-red-700 border-red-200"
          >
            <AlertCircle className="h-3 w-3" />
            {p1Count} Critical
          </Badge>
        )}
        {p2Count > 0 && (
          <Badge
            variant="outline"
            className="gap-1 px-2 py-0.5 text-xs bg-amber-50 text-amber-700 border-amber-200"
          >
            <AlertTriangle className="h-3 w-3" />
            {p2Count} Important
          </Badge>
        )}
        {p3Count > 0 && (
          <Badge
            variant="outline"
            className="gap-1 px-2 py-0.5 text-xs bg-sky-50 text-sky-700 border-sky-200"
          >
            <Lightbulb className="h-3 w-3" />
            {p3Count} Nice-to-have
          </Badge>
        )}
      </div>

      {/* Priority cards */}
      <ScrollArea className="max-h-[500px]">
        <div className="space-y-2">
          {sorted.map((item) => (
            <NegotiationCard key={item.id} item={item} />
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}

function NegotiationCard({ item }: { item: NegotiationItem }) {
  const [isOpen, setIsOpen] = useState(item.priority === "P1");
  const config = priorityConfig[item.priority] || priorityConfig.P3;
  const PriorityIcon = config.icon;

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <div
        className={cn(
          "rounded-lg border bg-card overflow-hidden",
          "border-l-[3px]",
          config.cardAccent
        )}
      >
        <CollapsibleTrigger className="w-full">
          <div className="flex items-center gap-2.5 px-3 py-2.5 hover:bg-muted/30 transition-colors">
            <Badge
              variant="outline"
              className={cn(
                "gap-1 px-1.5 py-0 text-[11px] font-semibold shrink-0",
                config.badgeClass
              )}
            >
              <PriorityIcon className="h-3 w-3" />
              {config.label}
            </Badge>
            <span className="text-sm font-medium text-left flex-1 truncate">
              {item.title}
            </span>
            {item.clauseRef && (
              <span className="text-[11px] text-muted-foreground shrink-0 flex items-center gap-0.5">
                <ExternalLink className="h-3 w-3" />
                {item.clauseRef}
              </span>
            )}
            <ChevronDown
              className={cn(
                "h-4 w-4 text-muted-foreground shrink-0 transition-transform",
                isOpen && "rotate-180"
              )}
            />
          </div>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="px-3 pb-3 pt-0">
            <div className="border-t pt-2.5 space-y-2">
              <p className="text-xs text-foreground/80 leading-relaxed whitespace-pre-wrap">
                {item.description}
              </p>
              {item.clauseRef && (
                <p className="text-[11px] text-muted-foreground">
                  Related clause: <span className="font-medium">{item.clauseRef}</span>
                </p>
              )}
            </div>
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}
