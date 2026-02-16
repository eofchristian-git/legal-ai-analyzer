"use client";

import { useState, useCallback, useMemo } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  CircleCheck,
  MessageSquare,
  Swords,
  Search,
  Send,
  Loader2,
  MapPin,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { MarkdownViewer } from "@/components/shared/markdown-viewer";
import type { Clause, Finding, FindingComment, NegotiationItem, TriageDecision } from "./types";

interface FindingsPanelProps {
  clause: Clause | null;
  finalized: boolean;
  contractId: string;
  executiveSummary?: string | null;
  negotiationItems?: NegotiationItem[];
  onTriageDecision: (
    findingId: string,
    decision: TriageDecision,
    note?: string
  ) => void;
  onCommentAdded?: (findingId: string, comment: FindingComment) => void;
}

const severityOrder: Record<string, number> = { RED: 0, YELLOW: 1, GREEN: 2 };

const riskIcon = {
  RED: AlertCircle,
  YELLOW: AlertTriangle,
  GREEN: CheckCircle2,
};

const riskLabel: Record<string, string> = {
  RED: "High",
  YELLOW: "Medium",
  GREEN: "Low",
};

export function FindingsPanel({
  clause,
  finalized,
  contractId,
  executiveSummary,
  negotiationItems = [],
  onTriageDecision,
  onCommentAdded,
}: FindingsPanelProps) {
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [strategyOpen, setStrategyOpen] = useState(false);

  // Sort findings by severity: RED → YELLOW → GREEN
  const sortedFindings = useMemo(() => {
    if (!clause) return [];
    return [...clause.findings].sort(
      (a, b) =>
        (severityOrder[a.riskLevel] ?? 3) - (severityOrder[b.riskLevel] ?? 3)
    );
  }, [clause]);

  if (!clause) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2">
        <Search className="h-8 w-8" />
        <p className="text-sm">Select a clause to view findings</p>
      </div>
    );
  }

  if (clause.findings.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2">
        <p className="text-sm">No findings for this clause</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-card overflow-hidden">
      <div className="px-4 py-3 border-b shrink-0">
        <p className="text-[10px] uppercase tracking-widest font-semibold text-muted-foreground">
          Findings & Triage
        </p>
      </div>
      <ScrollArea className="flex-1 min-h-0">
        <div className="p-4 space-y-3">
          {/* Executive Summary collapsible */}
          {executiveSummary && (
            <Collapsible open={summaryOpen} onOpenChange={setSummaryOpen}>
              <CollapsibleTrigger asChild>
                <button className="flex items-center gap-2 w-full text-left text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors uppercase tracking-wider py-1">
                  <ChevronDown className={cn("h-3 w-3 transition-transform", summaryOpen && "rotate-180")} />
                  Executive Summary
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="mt-2 p-3 rounded-md bg-muted/50 border text-xs">
                  <MarkdownViewer content={executiveSummary} />
                </div>
              </CollapsibleContent>
            </Collapsible>
          )}

          {/* Negotiation Strategy collapsible */}
          {negotiationItems.length > 0 && (
            <Collapsible open={strategyOpen} onOpenChange={setStrategyOpen}>
              <CollapsibleTrigger asChild>
                <button className="flex items-center gap-2 w-full text-left text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors uppercase tracking-wider py-1">
                  <ChevronDown className={cn("h-3 w-3 transition-transform", strategyOpen && "rotate-180")} />
                  <Swords className="h-3 w-3" />
                  Strategy ({negotiationItems.length})
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="mt-2 space-y-1.5">
                  {negotiationItems.map((item) => (
                    <div key={item.id} className="flex items-start gap-2 p-2 rounded-md bg-muted/50 border text-xs">
                      <Badge variant="outline" className={cn(
                        "shrink-0 text-xs px-2 py-0.5",
                        item.priority === "P1" ? "bg-risk-red-soft text-risk-red border-risk-red-border" :
                        item.priority === "P2" ? "bg-risk-yellow-soft text-risk-yellow border-risk-yellow-border" :
                        "bg-risk-info-soft text-risk-info border-risk-info-border"
                      )}>
                        {item.priority}
                      </Badge>
                      <div>
                        <p className="font-medium text-foreground">{item.title}</p>
                        <p className="text-muted-foreground mt-0.5">{item.description}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </CollapsibleContent>
            </Collapsible>
          )}

          <Separator />

          {/* Current clause findings */}
          <p className="text-[10px] uppercase tracking-widest font-semibold text-muted-foreground">
            {clause.clauseName} — {clause.findings.length} finding{clause.findings.length !== 1 ? "s" : ""}
          </p>

          {sortedFindings.map((finding) => (
            <FindingCard
              key={finding.id}
              finding={finding}
              finalized={finalized}
              contractId={contractId}
              onTriageDecision={onTriageDecision}
              onCommentAdded={onCommentAdded}
            />
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}

function FindingCard({
  finding,
  finalized,
  contractId,
  onTriageDecision,
  onCommentAdded,
}: {
  finding: Finding;
  finalized: boolean;
  contractId: string;
  onTriageDecision: (
    findingId: string,
    decision: TriageDecision,
    note?: string
  ) => void;
  onCommentAdded?: (findingId: string, comment: FindingComment) => void;
}) {
  const [addingComment, setAddingComment] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [posting, setPosting] = useState(false);

  const Icon = riskIcon[finding.riskLevel as keyof typeof riskIcon] ?? AlertCircle;

  const handlePostComment = useCallback(async () => {
    if (!commentText.trim()) return;
    setPosting(true);
    try {
      const res = await fetch(
        `/api/contracts/${contractId}/findings/${finding.id}/comments`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: commentText.trim() }),
        }
      );

      if (!res.ok) {
        const err = await res.json();
        toast.error(err.error || "Failed to post comment");
        return;
      }

      const comment = await res.json();
      setCommentText("");
      setAddingComment(false);
      onCommentAdded?.(finding.id, comment);
      toast.success("Comment posted");
    } catch {
      toast.error("Failed to post comment");
    } finally {
      setPosting(false);
    }
  }, [commentText, contractId, finding.id, onCommentAdded]);

  return (
    <div
      className={cn(
        "rounded-lg border-l-[3px] bg-card p-3 space-y-2 shadow-sm border border-border",
        finding.riskLevel === "RED" ? "border-l-risk-red" :
        finding.riskLevel === "YELLOW" ? "border-l-risk-yellow" : "border-l-risk-green",
        finalized && "opacity-70"
      )}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <Icon className={cn(
            "h-4 w-4 shrink-0",
            finding.riskLevel === "RED" ? "text-risk-red" :
            finding.riskLevel === "YELLOW" ? "text-risk-yellow" : "text-risk-green"
          )} />
          <Badge variant="outline" className={cn(
            "text-xs px-2 py-0.5",
            finding.riskLevel === "RED" ? "bg-risk-red-soft text-risk-red border-risk-red-border" :
            finding.riskLevel === "YELLOW" ? "bg-risk-yellow-soft text-risk-yellow border-risk-yellow-border" :
            "bg-risk-green-soft text-risk-green border-risk-green-border"
          )}>
            {riskLabel[finding.riskLevel] ?? finding.riskLevel}
          </Badge>
        </div>
        {finding.triageDecision && (
          <Badge variant="outline" className={cn(
            "text-[11px] shrink-0 px-2 py-0.5",
            finding.triageDecision === "ACCEPT" ? "bg-risk-green-soft text-risk-green border-risk-green-border" :
            finding.triageDecision === "NEEDS_REVIEW" ? "bg-risk-yellow-soft text-risk-yellow border-risk-yellow-border" :
            "bg-risk-red-soft text-risk-red border-risk-red-border"
          )}>
            <CircleCheck className="h-3 w-3 mr-0.5" />
            {finding.triageDecision === "ACCEPT" ? "accept" :
             finding.triageDecision === "NEEDS_REVIEW" ? "negotiate" : "escalate"}
          </Badge>
        )}
      </div>

      {/* Location (v2 format only) */}
      {finding.locationPage && (
        <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
          <MapPin className="h-3 w-3" />
          <span>
            Page {finding.locationPage}
            {finding.locationPosition && ` (${finding.locationPosition})`}
          </span>
        </div>
      )}

      {/* Rule + Summary */}
      <div>
        <p className="text-[10px] text-muted-foreground">{finding.matchedRuleTitle}</p>
        <p className="text-xs font-medium text-foreground mt-0.5">{finding.summary}</p>
      </div>

      {/* Excerpt */}
      {finding.excerpt && (
        <blockquote className={cn(
          "border-l-2 pl-2.5 text-[11px] text-muted-foreground italic",
          finding.riskLevel === "RED" ? "border-l-risk-red" :
          finding.riskLevel === "YELLOW" ? "border-l-risk-yellow" : "border-l-risk-green"
        )}>
          &ldquo;{finding.excerpt}&rdquo;
        </blockquote>
      )}

      {/* Fallback */}
      {finding.fallbackText && (
        <p className="border-l-2 border-l-risk-green pl-2.5 text-[11px] text-muted-foreground">{finding.fallbackText}</p>
      )}

      {/* Triage Buttons */}
      {!finding.triageDecision && !finalized && (
        <div className="flex gap-1.5 pt-1">
          <Button size="sm" variant="outline" className="text-[10px] h-6 px-2" onClick={() => onTriageDecision(finding.id, "ACCEPT")}>
            Accept
          </Button>
          <Button size="sm" variant="outline" className="text-[10px] h-6 px-2" onClick={() => onTriageDecision(finding.id, "NEEDS_REVIEW")}>
            Negotiate
          </Button>
          <Button size="sm" variant="outline" className="text-[10px] h-6 px-2" onClick={() => onTriageDecision(finding.id, "REJECT")}>
            Escalate
          </Button>
        </div>
      )}

      {/* Comments */}
      {finding.comments.length > 0 && (
        <div className="border-t pt-2 mt-1 space-y-1">
          {finding.comments.map((c) => (
            <div key={c.id} className="flex items-start gap-1.5 text-[11px]">
              <MessageSquare className="h-3 w-3 text-muted-foreground shrink-0 mt-0.5" />
              <span>
                <span className="font-medium text-foreground">{c.user.name}</span>{" "}
                <span className="text-muted-foreground">{c.content}</span>
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Add comment */}
      {!addingComment ? (
        <button
          onClick={() => setAddingComment(true)}
          className="flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
        >
          <MessageSquare className="h-3 w-3" />
          Add comment
        </button>
      ) : (
        <div className="flex gap-1.5 pt-1">
          <Textarea
            value={commentText}
            onChange={(e) => setCommentText(e.target.value)}
            placeholder="Add a comment..."
            className="min-h-[60px] text-xs resize-none"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                handlePostComment();
              }
              if (e.key === "Escape") {
                setAddingComment(false);
                setCommentText("");
              }
            }}
          />
          <div className="flex flex-col gap-1">
            <Button
              size="icon"
              variant="ghost"
              className="shrink-0 h-7 w-7"
              disabled={!commentText.trim() || posting}
              onClick={handlePostComment}
            >
              {posting ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Send className="h-3.5 w-3.5" />
              )}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
