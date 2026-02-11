"use client";

import { useMemo, useState, useEffect } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import {
  FileText,
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Clause, Finding } from "./types";

interface ClauseTextProps {
  clause: Clause | null;
}

// Risk config for banner and highlights
const riskBannerConfig = {
  RED: {
    icon: AlertCircle,
    label: "High Risk",
    bannerClass: "bg-red-50 border-red-200 text-red-800",
    badgeClass: "bg-red-100 text-red-800 border-red-200",
  },
  YELLOW: {
    icon: AlertTriangle,
    label: "Medium Risk",
    bannerClass: "bg-amber-50 border-amber-200 text-amber-800",
    badgeClass: "bg-amber-100 text-amber-800 border-amber-200",
  },
  GREEN: {
    icon: CheckCircle2,
    label: "Low Risk",
    bannerClass: "bg-emerald-50 border-emerald-200 text-emerald-700",
    badgeClass: "bg-emerald-100 text-emerald-700 border-emerald-200",
  },
};

const highlightColorMap: Record<string, string> = {
  RED: "bg-red-100/70 border-b-2 border-red-300",
  YELLOW: "bg-amber-100/70 border-b-2 border-amber-300",
  GREEN: "bg-emerald-100/60 border-b-2 border-emerald-300",
};

function getHighestRisk(
  findings: Finding[]
): "RED" | "YELLOW" | "GREEN" | null {
  if (findings.length === 0) return null;
  if (findings.some((f) => f.riskLevel === "RED")) return "RED";
  if (findings.some((f) => f.riskLevel === "YELLOW")) return "YELLOW";
  return "GREEN";
}

/**
 * Build highlighted clause text by finding and marking excerpts from findings.
 * Implements the "consumed ranges" algorithm from research.md R-006:
 * 1. Collect excerpt + riskLevel from findings
 * 2. Sort by severity (RED first) for priority colouring
 * 3. Find first occurrence of each excerpt via indexOf
 * 4. Build sorted ranges, merge overlaps (higher severity wins)
 * 5. Split text and wrap matched segments in <mark> elements
 */
function buildHighlightedText(
  text: string,
  findings: Finding[]
): React.ReactNode[] {
  // Collect valid excerpts
  const excerptEntries = findings
    .filter((f) => f.excerpt && f.excerpt.length > 0)
    .map((f) => ({ excerpt: f.excerpt.trim(), riskLevel: f.riskLevel, summary: f.summary }));

  if (excerptEntries.length === 0) {
    return [text];
  }

  // Sort by severity (RED first for priority colouring)
  const severityOrder: Record<string, number> = { RED: 0, YELLOW: 1, GREEN: 2 };
  excerptEntries.sort(
    (a, b) => (severityOrder[a.riskLevel] ?? 3) - (severityOrder[b.riskLevel] ?? 3)
  );

  // Build ranges
  const ranges: { start: number; end: number; riskLevel: string; summary: string }[] = [];

  for (const entry of excerptEntries) {
    const idx = text.indexOf(entry.excerpt);
    if (idx === -1) continue; // Graceful fallback: skip if no exact match
    ranges.push({
      start: idx,
      end: idx + entry.excerpt.length,
      riskLevel: entry.riskLevel,
      summary: entry.summary,
    });
  }

  if (ranges.length === 0) {
    return [text];
  }

  // Sort ranges by start position
  ranges.sort((a, b) => a.start - b.start);

  // Merge overlapping ranges (higher severity wins)
  const merged: typeof ranges = [];
  for (const range of ranges) {
    if (merged.length === 0) {
      merged.push({ ...range });
      continue;
    }
    const last = merged[merged.length - 1];
    if (range.start < last.end) {
      // Overlap — extend if needed, keep higher severity
      last.end = Math.max(last.end, range.end);
      if (
        (severityOrder[range.riskLevel] ?? 3) <
        (severityOrder[last.riskLevel] ?? 3)
      ) {
        last.riskLevel = range.riskLevel;
        last.summary = range.summary;
      }
    } else {
      merged.push({ ...range });
    }
  }

  // Build React nodes by splitting text at range boundaries
  const nodes: React.ReactNode[] = [];
  let cursor = 0;

  for (let i = 0; i < merged.length; i++) {
    const range = merged[i];

    // Text before this range
    if (cursor < range.start) {
      nodes.push(text.slice(cursor, range.start));
    }

    // Highlighted range
    const highlightClass = highlightColorMap[range.riskLevel] || "";
    nodes.push(
      <mark
        key={`highlight-${i}`}
        className={cn("rounded-sm px-0.5 py-0 inline", highlightClass)}
        title={range.summary}
      >
        {text.slice(range.start, range.end)}
      </mark>
    );

    cursor = range.end;
  }

  // Remaining text after last range
  if (cursor < text.length) {
    nodes.push(text.slice(cursor));
  }

  return nodes;
}

/**
 * Build an excerpt-focused view: for each finding with an excerpt,
 * show ~120 chars of surrounding context with the excerpt highlighted.
 * Merges overlapping ranges.
 */
function buildExcerptView(
  text: string,
  findings: Finding[]
): React.ReactNode[] | null {
  const excerptEntries = findings
    .filter((f) => f.excerpt && f.excerpt.length > 0)
    .map((f) => ({ excerpt: f.excerpt.trim(), riskLevel: f.riskLevel, summary: f.summary }));

  if (excerptEntries.length === 0) return null;

  const CONTEXT_CHARS = 120;

  // Build context ranges around each excerpt
  const contextRanges: { start: number; end: number; excerptStart: number; excerptEnd: number; riskLevel: string; summary: string }[] = [];

  for (const entry of excerptEntries) {
    const idx = text.indexOf(entry.excerpt);
    if (idx === -1) continue;
    contextRanges.push({
      start: Math.max(0, idx - CONTEXT_CHARS),
      end: Math.min(text.length, idx + entry.excerpt.length + CONTEXT_CHARS),
      excerptStart: idx,
      excerptEnd: idx + entry.excerpt.length,
      riskLevel: entry.riskLevel,
      summary: entry.summary,
    });
  }

  if (contextRanges.length === 0) return null;

  // Sort by start position
  contextRanges.sort((a, b) => a.start - b.start);

  // Merge overlapping context ranges
  const merged: typeof contextRanges = [contextRanges[0]];
  for (let i = 1; i < contextRanges.length; i++) {
    const last = merged[merged.length - 1];
    const curr = contextRanges[i];
    if (curr.start <= last.end) {
      // Merge: extend the context window, keep both excerpts by storing separately
      last.end = Math.max(last.end, curr.end);
    } else {
      merged.push({ ...curr });
    }
  }

  // Render each merged section
  const nodes: React.ReactNode[] = [];

  for (let i = 0; i < merged.length; i++) {
    const section = merged[i];
    const sectionText = text.slice(section.start, section.end);

    // Find all excerpts that fall within this section
    const sectionExcerpts: { localStart: number; localEnd: number; riskLevel: string; summary: string }[] = [];
    for (const entry of excerptEntries) {
      const idx = text.indexOf(entry.excerpt);
      if (idx === -1) continue;
      if (idx >= section.start && idx + entry.excerpt.length <= section.end) {
        sectionExcerpts.push({
          localStart: idx - section.start,
          localEnd: idx + entry.excerpt.length - section.start,
          riskLevel: entry.riskLevel,
          summary: entry.summary,
        });
      }
    }

    sectionExcerpts.sort((a, b) => a.localStart - b.localStart);

    // Build highlighted nodes for this section
    const sectionNodes: React.ReactNode[] = [];
    let cursor = 0;

    for (let j = 0; j < sectionExcerpts.length; j++) {
      const exc = sectionExcerpts[j];
      if (cursor < exc.localStart) {
        sectionNodes.push(sectionText.slice(cursor, exc.localStart));
      }
      const highlightClass = highlightColorMap[exc.riskLevel] || "";
      sectionNodes.push(
        <mark
          key={`exc-${i}-${j}`}
          className={cn("rounded-sm px-0.5 py-0 inline", highlightClass)}
          title={exc.summary}
        >
          {sectionText.slice(exc.localStart, exc.localEnd)}
        </mark>
      );
      cursor = exc.localEnd;
    }

    if (cursor < sectionText.length) {
      sectionNodes.push(sectionText.slice(cursor));
    }

    nodes.push(
      <div key={`section-${i}`} className="relative">
        {section.start > 0 && (
          <span className="text-muted-foreground select-none">… </span>
        )}
        {sectionNodes}
        {section.end < text.length && (
          <span className="text-muted-foreground select-none"> …</span>
        )}
      </div>
    );

    // Add separator between sections
    if (i < merged.length - 1) {
      nodes.push(
        <div key={`sep-${i}`} className="border-t border-dashed border-slate-200 dark:border-slate-700 my-2" />
      );
    }
  }

  return nodes;
}

export function ClauseText({ clause }: ClauseTextProps) {
  const [showFullText, setShowFullText] = useState(false);

  // Reset to excerpt view when selected clause changes
  useEffect(() => {
    setShowFullText(false);
  }, [clause?.id]);

  // All hooks must be called before any early returns
  const highlightedContent = useMemo(
    () =>
      clause
        ? buildHighlightedText(clause.clauseText, clause.findings)
        : [undefined],
    [clause]
  );

  const excerptContent = useMemo(
    () =>
      clause
        ? buildExcerptView(clause.clauseText, clause.findings)
        : null,
    [clause]
  );

  if (!clause) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2">
        <FileText className="h-8 w-8" />
        <p className="text-sm">Select a clause to view its text</p>
      </div>
    );
  }

  const highestRisk = getHighestRisk(clause.findings);
  const bannerConfig = highestRisk ? riskBannerConfig[highestRisk] : null;
  const BannerIcon = bannerConfig?.icon;

  // Whether excerpts are available — if not, always show full text
  const hasExcerpts = excerptContent !== null;

  return (
    <ScrollArea className="h-full">
      <div className="p-4 space-y-4">
        {/* Legal-style header */}
        <div className="flex items-start justify-between border-b border-slate-200 dark:border-slate-700 pb-3">
          <div>
            <h3
              className="text-base font-bold tracking-tight font-legal"
            >
              {clause.clauseNumber && (
                <span className="text-slate-500 dark:text-slate-400 mr-2">
                  §{clause.clauseNumber}
                </span>
              )}
              {clause.clauseName}
            </h3>
            {!clause.clauseNumber && (
              <span className="text-xs text-muted-foreground">
                Clause {clause.position}
              </span>
            )}
          </div>
          {hasExcerpts && (
            <button
              onClick={() => setShowFullText(!showFullText)}
              className="text-xs text-primary hover:underline shrink-0 mt-1"
            >
              {showFullText ? "Show excerpts" : "Show full text"}
            </button>
          )}
        </div>

        {/* Risk summary banner */}
        {bannerConfig && clause.findings.length > 0 && (
          <div
            className={cn(
              "flex items-center gap-2 rounded-md border px-3 py-2",
              bannerConfig.bannerClass
            )}
          >
            {BannerIcon && <BannerIcon className="h-4 w-4 shrink-0" />}
            <span className="text-xs font-semibold">{bannerConfig.label}</span>
            <span className="text-xs">·</span>
            <span className="text-xs">
              {clause.findings.length} finding
              {clause.findings.length !== 1 ? "s" : ""}
            </span>
            <div className="flex items-center gap-1 ml-auto">
              {clause.findings.filter((f) => f.riskLevel === "RED").length >
                0 && (
                <Badge
                  variant="outline"
                  className="px-1.5 py-0 text-[10px] bg-red-100 text-red-700 border-red-200"
                >
                  {clause.findings.filter((f) => f.riskLevel === "RED").length}{" "}
                  High
                </Badge>
              )}
              {clause.findings.filter((f) => f.riskLevel === "YELLOW").length >
                0 && (
                <Badge
                  variant="outline"
                  className="px-1.5 py-0 text-[10px] bg-amber-100 text-amber-700 border-amber-200"
                >
                  {
                    clause.findings.filter((f) => f.riskLevel === "YELLOW")
                      .length
                  }{" "}
                  Medium
                </Badge>
              )}
              {clause.findings.filter((f) => f.riskLevel === "GREEN").length >
                0 && (
                <Badge
                  variant="outline"
                  className="px-1.5 py-0 text-[10px] bg-emerald-100 text-emerald-700 border-emerald-200"
                >
                  {
                    clause.findings.filter((f) => f.riskLevel === "GREEN")
                      .length
                  }{" "}
                  Low
                </Badge>
              )}
            </div>
          </div>
        )}

        {/* Clause body — serif font for legal-document appearance */}
        <div
          className="text-[14.5px] leading-[1.8] text-foreground/90 whitespace-pre-wrap font-legal"
        >
          {showFullText || !hasExcerpts ? highlightedContent : excerptContent}
        </div>
      </div>
    </ScrollArea>
  );
}
