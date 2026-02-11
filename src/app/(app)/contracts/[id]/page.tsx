"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Loader2,
  Play,
  Lock,
  FileSpreadsheet,
  FileText,
  User,
  Shield,
  Scale,
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  CircleCheck,
  ChevronDown,
  Swords,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

import { ClauseList } from "./_components/clause-list";
import { ClauseText } from "./_components/clause-text";
import { FindingsPanel } from "./_components/findings-panel";
import { PlaybookVersionBadge } from "./_components/playbook-version-badge";
import { ActivityTimeline } from "./_components/activity-timeline";
import { NegotiationStrategy } from "./_components/negotiation-strategy";
import type { ContractWithAnalysis, TriageDecision } from "./_components/types";

export default function ContractDetailPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [contract, setContract] = useState<ContractWithAnalysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [selectedClauseId, setSelectedClauseId] = useState<string | null>(null);
  const [showReanalyzeDialog, setShowReanalyzeDialog] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [timelineRefreshKey, setTimelineRefreshKey] = useState(0);
  const [summaryExpanded, setSummaryExpanded] = useState(false);
  const [strategyExpanded, setStrategyExpanded] = useState(false);
  const autoAnalyzeTriggered = useRef(false);
  const analyzeStartTime = useRef<number | null>(null);

  const loadContract = useCallback(async () => {
    try {
      const res = await fetch(`/api/contracts/${params.id}`);
      if (res.ok) {
        const data = await res.json();
        setContract(data);
        if (data.analysis?.clauses?.length > 0 && !selectedClauseId) {
          setSelectedClauseId(data.analysis.clauses[0].id);
        }
        if (data.status === "analyzing") {
          setAnalyzing(true);
        }
      }
    } finally {
      setLoading(false);
    }
  }, [params.id, selectedClauseId]);

  useEffect(() => {
    loadContract();
  }, [loadContract]);

  // Auto-start analysis when arriving from upload page
  useEffect(() => {
    if (
      !loading &&
      contract &&
      !contract.analysis &&
      (contract.status === "pending" || contract.status === "uploaded") &&
      searchParams.get("autoAnalyze") === "true" &&
      !autoAnalyzeTriggered.current &&
      !analyzing
    ) {
      autoAnalyzeTriggered.current = true;
      router.replace(`/contracts/${contract.id}`, { scroll: false });
      startAnalysis();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, contract, searchParams]);

  // Poll while analysis is in progress
  useEffect(() => {
    if (!analyzing) return;

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/contracts/${params.id}`);
        if (!res.ok) return;
        const data = await res.json();
        if (data.status !== "analyzing") {
          clearInterval(interval);
          setContract(data);
          setAnalyzing(false);
          analyzeStartTime.current = null;
          if (data.analysis?.clauses?.length > 0) {
            setSelectedClauseId(data.analysis.clauses[0].id);
            toast.success("Analysis complete!");
          } else if (data.status === "error") {
            toast.error("Analysis failed. You can try again.");
          }
          setTimelineRefreshKey((k) => k + 1);
        }
      } catch {
        // Ignore polling errors
      }
    }, 3000);

    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analyzing, params.id]);

  async function cancelAnalysis() {
    try {
      await fetch(`/api/contracts/${params.id}/analyze`, {
        method: "DELETE",
      }).catch(() => {});
    } catch {
      // ignore
    }
    analyzeStartTime.current = null;
    setAnalyzing(false);
    await loadContract();
    toast.info("Analysis cancelled. You can try again.");
  }

  async function startAnalysis() {
    setShowReanalyzeDialog(false);
    analyzeStartTime.current = Date.now();

    try {
      const res = await fetch(`/api/contracts/${params.id}/analyze`, {
        method: "POST",
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Analysis failed");
      }

      setAnalyzing(true);
      setContract((prev) => prev ? { ...prev, status: "analyzing" } : prev);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Analysis failed"
      );
      setAnalyzing(false);
      analyzeStartTime.current = null;
    }
  }

  function handleAnalyzeClick() {
    if (contract?.analysis) {
      setShowReanalyzeDialog(true);
    } else {
      startAnalysis();
    }
  }

  async function handleTriageDecision(
    findingId: string,
    decision: TriageDecision,
    note?: string
  ) {
    try {
      const res = await fetch(`/api/contracts/${params.id}/findings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          decisions: [{ findingId, triageDecision: decision, triageNote: note }],
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        toast.error(err.error || "Failed to save triage decision");
        return;
      }

      setTimelineRefreshKey((k) => k + 1);
      setContract((prev) => {
        if (!prev?.analysis) return prev;
        return {
          ...prev,
          analysis: {
            ...prev.analysis,
            clauses: prev.analysis.clauses.map((clause) => ({
              ...clause,
              findings: clause.findings.map((f) =>
                f.id === findingId
                  ? {
                      ...f,
                      triageDecision: decision,
                      triageNote: note || f.triageNote,
                      triagedAt: new Date().toISOString(),
                    }
                  : f
              ),
            })),
          },
        };
      });
    } catch {
      toast.error("Failed to save triage decision");
    }
  }

  async function handleFinalize() {
    setFinalizing(true);
    try {
      const res = await fetch(`/api/contracts/${params.id}/finalize`, {
        method: "POST",
      });

      if (!res.ok) {
        const err = await res.json();
        toast.error(err.error || "Failed to finalize");
        return;
      }

      toast.success("Triage finalized — all decisions are now locked.");
      await loadContract();
      setTimelineRefreshKey((k) => k + 1);
    } catch {
      toast.error("Failed to finalize triage");
    } finally {
      setFinalizing(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!contract) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        Contract not found
      </div>
    );
  }

  const analysis = contract.analysis;
  const selectedClause =
    analysis?.clauses.find((c) => c.id === selectedClauseId) ?? null;

  // Triage progress
  const allFindings = analysis?.clauses.flatMap((c) => c.findings) ?? [];
  const triagedCount = allFindings.filter((f) => f.triageDecision).length;
  const totalFindings = allFindings.length;
  const allTriaged = totalFindings > 0 && triagedCount === totalFindings;
  const isFinalized = analysis?.finalized ?? false;

  // Risk counts for header
  const redCount = analysis?.redCount ?? 0;
  const yellowCount = analysis?.yellowCount ?? 0;
  const greenCount = analysis?.greenCount ?? 0;

  // Negotiation strategy data
  const hasNegotiationItems = (analysis?.negotiationItems?.length ?? 0) > 0;
  const hasLegacyStrategy = !!analysis?.negotiationStrategy;
  const hasStrategy = hasNegotiationItems || hasLegacyStrategy;

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title={contract.title}
        description={`${contract.ourSide} | ${contract.document.filename}${contract.createdByName ? ` · Created by ${contract.createdByName}` : ""}`}
        actions={
          !analyzing && (
            <div className="flex items-center gap-2">
              {analysis && (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      window.open(
                        `/api/contracts/${params.id}/export?format=csv`,
                        "_blank"
                      )
                    }
                    className="gap-1.5"
                  >
                    <FileSpreadsheet className="h-4 w-4" />
                    CSV
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      window.open(
                        `/api/contracts/${params.id}/export?format=pdf`,
                        "_blank"
                      )
                    }
                    className="gap-1.5"
                  >
                    <FileText className="h-4 w-4" />
                    PDF
                  </Button>
                </>
              )}
              <Button onClick={handleAnalyzeClick} className="gap-2">
                <Play className="h-4 w-4" />
                {analysis ? "Re-analyze" : "Run Analysis"}
              </Button>
            </div>
          )
        }
      />

      <div className="flex-1 overflow-y-auto">
        <div className="p-4 space-y-4">
          {/* Analysis in progress */}
          {analyzing && (
            <Card className="border-slate-200 shadow-sm">
              <CardContent className="py-16 text-center">
                <div className="flex justify-center mb-4">
                  <div className="relative">
                    <Scale className="h-12 w-12 text-slate-300" />
                    <Loader2 className="h-6 w-6 animate-spin text-primary absolute -bottom-1 -right-1" />
                  </div>
                </div>
                <p className="text-lg font-semibold text-slate-800">
                  Analyzing Contract…
                </p>
                <p className="text-sm text-slate-500 mt-1">
                  This may take up to a few minutes depending on contract length.
                </p>
                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-4 text-muted-foreground"
                  onClick={cancelAnalysis}
                >
                  Cancel
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Completed analysis */}
          {analysis && !analyzing && (
            <>
              {/* ━━━ Analysis Header Bar ━━━ */}
              <div className="rounded-lg border border-slate-200 bg-white dark:bg-slate-900 dark:border-slate-700 shadow-sm">
                <div className="flex items-center gap-0 flex-wrap divide-x divide-slate-150 dark:divide-slate-700">
                  {/* Section 1: Overall Risk */}
                  <div className="flex items-center gap-2.5 px-4 py-2.5">
                    <Shield className="h-4 w-4 text-slate-400" />
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-slate-400 font-medium">
                        Overall Risk
                      </p>
                      <Badge
                        variant="outline"
                        className={
                          analysis.overallRisk === "high"
                            ? "bg-red-50 text-red-700 border-red-200 mt-0.5"
                            : analysis.overallRisk === "medium"
                            ? "bg-amber-50 text-amber-700 border-amber-200 mt-0.5"
                            : "bg-emerald-50 text-emerald-700 border-emerald-200 mt-0.5"
                        }
                      >
                        {analysis.overallRisk === "high" && (
                          <AlertCircle className="h-3 w-3 mr-1" />
                        )}
                        {analysis.overallRisk === "medium" && (
                          <AlertTriangle className="h-3 w-3 mr-1" />
                        )}
                        {analysis.overallRisk === "low" && (
                          <CheckCircle2 className="h-3 w-3 mr-1" />
                        )}
                        <span className="capitalize font-semibold">
                          {analysis.overallRisk}
                        </span>
                      </Badge>
                    </div>
                  </div>

                  {/* Section 2: Finding Counts */}
                  <div className="flex items-center gap-3 px-4 py-2.5">
                    <div className="text-center">
                      <p className="text-[10px] uppercase tracking-wider text-slate-400 font-medium">
                        Findings
                      </p>
                      <div className="flex items-center gap-2 mt-0.5">
                        {redCount > 0 && (
                          <span className="flex items-center gap-0.5 text-xs font-semibold text-red-600">
                            <AlertCircle className="h-3 w-3" />
                            {redCount}
                          </span>
                        )}
                        {yellowCount > 0 && (
                          <span className="flex items-center gap-0.5 text-xs font-semibold text-amber-600">
                            <AlertTriangle className="h-3 w-3" />
                            {yellowCount}
                          </span>
                        )}
                        {greenCount > 0 && (
                          <span className="flex items-center gap-0.5 text-xs font-semibold text-emerald-600">
                            <CheckCircle2 className="h-3 w-3" />
                            {greenCount}
                          </span>
                        )}
                        <Separator
                          orientation="vertical"
                          className="h-3 mx-0.5"
                        />
                        <span className="text-xs text-slate-500">
                          {analysis.clauses.length} clauses
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Section 3: Playbook */}
                  <div className="flex items-center gap-2 px-4 py-2.5">
                    <PlaybookVersionBadge
                      playbookVersion={analysis.playbookVersion}
                      currentPlaybookVersion={analysis.currentPlaybookVersion}
                    />
                  </div>

                  {/* Section 4: Triage Progress */}
                  <div className="flex items-center gap-2.5 px-4 py-2.5">
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-slate-400 font-medium">
                        Triage
                      </p>
                      {isFinalized ? (
                        <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 gap-1 mt-0.5">
                          <Lock className="h-3 w-3" />
                          Finalized
                          {analysis.finalizedByName
                            ? ` by ${analysis.finalizedByName}`
                            : ""}
                        </Badge>
                      ) : (
                        <div className="flex items-center gap-2 mt-0.5">
                          {allTriaged ? (
                            <span className="flex items-center gap-1 text-xs font-semibold text-emerald-600">
                              <CircleCheck className="h-3.5 w-3.5" />
                              All triaged
                            </span>
                          ) : (
                            <span className="text-xs font-medium text-slate-600">
                              {triagedCount}/{totalFindings} triaged
                            </span>
                          )}
                          {totalFindings > 0 && (
                            <div className="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-emerald-500 rounded-full transition-all"
                                style={{
                                  width: `${(triagedCount / totalFindings) * 100}%`,
                                }}
                              />
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Section 5: Actions */}
                  <div className="flex items-center gap-2 px-4 py-2.5 ml-auto">
                    {analysis.createdByName && (
                      <span className="text-[11px] text-slate-400 flex items-center gap-1">
                        <User className="h-3 w-3" />
                        {analysis.createdByName}
                      </span>
                    )}
                    {!isFinalized && (
                      <Button
                        size="sm"
                        variant="default"
                        disabled={!allTriaged || finalizing}
                        onClick={handleFinalize}
                        className="gap-1.5 h-7 text-xs"
                      >
                        {finalizing && (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        )}
                        <Lock className="h-3 w-3" />
                        Finalize
                      </Button>
                    )}

                    <ActivityTimeline
                      contractId={contract.id}
                      refreshKey={timelineRefreshKey}
                    />
                  </div>
                </div>
              </div>

              {/* ━━━ Executive Summary ━━━ */}
              {analysis.executiveSummary && (
                <Collapsible open={summaryExpanded} onOpenChange={setSummaryExpanded}>
                  <div className="rounded-lg border border-slate-200 bg-white dark:bg-slate-900 dark:border-slate-700 shadow-sm overflow-hidden">
                    <CollapsibleTrigger className="w-full">
                      <div className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <div
                            className={cn(
                              "h-8 w-8 rounded-md flex items-center justify-center shrink-0",
                              analysis.overallRisk === "high"
                                ? "bg-red-100 text-red-600"
                                : analysis.overallRisk === "medium"
                                ? "bg-amber-100 text-amber-600"
                                : "bg-emerald-100 text-emerald-600"
                            )}
                          >
                            <Shield className="h-4 w-4" />
                          </div>
                          <div className="flex-1 min-w-0 text-left">
                            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                              Executive Summary
                            </p>
                            {!summaryExpanded && (
                              <p className="text-sm text-slate-600 dark:text-slate-300 line-clamp-1 font-legal mt-0.5">
                                {analysis.executiveSummary}
                              </p>
                            )}
                          </div>
                        </div>
                        <ChevronDown
                          className={cn(
                            "h-4 w-4 text-slate-400 shrink-0 transition-transform",
                            summaryExpanded && "rotate-180"
                          )}
                        />
                      </div>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <div className="px-4 pb-4 pt-0">
                        <div className="border-t border-slate-100 dark:border-slate-700 pt-3">
                          <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed font-legal whitespace-pre-wrap">
                            {analysis.executiveSummary}
                          </p>
                        </div>
                      </div>
                    </CollapsibleContent>
                  </div>
                </Collapsible>
              )}

              {/* ━━━ Negotiation Strategy (standalone collapsible) ━━━ */}
              {hasStrategy && (
                <Collapsible open={strategyExpanded} onOpenChange={setStrategyExpanded}>
                  <div className="rounded-lg border border-slate-200 bg-white dark:bg-slate-900 dark:border-slate-700 shadow-sm overflow-hidden">
                    <CollapsibleTrigger className="w-full">
                      <div className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <div className="h-8 w-8 rounded-md flex items-center justify-center shrink-0 bg-indigo-100 text-indigo-600">
                            <Swords className="h-4 w-4" />
                          </div>
                          <div className="flex-1 min-w-0 text-left">
                            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                              Negotiation Strategy
                            </p>
                            {!strategyExpanded && hasNegotiationItems && (
                              <div className="flex items-center gap-1.5 mt-0.5">
                                {analysis.negotiationItems.filter((i) => i.priority === "P1").length > 0 && (
                                  <Badge variant="outline" className="px-1.5 py-0 text-[10px] bg-red-50 text-red-700 border-red-200">
                                    {analysis.negotiationItems.filter((i) => i.priority === "P1").length} Critical
                                  </Badge>
                                )}
                                {analysis.negotiationItems.filter((i) => i.priority === "P2").length > 0 && (
                                  <Badge variant="outline" className="px-1.5 py-0 text-[10px] bg-amber-50 text-amber-700 border-amber-200">
                                    {analysis.negotiationItems.filter((i) => i.priority === "P2").length} Important
                                  </Badge>
                                )}
                                {analysis.negotiationItems.filter((i) => i.priority === "P3").length > 0 && (
                                  <Badge variant="outline" className="px-1.5 py-0 text-[10px] bg-sky-50 text-sky-700 border-sky-200">
                                    {analysis.negotiationItems.filter((i) => i.priority === "P3").length} Nice-to-have
                                  </Badge>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                        {hasNegotiationItems && (
                          <Badge variant="outline" className="text-[11px] text-slate-500 shrink-0">
                            {analysis.negotiationItems.length} items
                          </Badge>
                        )}
                        <ChevronDown
                          className={cn(
                            "h-4 w-4 text-slate-400 shrink-0 transition-transform",
                            strategyExpanded && "rotate-180"
                          )}
                        />
                      </div>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <div className="px-4 pb-4 pt-0">
                        <div className="border-t border-slate-100 dark:border-slate-700 pt-3">
                          <NegotiationStrategy
                            negotiationItems={analysis.negotiationItems ?? []}
                            legacyMarkdown={analysis.negotiationStrategy}
                          />
                        </div>
                      </div>
                    </CollapsibleContent>
                  </div>
                </Collapsible>
              )}

              {/* ━━━ Three-panel layout — equal width, responsive ━━━ */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 lg:h-[calc(100vh-320px)] lg:min-h-[500px]">
                {/* Left panel: Clause list */}
                <Card className="overflow-hidden border-slate-200 shadow-sm">
                  <CardHeader className="py-2 px-3 border-b border-slate-200">
                    <CardTitle className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                      Clauses
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-0 h-[300px] lg:h-[calc(100%-2.5rem)]">
                    <ClauseList
                      clauses={analysis.clauses}
                      selectedClauseId={selectedClauseId}
                      finalized={isFinalized}
                      onSelectClause={setSelectedClauseId}
                    />
                  </CardContent>
                </Card>

                {/* Center panel: Clause text */}
                <Card className="overflow-hidden border-slate-200 shadow-sm">
                  <CardHeader className="py-2 px-3 border-b border-slate-200">
                    <CardTitle className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                      Clause Text
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-0 h-[400px] lg:h-[calc(100%-2.5rem)]">
                    <ClauseText clause={selectedClause} />
                  </CardContent>
                </Card>

                {/* Right panel: Findings only */}
                <Card className="overflow-hidden border-slate-200 shadow-sm flex flex-col">
                  <CardHeader className="py-2 px-3 border-b border-slate-200">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                        Findings
                        {selectedClause && selectedClause.findings.length > 0 && (
                          <Badge variant="outline" className="ml-1.5 px-1.5 py-0 text-[10px]">
                            {selectedClause.findings.length}
                          </Badge>
                        )}
                      </CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent className="p-0 flex-1 h-[400px] lg:h-auto overflow-hidden">
                    <FindingsPanel
                      clause={selectedClause}
                      finalized={isFinalized}
                      contractId={contract.id}
                      onTriageDecision={handleTriageDecision}
                      onCommentAdded={(findingId, comment) => {
                        setContract((prev) => {
                          if (!prev?.analysis) return prev;
                          return {
                            ...prev,
                            analysis: {
                              ...prev.analysis,
                              clauses: prev.analysis.clauses.map((clause) => ({
                                ...clause,
                                findings: clause.findings.map((f) =>
                                  f.id === findingId
                                    ? { ...f, comments: [...f.comments, comment] }
                                    : f
                                ),
                              })),
                            },
                          };
                        });
                        setTimelineRefreshKey((k) => k + 1);
                      }}
                    />
                  </CardContent>
                </Card>
              </div>
            </>
          )}

          {/* No analysis yet */}
          {!analysis &&
            !analyzing &&
            (contract.status === "pending" || contract.status === "uploaded" || contract.status === "error" || contract.status === "analyzing") && (
              <Card className="border-slate-200 shadow-sm">
                <CardContent className="py-12 text-center">
                  {contract.status === "error" ? (
                    <>
                      <p className="text-destructive font-medium">
                        The previous analysis failed.
                      </p>
                      <p className="text-sm text-muted-foreground mt-1">
                        Click &quot;Run Analysis&quot; to try again.
                      </p>
                    </>
                  ) : (
                    <div>
                      <Scale className="h-10 w-10 text-slate-300 mx-auto mb-3" />
                      <p className="text-slate-500">
                        Click &quot;Run Analysis&quot; to start the AI-powered
                        contract review.
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
        </div>
      </div>

      {/* Re-analysis confirmation dialog */}
      <Dialog open={showReanalyzeDialog} onOpenChange={setShowReanalyzeDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Re-analyze Contract?</DialogTitle>
            <DialogDescription>
              This will delete the current analysis, including all clauses,
              findings, and triage decisions. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowReanalyzeDialog(false)}
            >
              Cancel
            </Button>
            <Button variant="destructive" onClick={startAnalysis}>
              Re-analyze
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
