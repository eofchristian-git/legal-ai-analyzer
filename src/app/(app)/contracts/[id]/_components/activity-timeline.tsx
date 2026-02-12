"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  History,
  FileText,
  Play,
  CheckCircle2,
  Lock,
  MessageSquare,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { ActivityLogEntry, ActivityAction } from "./types";

interface ActivityTimelineProps {
  contractId: string;
  /** Bump this to trigger a refresh */
  refreshKey?: number;
}

const ACTION_CONFIG: Record<
  ActivityAction,
  { icon: React.ElementType; color: string; bgColor: string; label: string }
> = {
  contract_created: {
    icon: FileText,
    color: "text-blue-600",
    bgColor: "bg-blue-50 border-blue-200",
    label: "Contract created",
  },
  analysis_run: {
    icon: Play,
    color: "text-indigo-600",
    bgColor: "bg-indigo-50 border-indigo-200",
    label: "Analysis run",
  },
  finding_triaged: {
    icon: CheckCircle2,
    color: "text-amber-600",
    bgColor: "bg-amber-50 border-amber-200",
    label: "Finding triaged",
  },
  triage_finalized: {
    icon: Lock,
    color: "text-emerald-600",
    bgColor: "bg-emerald-50 border-emerald-200",
    label: "Triage finalized",
  },
  comment_added: {
    icon: MessageSquare,
    color: "text-sky-600",
    bgColor: "bg-sky-50 border-sky-200",
    label: "Comment added",
  },
};

function getDecisionColor(decision: string) {
  switch (decision) {
    case "ACCEPT":
      return "text-emerald-600";
    case "NEEDS_REVIEW":
      return "text-amber-600";
    case "REJECT":
      return "text-red-600";
    default:
      return "text-muted-foreground";
  }
}

function formatRelativeTime(dateStr: string) {
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  if (diffSecs < 60) return "just now";
  const diffMins = Math.floor(diffSecs / 60);
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHrs = Math.floor(diffMins / 60);
  if (diffHrs < 24) return `${diffHrs}h ago`;
  const diffDays = Math.floor(diffHrs / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function renderMetadata(action: ActivityAction, metadataStr: string | null) {
  if (!metadataStr) return null;
  try {
    const meta = JSON.parse(metadataStr);

    switch (action) {
      case "finding_triaged":
        return (
          <span>
            {meta.clauseName && (
              <span className="text-muted-foreground">
                {meta.clauseName} &middot;{" "}
              </span>
            )}
            {meta.decision && (
              <span
                className={cn(
                  "font-medium",
                  getDecisionColor(meta.decision)
                )}
              >
                {meta.decision.replace("_", " ")}
              </span>
            )}
          </span>
        );
      case "analysis_run":
        return (
          <span className="text-muted-foreground">
            {meta.clauseCount} clauses &middot; {meta.findingCount} findings
            &middot; Risk: {meta.overallRisk}
          </span>
        );
      case "comment_added":
        return (
          <span className="text-muted-foreground">
            on {meta.clauseName || "finding"}
          </span>
        );
      case "triage_finalized":
        return (
          <span className="text-muted-foreground">
            {meta.totalFindings} findings reviewed
          </span>
        );
      default:
        return null;
    }
  } catch {
    return null;
  }
}

export function ActivityTimeline({
  contractId,
  refreshKey,
}: ActivityTimelineProps) {
  const [open, setOpen] = useState(false);
  const [logs, setLogs] = useState<ActivityLogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const loadLogs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/contracts/${contractId}/activity`);
      if (res.ok) {
        const data = await res.json();
        setLogs(data);
        setLoaded(true);
      }
    } finally {
      setLoading(false);
    }
  }, [contractId]);

  // Load when sheet is opened
  useEffect(() => {
    if (open && !loaded) {
      loadLogs();
    }
  }, [open, loaded, loadLogs]);

  // Refresh when refreshKey changes and sheet has been opened before
  useEffect(() => {
    if (loaded && refreshKey) {
      loadLogs();
    }
  }, [refreshKey, loaded, loadLogs]);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5">
          <History className="h-3.5 w-3.5" />
          Activity
          {logs.length > 0 && (
            <span className="text-[10px] text-muted-foreground">
              ({logs.length})
            </span>
          )}
        </Button>
      </SheetTrigger>
      <SheetContent className="w-[400px] sm:w-[440px] p-0 flex flex-col">
        <SheetHeader className="px-5 py-4 border-b shrink-0">
          <div className="flex items-center justify-between">
            <SheetTitle className="flex items-center gap-2 text-base">
              <History className="h-4 w-4" />
              Activity Log
            </SheetTitle>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs gap-1"
              onClick={loadLogs}
              disabled={loading}
            >
              <RefreshCw
                className={cn("h-3 w-3", loading && "animate-spin")}
              />
              Refresh
            </Button>
          </div>
        </SheetHeader>

        <ScrollArea className="flex-1">
          <div className="px-5 py-4">
            {loading && !loaded ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : logs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
                <History className="h-8 w-8 opacity-40" />
                <p className="text-sm">No activity recorded yet.</p>
              </div>
            ) : (
              <div className="relative">
                {/* Vertical line */}
                <div className="absolute left-[13px] top-4 bottom-4 w-px bg-border" />

                <div className="space-y-1">
                  {logs.map((log) => {
                    const config =
                      ACTION_CONFIG[log.action as ActivityAction] ??
                      ACTION_CONFIG.contract_created;
                    const Icon = config.icon;
                    const metaEl = renderMetadata(
                      log.action as ActivityAction,
                      log.metadata
                    );

                    return (
                      <div
                        key={log.id}
                        className="relative flex items-start gap-3 py-2.5"
                      >
                        {/* Icon dot */}
                        <div
                          className={cn(
                            "relative z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border",
                            config.bgColor,
                            config.color
                          )}
                        >
                          <Icon className="h-3.5 w-3.5" />
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0 pt-0.5">
                          <div className="flex items-baseline justify-between gap-2">
                            <span className="text-sm font-medium">
                              {config.label}
                            </span>
                            <span className="text-[10px] text-muted-foreground/70 shrink-0">
                              {formatRelativeTime(log.createdAt)}
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            by {log.user.name}
                          </p>
                          {metaEl && (
                            <div className="text-xs mt-1">{metaEl}</div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
