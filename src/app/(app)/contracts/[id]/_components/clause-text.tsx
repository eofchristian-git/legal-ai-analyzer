"use client";

import { useState, useEffect } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { FileText, Highlighter, BookOpen, MapPin, Save, X, AlertTriangle } from "lucide-react";
import { MarkdownViewer } from "@/components/shared/markdown-viewer";
import type { Clause, Finding } from "./types";
import { ClauseStatus, DerivedClauseStatus, TrackedChange } from "@/types/decisions";
import { TrackedChangesDisplay } from "./tracked-changes";
import { toast } from "sonner";

interface ClauseTextProps {
  clause: Clause | null;
  effectiveStatus?: ClauseStatus | DerivedClauseStatus | null;  // Feature 006/007 - Clause status from projection
  trackedChanges?: TrackedChange[];       // NEW: Feature 006 - Tracked changes for text modifications
  isEditMode?: boolean;                    // T048: Feature 006 - Enable inline editing
  effectiveText?: string | null;          // T048: The current effective text for editing
  onEditModeChange?: (isEdit: boolean) => void;  // T048: Callback to toggle edit mode
  onDecisionApplied?: () => void;         // T048: Callback after save
  escalatedToUserName?: string | null;    // T059: Show assignee name for escalated clauses
  hasUnresolvedEscalation?: boolean;      // T060: Show locked state
  editingFindingId?: string | null;       // T020c: Feature 007 - Finding ID for manual edits
}

const riskLabel: Record<string, string> = {
  RED: "High",
  YELLOW: "Medium",
  GREEN: "Low",
};

type ViewMode = "formatted" | "highlights";

export function ClauseText({ 
  clause, 
  effectiveStatus, 
  trackedChanges,
  isEditMode = false,
  effectiveText,
  onEditModeChange,
  onDecisionApplied,
  escalatedToUserName,
  hasUnresolvedEscalation,
  editingFindingId,
}: ClauseTextProps) {
  // Detect format: v1 has clauseText, v2 has empty clauseText with context fields
  const isLegacyFormat = !!clause?.clauseText && clause.clauseText.length > 0;
  const hasFormatted = !!clause?.clauseTextFormatted;
  const hasExcerpts = !!clause?.findings.some((f) => f.excerpt);
  const hasTrackedChanges = trackedChanges && trackedChanges.length > 0;
  const [viewMode, setViewMode] = useState<ViewMode>(
    hasFormatted ? "formatted" : "highlights"
  );

  // Debug logging
  console.log('[DEBUG ClauseText] Rendering with:', {
    clauseId: clause?.id,
    clauseTextLength: clause?.clauseText?.length,
    effectiveTextLength: effectiveText?.length,
    effectiveStatus,
    hasTrackedChanges,
    trackedChangesCount: trackedChanges?.length,
    usingEffectiveText: !!effectiveText
  });
  
  // T048: Edit mode state
  const [editedText, setEditedText] = useState<string>("");
  const [isSaving, setIsSaving] = useState(false);
  
  // Initialize edited text when entering edit mode
  useEffect(() => {
    if (isEditMode && clause) {
      setEditedText(effectiveText || clause.clauseText || "");
    }
  }, [isEditMode, clause, effectiveText]);
  
  // T050: Handle save edit
  // T020c: Pass findingId for manual edits (Feature 007)
  const handleSaveEdit = async () => {
    if (!clause || !editedText.trim()) {
      toast.error("Please enter some text");
      return;
    }
    
    if (!editingFindingId) {
      toast.error("No finding selected for editing");
      return;
    }
    
    setIsSaving(true);
    try {
      const response = await fetch(`/api/clauses/${clause.id}/decisions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          actionType: 'EDIT_MANUAL',
          findingId: editingFindingId,  // T020c: Feature 007 - Required for all decisions
          payload: {
            replacementText: editedText.trim(),
          },
          clauseUpdatedAtWhenLoaded: new Date().toISOString(),
        }),
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to save edit');
      }
      
      const data = await response.json();
      
      // Check for conflict warning
      if (data.conflictWarning) {
        toast.warning(data.conflictWarning.message, { duration: 8000 });
      } else {
        toast.success('Manual edit saved');
      }
      
      // Exit edit mode
      onEditModeChange?.(false);
      
      // Trigger parent refresh
      onDecisionApplied?.();
    } catch (error) {
      console.error('Error saving manual edit:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to save edit');
    } finally {
      setIsSaving(false);
    }
  };
  
  // T051: Handle cancel edit
  const handleCancelEdit = () => {
    setEditedText("");
    onEditModeChange?.(false);
  };

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
          <div className="flex items-center gap-3 flex-wrap">
            <Badge variant="outline" className="text-xs font-mono shrink-0">
              {clause.clauseNumber ? `§${clause.clauseNumber}` : `#${clause.position}`}
            </Badge>
            <h2 className="text-sm font-semibold text-foreground">{clause.clauseName}</h2>
            
            {/* T024: Effective Status Badge (Feature 007 - DerivedClauseStatus) */}
            {effectiveStatus && effectiveStatus !== 'DEVIATION_DETECTED' && effectiveStatus !== 'NO_DEVIATION' && effectiveStatus !== 'PENDING' && (
              <Badge 
                variant="secondary"
                className={cn(
                  "text-xs shrink-0",
                  effectiveStatus === 'RESOLVED' && "bg-green-100 text-green-800 border-green-300",
                  effectiveStatus === 'PARTIALLY_RESOLVED' && "bg-blue-100 text-blue-800 border-blue-300",
                  effectiveStatus === 'ESCALATED' && "bg-yellow-100 text-yellow-800 border-yellow-300",
                  effectiveStatus === 'NO_ISSUES' && "bg-green-100 text-green-800 border-green-300"
                )}
              >
                {effectiveStatus === 'RESOLVED' && '✓ Resolved'}
                {effectiveStatus === 'PARTIALLY_RESOLVED' && 'Partially Resolved'}
                {effectiveStatus === 'ESCALATED' && 'Escalated'}
                {effectiveStatus === 'NO_ISSUES' && 'No Issues'}
              </Badge>
            )}
            
            {/* T059: Show assignee name for escalated clauses */}
            {effectiveStatus === 'ESCALATED' && escalatedToUserName && (
              <span className="text-xs text-muted-foreground italic">
                (awaiting {escalatedToUserName})
              </span>
            )}
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
        <div className="px-6 py-5 space-y-6">
          {/* T060: Locked State UI - Show when clause is escalated */}
          {hasUnresolvedEscalation && escalatedToUserName && (
            <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-md">
              <div className="flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 text-yellow-600 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-yellow-900">
                    Awaiting decision from {escalatedToUserName}
                  </p>
                  <p className="text-xs text-yellow-700 mt-1">
                    This clause has been escalated. Only the assigned approver or an admin can make decisions.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* T048: Inline Editor Mode */}
          {isEditMode ? (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Edit Clause Text
                </h3>
                <div className="h-px flex-1 bg-border" />
              </div>
              
              <Textarea
                value={editedText}
                onChange={(e) => setEditedText(e.target.value)}
                placeholder="Enter custom clause text..."
                className="min-h-[300px] text-sm leading-7 font-legal resize-none"
                autoFocus
              />
              
              <div className="flex items-center gap-2">
                <Button
                  onClick={handleSaveEdit}
                  disabled={isSaving || !editedText.trim()}
                  size="sm"
                  className="gap-2"
                >
                  <Save className="h-4 w-4" />
                  {isSaving ? 'Saving...' : 'Save Edit'}
                </Button>
                <Button
                  onClick={handleCancelEdit}
                  disabled={isSaving}
                  variant="outline"
                  size="sm"
                  className="gap-2"
                >
                  <X className="h-4 w-4" />
                  Cancel
                </Button>
              </div>
              
              <p className="text-xs text-muted-foreground">
                Your changes will be saved and tracked. The original clause text will be preserved in the decision history.
              </p>
            </div>
          ) : (
            <>
              {/* T036: Display tracked changes if present (Feature 006) */}
              {hasTrackedChanges && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      Tracked Changes
                    </h3>
                    <div className="h-px flex-1 bg-border" />
                  </div>
                  <div className="p-4 bg-muted/50 rounded-md border">
                    <TrackedChangesDisplay changes={trackedChanges!} />
                  </div>
                </div>
              )}

              {/* Clause text - use effectiveText if available (from decisions), otherwise original text */}
              {isLegacyFormat ? (
                // Format v1: Show full clause text with optional highlighting
                viewMode === "formatted" && hasFormatted ? (
                  <MarkdownViewer content={effectiveText || clause.clauseTextFormatted || clause.clauseText} />
                ) : (
                  <ClauseTextWithHighlights text={effectiveText || clause.clauseText} excerpts={excerpts} />
                )
              ) : (
                // Format v2: Show findings with excerpt + context
                <DeviationFocusedView findings={clause.findings} />
              )}
            </>
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
