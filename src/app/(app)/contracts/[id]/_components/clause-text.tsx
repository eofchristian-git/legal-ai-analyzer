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
import {
  FileText,
  Highlighter,
  BookOpen,
  MapPin,
  Save,
  X,
  AlertTriangle,
  Pencil,
  ArrowDown,
  CheckCircle2,
  GitMerge,
  Loader2,
} from "lucide-react";
import { MarkdownViewer } from "@/components/shared/markdown-viewer";
import type { Clause, Finding } from "./types";
import { ClauseStatus, DerivedClauseStatus, FindingStatusEntry, TrackedChange, ProjectionResult } from "@/types/decisions";
import { toast } from "sonner";

interface ClauseTextProps {
  clause: Clause | null;
  effectiveStatus?: ClauseStatus | DerivedClauseStatus | null;
  trackedChanges?: TrackedChange[];
  isEditMode?: boolean;
  effectiveText?: string | null;
  onEditModeChange?: (isEdit: boolean) => void;
  onDecisionApplied?: () => void;
  escalatedToUserName?: string | null;
  hasUnresolvedEscalation?: boolean;
  editingFindingId?: string | null;
  findingStatuses?: Record<string, FindingStatusEntry>;
  onProjectionUpdate?: (projection: ProjectionResult) => void;
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
  findingStatuses,
  onProjectionUpdate,
}: ClauseTextProps) {
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

  const [editedText, setEditedText] = useState<string>("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (isEditMode && clause) {
      setEditedText(effectiveText || clause.clauseText || "");
    }
  }, [isEditMode, clause, effectiveText]);

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
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          actionType: "EDIT_MANUAL",
          findingId: editingFindingId,
          payload: { replacementText: editedText.trim() },
          clauseUpdatedAtWhenLoaded: new Date().toISOString(),
        }),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to save edit");
      }
      const data = await response.json();
      if (data.conflictWarning) {
        toast.warning(data.conflictWarning.message, { duration: 8000 });
      } else {
        toast.success("Manual edit saved");
      }
      onEditModeChange?.(false);
      onDecisionApplied?.();
    } catch (error) {
      console.error("Error saving manual edit:", error);
      toast.error(error instanceof Error ? error.message : "Failed to save edit");
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancelEdit = () => {
    setEditedText("");
    onEditModeChange?.(false);
  };

  if (!clause) {
    return (
      <div className="flex-1 min-h-0 flex flex-col items-center justify-center gap-3 text-muted-foreground">
        <div className="w-12 h-12 rounded-xl border-2 border-dashed border-muted-foreground/20 flex items-center justify-center">
          <FileText className="h-5 w-5 opacity-40" />
        </div>
        <p className="text-sm text-muted-foreground/60">Select a clause to review</p>
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
      {/* ── Header ── */}
      <div className="px-6 py-4 border-b bg-card shrink-0">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 flex-wrap min-w-0">
            {/* Clause number — monospace legal style */}
            <span className="mt-0.5 shrink-0 text-[11px] font-mono font-semibold text-muted-foreground bg-muted px-2 py-0.5 rounded border border-border/60">
              {clause.clauseNumber ? `§\u2009${clause.clauseNumber}` : `#${clause.position}`}
            </span>

            <div className="flex flex-col gap-1.5 min-w-0">
              <h2 className="text-sm font-semibold text-foreground leading-snug">
                {clause.clauseName}
              </h2>

              {/* Status badges row */}
              <div className="flex items-center gap-2 flex-wrap">
                {effectiveStatus &&
                  effectiveStatus !== "DEVIATION_DETECTED" &&
                  effectiveStatus !== "NO_DEVIATION" &&
                  effectiveStatus !== "PENDING" && (
                    <span
                      className={cn(
                        "inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full border",
                        effectiveStatus === "RESOLVED" &&
                          "bg-green-50 text-green-700 border-green-200",
                        effectiveStatus === "PARTIALLY_RESOLVED" &&
                          "bg-blue-50 text-blue-700 border-blue-200",
                        effectiveStatus === "ESCALATED" &&
                          "bg-amber-50 text-amber-700 border-amber-200",
                        effectiveStatus === "NO_ISSUES" &&
                          "bg-green-50 text-green-700 border-green-200"
                      )}
                    >
                      {effectiveStatus === "RESOLVED" && (
                        <CheckCircle2 className="h-3 w-3" />
                      )}
                      {effectiveStatus === "RESOLVED" && "Resolved"}
                      {effectiveStatus === "PARTIALLY_RESOLVED" && "Partially Resolved"}
                      {effectiveStatus === "ESCALATED" && "Escalated"}
                      {effectiveStatus === "NO_ISSUES" && "No Issues"}
                    </span>
                  )}

                {effectiveStatus === "ESCALATED" && escalatedToUserName && (
                  <span className="text-[10px] text-muted-foreground">
                    awaiting {escalatedToUserName}
                  </span>
                )}

                {hasTrackedChanges && !isEditMode && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-violet-50 text-violet-700 border border-violet-200">
                    <GitMerge className="h-3 w-3" />
                    Changes applied
                  </span>
                )}

                {isEditMode && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                    <Pencil className="h-3 w-3" />
                    Editing
                  </span>
                )}
              </div>
            </div>
          </div>

          {showToggle && (
            <div className="shrink-0 flex items-center gap-0.5 border rounded-lg p-0.5 bg-muted/40">
              <Button
                size="sm"
                variant={viewMode === "formatted" ? "secondary" : "ghost"}
                className="h-6 px-2 text-[10px] gap-1 rounded-md"
                onClick={() => setViewMode("formatted")}
              >
                <BookOpen className="h-3 w-3" />
                Formatted
              </Button>
              <Button
                size="sm"
                variant={viewMode === "highlights" ? "secondary" : "ghost"}
                className="h-6 px-2 text-[10px] gap-1 rounded-md"
                onClick={() => setViewMode("highlights")}
              >
                <Highlighter className="h-3 w-3" />
                Highlights
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* ── Body ── */}
      <ScrollArea className="flex-1 min-h-0">
        <div className="px-6 py-5 space-y-5">

          {/* Escalation warning */}
          {hasUnresolvedEscalation && escalatedToUserName && (
            <div className="flex items-start gap-3 p-4 rounded-lg bg-amber-50 border border-amber-200">
              <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-amber-900">
                  Awaiting {escalatedToUserName}
                </p>
                <p className="text-xs text-amber-700 mt-0.5">
                  Only the assigned approver or an admin can make decisions on this clause.
                </p>
              </div>
            </div>
          )}

          {isEditMode ? (
            // ── In-place editor ──
            <div className="space-y-3">
              <Textarea
                value={editedText}
                onChange={(e) => setEditedText(e.target.value)}
                placeholder="Enter custom clause text…"
                className="min-h-[280px] text-sm leading-7 font-legal resize-none bg-amber-50/40 border-amber-200 focus-visible:ring-1 focus-visible:ring-amber-400 placeholder:text-muted-foreground/40"
                autoFocus
              />
              <div className="flex items-center gap-2">
                <Button
                  onClick={handleSaveEdit}
                  disabled={isSaving || !editedText.trim()}
                  size="sm"
                  className="gap-1.5 h-8"
                >
                  <Save className="h-3.5 w-3.5" />
                  {isSaving ? "Saving…" : "Save"}
                </Button>
                <Button
                  onClick={handleCancelEdit}
                  disabled={isSaving}
                  variant="ghost"
                  size="sm"
                  className="gap-1.5 h-8 text-muted-foreground"
                >
                  <X className="h-3.5 w-3.5" />
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <>
              {/* Original clause text — always shown as-is */}
              {isLegacyFormat ? (
                viewMode === "formatted" && hasFormatted ? (
                  <MarkdownViewer content={clause.clauseTextFormatted || clause.clauseText} />
                ) : (
                  <ClauseTextWithHighlights text={clause.clauseText} excerpts={excerpts} />
                )
              ) : (
                <DeviationFocusedView
                  findings={clause.findings}
                  findingStatuses={findingStatuses}
                  clauseId={clause.id}
                  editingFindingId={editingFindingId}
                  onDecisionApplied={onDecisionApplied}
                  onProjectionUpdate={onProjectionUpdate}
                  onCancelEdit={() => onEditModeChange?.(false)}
                />
              )}

            </>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

// ── Format v2: Deviation-focused view ───────────────────────────────────────

function DeviationFocusedView({
  findings,
  findingStatuses,
  clauseId,
  editingFindingId,
  onDecisionApplied,
  onProjectionUpdate,
  onCancelEdit,
}: {
  findings: Finding[];
  findingStatuses?: Record<string, FindingStatusEntry>;
  clauseId?: string;
  editingFindingId?: string | null;
  onDecisionApplied?: () => void;
  onProjectionUpdate?: (projection: ProjectionResult) => void;
  onCancelEdit?: () => void;
}) {
  const [editText, setEditText] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);

  // Initialise editor text when a finding is opened for editing
  useEffect(() => {
    if (editingFindingId) {
      const finding = findings.find((f) => f.id === editingFindingId);
      if (finding && !editText[editingFindingId]) {
        setEditText((prev) => ({ ...prev, [editingFindingId]: finding.excerpt || "" }));
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingFindingId]);

  const handleSave = async (findingId: string) => {
    if (!clauseId) return;
    const text = editText[findingId]?.trim();
    if (!text) {
      toast.error("Please enter replacement text");
      return;
    }
    setSaving(findingId);
    try {
      const res = await fetch(`/api/clauses/${clauseId}/decisions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          actionType: "EDIT_MANUAL",
          findingId,
          payload: { replacementText: text },
          clauseUpdatedAtWhenLoaded: new Date().toISOString(),
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        toast.error(err.error || "Failed to save edit");
        return;
      }
      const data = await res.json();
      if (data.conflictWarning) {
        toast.warning(data.conflictWarning.message, { duration: 8000 });
      } else {
        toast.success("Edit saved");
      }
      // Apply fresh projection immediately from response — no separate GET needed
      if (data.projection) {
        onProjectionUpdate?.(data.projection);
      }
      onDecisionApplied?.();
      onCancelEdit?.();
    } catch {
      toast.error("Failed to save edit");
    } finally {
      setSaving(null);
    }
  };

  if (findings.length === 0) {
    return (
      <p className="text-sm text-muted-foreground/60 italic">No findings for this clause.</p>
    );
  }

  return (
    <div className="space-y-7">
      {findings.map((finding, idx) => {
        const fStatus = findingStatuses?.[finding.id];
        const isResolved =
          fStatus?.status === "RESOLVED_APPLIED_FALLBACK" ||
          fStatus?.status === "RESOLVED_MANUAL_EDIT";
        const isEditing = editingFindingId === finding.id;
        const appliedText = fStatus?.replacementText ?? null;

        return (
          <div key={finding.id} className="space-y-2.5">
            {/* Finding index + location row */}
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
              <span className="font-mono font-semibold text-muted-foreground/50">
                {String(idx + 1).padStart(2, "0")}
              </span>
              <span className="w-px h-3 bg-border" />
              {finding.locationPage ? (
                <span className="flex items-center gap-1">
                  <MapPin className="h-3 w-3" />
                  Page {finding.locationPage}
                  {finding.locationPosition && ` · ${finding.locationPosition}`}
                </span>
              ) : (
                <span className="italic opacity-50">Location unknown</span>
              )}
            </div>

            {/* Context before */}
            {finding.contextBefore && (
              <p className="text-xs leading-5 text-muted-foreground/70 pl-2 border-l border-border/50 italic">
                …{finding.contextBefore}
              </p>
            )}

            {/* Excerpt block */}
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
              <p
                className={cn(
                  "text-sm leading-6 font-medium",
                  isResolved
                    ? "line-through text-muted-foreground decoration-1"
                    : "text-foreground"
                )}
              >
                {finding.excerpt}
              </p>
            </div>

            {/* Applied language — shown once fallback or manual edit is applied */}
            {isResolved && appliedText && (
              <div className="flex items-start gap-2 pl-1">
                <div className="shrink-0 flex flex-col items-center pt-1 gap-0.5">
                  <span className="w-px h-3 bg-green-300" />
                  <ArrowDown className="h-3 w-3 text-green-500" />
                </div>
                <div className="flex-1 rounded-md px-4 py-3 border-l-4 border-green-500 bg-green-50">
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-green-600 mb-1.5">
                    Applied language
                  </p>
                  <p className="text-sm leading-6 font-medium text-green-900">
                    {appliedText}
                  </p>
                </div>
              </div>
            )}

            {/* Inline editor — shown when this finding is being edited */}
            {isEditing && !isResolved && (
              <div className="space-y-2 pl-1">
                <div className="shrink-0 flex flex-col items-center gap-0.5 w-4">
                  <span className="w-px h-3 bg-amber-300" />
                  <ArrowDown className="h-3 w-3 text-amber-500" />
                </div>
                <div className="border border-amber-300 rounded-md bg-amber-50/40 p-3 space-y-2">
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-amber-600">
                    Replacement text
                  </p>
                  <Textarea
                    value={editText[finding.id] ?? ""}
                    onChange={(e) =>
                      setEditText((prev) => ({ ...prev, [finding.id]: e.target.value }))
                    }
                    placeholder="Enter replacement language…"
                    className="min-h-[100px] text-sm leading-6 resize-none bg-white border-amber-200 focus-visible:ring-1 focus-visible:ring-amber-400 placeholder:text-muted-foreground/40"
                  />
                  <div className="flex gap-1.5">
                    <Button
                      size="sm"
                      className="h-7 text-[11px] gap-1"
                      disabled={saving === finding.id || !editText[finding.id]?.trim()}
                      onClick={() => handleSave(finding.id)}
                    >
                      {saving === finding.id ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Save className="h-3 w-3" />
                      )}
                      Save
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-[11px] gap-1 text-muted-foreground"
                      disabled={saving === finding.id}
                      onClick={onCancelEdit}
                    >
                      <X className="h-3 w-3" />
                      Cancel
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* Context after */}
            {finding.contextAfter && (
              <p className="text-xs leading-5 text-muted-foreground/70 pl-2 border-l border-border/50 italic">
                {finding.contextAfter}…
              </p>
            )}

            {/* Finding metadata */}
            <div className="flex items-start gap-2.5 pt-0.5">
              <span
                className={cn(
                  "shrink-0 mt-0.5 inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border",
                  finding.riskLevel === "RED"
                    ? "bg-risk-red-soft text-risk-red border-risk-red-border"
                    : finding.riskLevel === "YELLOW"
                    ? "bg-risk-yellow-soft text-risk-yellow border-risk-yellow-border"
                    : "bg-risk-green-soft text-risk-green border-risk-green-border"
                )}
              >
                <span
                  className={cn(
                    "w-1.5 h-1.5 rounded-full",
                    finding.riskLevel === "RED" ? "bg-risk-red" :
                    finding.riskLevel === "YELLOW" ? "bg-risk-yellow" : "bg-risk-green"
                  )}
                />
                {riskLabel[finding.riskLevel]}
              </span>
              <div className="flex-1 min-w-0 space-y-0.5">
                <p className="text-xs font-medium text-foreground leading-snug">
                  {finding.summary}
                </p>
                <p className="text-[10px] text-muted-foreground truncate">
                  {finding.matchedRuleTitle}
                </p>
              </div>
            </div>

            {/* Divider between findings */}
            {idx < findings.length - 1 && (
              <div className="pt-1 border-b border-dashed border-border/40" />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── ClauseTextWithHighlights ─────────────────────────────────────────────────

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
              <TooltipContent side="top" className="max-w-xs p-3 space-y-1.5">
                <div className="flex items-center gap-1.5">
                  <span
                    className={cn(
                      "text-xs font-medium px-2.5 py-0.5 rounded-full border",
                      seg.excerpt.risk === "RED"
                        ? "bg-risk-red-soft text-risk-red border-risk-red-border"
                        : seg.excerpt.risk === "YELLOW"
                        ? "bg-risk-yellow-soft text-risk-yellow border-risk-yellow-border"
                        : "bg-risk-green-soft text-risk-green border-risk-green-border"
                    )}
                  >
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
