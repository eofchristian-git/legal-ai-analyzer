"use client";

import { useState, useCallback } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { SeverityBadge } from "@/components/shared/severity-badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  BookOpen,
  ChevronDown,
  Search,
  MessageSquare,
  Send,
  Loader2,
  User,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { TriageControls } from "./triage-controls";
import type { Clause, Finding, FindingComment, TriageDecision } from "./types";

interface FindingsPanelProps {
  clause: Clause | null;
  finalized: boolean;
  contractId: string;
  onTriageDecision: (
    findingId: string,
    decision: TriageDecision,
    note?: string
  ) => void;
  onCommentAdded?: (findingId: string, comment: FindingComment) => void;
}

export function FindingsPanel({
  clause,
  finalized,
  contractId,
  onTriageDecision,
  onCommentAdded,
}: FindingsPanelProps) {
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
    <ScrollArea className="h-full">
      <div className="p-3 space-y-3">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          {clause.findings.length} finding
          {clause.findings.length !== 1 ? "s" : ""}
        </p>
        {clause.findings.map((finding) => (
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
  const [isOpen, setIsOpen] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [posting, setPosting] = useState(false);

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
      onCommentAdded?.(finding.id, comment);
      toast.success("Comment posted");
    } catch {
      toast.error("Failed to post comment");
    } finally {
      setPosting(false);
    }
  }, [commentText, contractId, finding.id, onCommentAdded]);

  const formatTime = (dateStr: string) => {
    const d = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return "just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHrs = Math.floor(diffMins / 60);
    if (diffHrs < 24) return `${diffHrs}h ago`;
    const diffDays = Math.floor(diffHrs / 24);
    if (diffDays < 7) return `${diffDays}d ago`;
    return d.toLocaleDateString();
  };

  return (
    <div className="rounded-lg border bg-card p-3 space-y-2.5">
      {/* Header: risk badge + summary */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium">{finding.summary}</p>
        </div>
        <SeverityBadge severity={finding.riskLevel} size="sm" />
      </div>

      {/* Matched Playbook Rule */}
      <div className="flex items-center gap-1.5">
        <Badge
          variant="outline"
          className="gap-1 text-[11px] font-normal text-muted-foreground shrink-0"
        >
          <BookOpen className="h-3 w-3" />
          Playbook Rule
        </Badge>
        <span className="text-xs font-medium truncate">
          {finding.matchedRuleTitle}
        </span>
      </div>

      {/* Why Triggered */}
      <div className="rounded bg-muted/50 px-2.5 py-2 text-xs text-muted-foreground">
        <span className="font-medium text-foreground/70">Why triggered: </span>
        {finding.whyTriggered}
      </div>

      {/* Fallback Text (collapsible) */}
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger className="flex items-center gap-1 text-xs font-medium text-primary hover:underline">
          <ChevronDown
            className={cn(
              "h-3 w-3 transition-transform",
              isOpen && "rotate-180"
            )}
          />
          Recommended alternative language
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="mt-1.5 rounded bg-primary/5 border border-primary/10 px-2.5 py-2 text-xs text-foreground/80 whitespace-pre-wrap">
            {finding.fallbackText}
          </div>
        </CollapsibleContent>
      </Collapsible>

      {/* Triage Controls */}
      <TriageControls
        findingId={finding.id}
        currentDecision={finding.triageDecision}
        currentNote={finding.triageNote}
        disabled={finalized}
        onDecision={onTriageDecision}
      />

      {/* Triaged by info */}
      {finding.triageDecision && finding.triagedByName && (
        <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
          <User className="h-3 w-3" />
          Triaged by {finding.triagedByName}
          {finding.triagedAt && (
            <span className="ml-1">{formatTime(finding.triagedAt)}</span>
          )}
        </div>
      )}

      {/* Comments section */}
      <Collapsible open={commentsOpen} onOpenChange={setCommentsOpen}>
        <CollapsibleTrigger className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors">
          <MessageSquare className="h-3 w-3" />
          {finding.comments.length > 0
            ? `${finding.comments.length} comment${finding.comments.length !== 1 ? "s" : ""}`
            : "Add comment"}
          <ChevronDown
            className={cn(
              "h-3 w-3 transition-transform",
              commentsOpen && "rotate-180"
            )}
          />
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="mt-2 space-y-2">
            {/* Existing comments */}
            {finding.comments.map((comment) => (
              <div
                key={comment.id}
                className="rounded bg-muted/40 px-2.5 py-2 text-xs"
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-medium text-foreground/80">
                    {comment.user.name}
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    {formatTime(comment.createdAt)}
                  </span>
                </div>
                <p className="text-muted-foreground whitespace-pre-wrap">
                  {comment.content}
                </p>
              </div>
            ))}

            {/* New comment input */}
            <div className="flex gap-1.5">
              <Textarea
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                placeholder="Add a comment..."
                className="min-h-[60px] text-xs resize-none"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                    handlePostComment();
                  }
                }}
              />
              <Button
                size="icon"
                variant="ghost"
                className="shrink-0 h-8 w-8 self-end"
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
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
