"use client";

import { useState } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { FileText, Highlighter, BookOpen, MapPin } from "lucide-react";
import { MarkdownViewer } from "@/components/shared/markdown-viewer";
import type { Clause, Finding } from "./types";

interface ClauseTextProps {
  clause: Clause | null;
}

const riskLabel: Record<string, string> = {
  RED: "High",
  YELLOW: "Medium",
  GREEN: "Low",
};

type ViewMode = "formatted" | "highlights";

export function ClauseText({ clause }: ClauseTextProps) {
  // Detect format: v1 has clauseText, v2 has empty clauseText with context fields
  const isLegacyFormat = !!clause?.clauseText && clause.clauseText.length > 0;
  const hasFormatted = !!clause?.clauseTextFormatted;
  const hasExcerpts = !!clause?.findings.some((f) => f.excerpt);
  const [viewMode, setViewMode] = useState<ViewMode>(
    hasFormatted ? "formatted" : "highlights"
  );

  if (!clause) {
    return (
      <div className="flex-1 min-h-0 flex flex-col items-center justify-center text-muted-foreground gap-2">
        <FileText className="h-8 w-8" />
        <p className="text-sm">Select a clause to view its text</p>
      </div>
    );
  }

  const excerpts = clause.findings
    .filter((f) => f.excerpt)
    .map((f) => ({
      text: f.excerpt,
      risk: f.riskLevel,
      id: f.id,
      summary: f.summary,
      rule: f.matchedRuleTitle,
    }));

  const showToggle = hasFormatted && hasExcerpts && isLegacyFormat;

  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
      <div className="px-6 py-4 border-b bg-card shrink-0">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Badge variant="outline" className="text-xs font-mono shrink-0">
              {clause.clauseNumber ? `§${clause.clauseNumber}` : `#${clause.position}`}
            </Badge>
            <h2 className="text-sm font-semibold text-foreground">{clause.clauseName}</h2>
          </div>
          {showToggle && (
            <div className="flex items-center gap-1 border rounded-md p-0.5">
              <Button
                size="sm"
                variant={viewMode === "formatted" ? "secondary" : "ghost"}
                className="h-6 px-2 text-[10px] gap-1"
                onClick={() => setViewMode("formatted")}
              >
                <BookOpen className="h-3 w-3" />
                Formatted
              </Button>
              <Button
                size="sm"
                variant={viewMode === "highlights" ? "secondary" : "ghost"}
                className="h-6 px-2 text-[10px] gap-1"
                onClick={() => setViewMode("highlights")}
              >
                <Highlighter className="h-3 w-3" />
                Highlights
              </Button>
            </div>
          )}
        </div>
      </div>
      <ScrollArea className="flex-1 min-h-0">
        <div className="px-6 py-5">
          {isLegacyFormat ? (
            // Format v1: Show full clause text with optional highlighting
            viewMode === "formatted" && hasFormatted ? (
              <MarkdownViewer content={clause.clauseTextFormatted!} />
            ) : (
              <ClauseTextWithHighlights text={clause.clauseText} excerpts={excerpts} />
            )
          ) : (
            // Format v2: Show findings with excerpt + context
            <DeviationFocusedView findings={clause.findings} />
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

// Format v2: Deviation-focused view with excerpts + context
function DeviationFocusedView({ findings }: { findings: Finding[] }) {
  if (findings.length === 0) {
    return (
      <div className="text-sm text-muted-foreground italic">
        No findings for this clause
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {findings.map((finding) => (
        <div key={finding.id} className="space-y-2">
          {/* Location badge */}
          {finding.locationPage && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <MapPin className="h-3 w-3" />
              <span>
                Page {finding.locationPage}
                {finding.locationPosition && ` (${finding.locationPosition})`}
              </span>
            </div>
          )}

          {/* Context before (muted) */}
          {finding.contextBefore && (
            <p className="text-sm leading-6 text-muted-foreground italic">
              ...{finding.contextBefore}
            </p>
          )}

          {/* Excerpt (highlighted) */}
          <div
            className={cn(
              "rounded-md px-4 py-3 border-l-4",
              finding.riskLevel === "RED"
                ? "bg-risk-red-soft border-risk-red"
                : finding.riskLevel === "YELLOW"
                ? "bg-risk-yellow-soft border-risk-yellow"
                : "bg-risk-green-soft border-risk-green"
            )}
          >
            <p className="text-sm leading-6 font-medium text-foreground">
              {finding.excerpt}
            </p>
          </div>

          {/* Context after (muted) */}
          {finding.contextAfter && (
            <p className="text-sm leading-6 text-muted-foreground italic">
              {finding.contextAfter}...
            </p>
          )}

          {/* Finding details */}
          <div className="flex items-start gap-2 pt-1">
            <Badge
              variant="outline"
              className={cn(
                "shrink-0 text-xs",
                finding.riskLevel === "RED"
                  ? "bg-risk-red-soft text-risk-red border-risk-red-border"
                  : finding.riskLevel === "YELLOW"
                  ? "bg-risk-yellow-soft text-risk-yellow border-risk-yellow-border"
                  : "bg-risk-green-soft text-risk-green border-risk-green-border"
              )}
            >
              {riskLabel[finding.riskLevel]}
            </Badge>
            <div className="flex-1 space-y-1">
              <p className="text-xs font-medium text-foreground">{finding.summary}</p>
              <p className="text-[10px] text-muted-foreground">{finding.matchedRuleTitle}</p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function ClauseTextWithHighlights({
  text,
  excerpts,
}: {
  text: string;
  excerpts: { text: string; risk: string; id: string; summary: string; rule: string }[];
}) {
  if (excerpts.length === 0) {
    return <p className="text-sm leading-7 text-foreground/90 font-legal">{text}</p>;
  }

  // Build highlighted segments
  const segments: { content: string; excerpt?: (typeof excerpts)[0] }[] = [];
  let remaining = text;

  for (const ex of excerpts) {
    const idx = remaining.indexOf(ex.text);
    if (idx >= 0) {
      if (idx > 0) segments.push({ content: remaining.slice(0, idx) });
      segments.push({ content: ex.text, excerpt: ex });
      remaining = remaining.slice(idx + ex.text.length);
    }
  }
  if (remaining) segments.push({ content: remaining });

  return (
    <TooltipProvider delayDuration={200}>
      <p className="text-sm leading-7 text-foreground/90 font-legal">
        {segments.map((seg, i) =>
          seg.excerpt ? (
            <Tooltip key={i}>
              <TooltipTrigger asChild>
                <mark
                  className={cn(
                    "rounded px-0.5 py-0.5 font-medium cursor-help transition-colors",
                    seg.excerpt.risk === "RED"
                      ? "bg-risk-red-soft text-risk-red border-b-2 border-risk-red/40 hover:bg-risk-red-soft/80"
                      : seg.excerpt.risk === "YELLOW"
                      ? "bg-risk-yellow-soft text-risk-yellow border-b-2 border-risk-yellow/40 hover:bg-risk-yellow-soft/80"
                      : "bg-risk-green-soft text-risk-green border-b-2 border-risk-green/40 hover:bg-risk-green-soft/80"
                  )}
                >
                  {seg.content}
                </mark>
              </TooltipTrigger>
              <TooltipContent
                side="top"
                className="max-w-xs p-3 space-y-1.5"
              >
                <div className="flex items-center gap-1.5">
                  <span className={cn(
                    "text-xs font-medium px-2.5 py-0.5 rounded-full border",
                    seg.excerpt.risk === "RED" ? "bg-risk-red-soft text-risk-red border-risk-red-border" :
                    seg.excerpt.risk === "YELLOW" ? "bg-risk-yellow-soft text-risk-yellow border-risk-yellow-border" :
                    "bg-risk-green-soft text-risk-green border-risk-green-border"
                  )}>
                    {riskLabel[seg.excerpt.risk] ?? seg.excerpt.risk}
                  </span>
                  <span className="text-[10px] text-muted-foreground">{seg.excerpt.rule}</span>
                </div>
                <p className="text-xs font-medium">{seg.excerpt.summary}</p>
              </TooltipContent>
            </Tooltip>
          ) : (
            <span key={i}>{seg.content}</span>
          )
        )}
      </p>
    </TooltipProvider>
  );
}
