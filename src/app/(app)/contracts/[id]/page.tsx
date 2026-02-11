"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SeverityBadge } from "@/components/shared/severity-badge";
import { DisclaimerBanner } from "@/components/shared/disclaimer-banner";
import { MarkdownViewer } from "@/components/shared/markdown-viewer";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Loader2, Play, Lock, FileSpreadsheet, FileText, User } from "lucide-react";
import { toast } from "sonner";

import { ClauseList } from "./_components/clause-list";
import { ClauseText } from "./_components/clause-text";
import { FindingsPanel } from "./_components/findings-panel";
import { PlaybookVersionBadge } from "./_components/playbook-version-badge";
import { ActivityTimeline } from "./_components/activity-timeline";
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
  const autoAnalyzeTriggered = useRef(false);

  const loadContract = useCallback(async () => {
    try {
      const res = await fetch(`/api/contracts/${params.id}`);
      if (res.ok) {
        const data = await res.json();
        setContract(data);
        // Auto-select first clause if analysis exists and none selected
        if (data.analysis?.clauses?.length > 0 && !selectedClauseId) {
          setSelectedClauseId(data.analysis.clauses[0].id);
        }
        // If the contract is mid-analysis (e.g. user navigated away and back), restore the analyzing state
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
      contract.status === "pending" &&
      searchParams.get("autoAnalyze") === "true" &&
      !autoAnalyzeTriggered.current &&
      !analyzing
    ) {
      autoAnalyzeTriggered.current = true;
      // Clean the URL so a refresh doesn't re-trigger
      router.replace(`/contracts/${contract.id}`, { scroll: false });
      startAnalysis();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, contract, searchParams]);

  // Poll while contract is mid-analysis (e.g. user navigated away and returned)
  useEffect(() => {
    if (!analyzing || !contract) return;
    // Only poll if we didn't start the analysis ourselves (i.e. status was already "analyzing" on load)
    // We detect this by checking if the contract status was "analyzing" when we loaded it
    if (contract.status !== "analyzing") return;

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/contracts/${params.id}`);
        if (!res.ok) return;
        const data = await res.json();
        if (data.status !== "analyzing") {
          // Analysis finished (either completed or errored)
          clearInterval(interval);
          setContract(data);
          setAnalyzing(false);
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
    }, 5000);

    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analyzing, contract?.status, params.id]);

  async function startAnalysis() {
    setAnalyzing(true);
    setShowReanalyzeDialog(false);

    try {
      const res = await fetch(`/api/contracts/${params.id}/analyze`, {
        method: "POST",
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Analysis failed");
      }

      if (data.warning) {
        toast.warning(data.warning);
      }

      toast.success(
        `Analysis complete — ${data.clauseCount} clauses, ${data.findingCount} findings`
      );

      // Reset clause selection and reload contract data
      setSelectedClauseId(null);
      await loadContract();
      setTimelineRefreshKey((k) => k + 1);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Analysis failed"
      );
    } finally {
      setAnalyzing(false);
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
      // Update local state optimistically
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

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title={contract.title}
        description={`${contract.ourSide} | ${contract.document.filename}${contract.createdByName ? ` · Created by ${contract.createdByName}` : ""}`}
        actions={
          !analyzing && (
            <div className="flex items-center gap-2">
              {/* Export buttons */}
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

      <div className="flex-1 overflow-hidden">
        <div className="p-4 space-y-4 h-full flex flex-col">
          <DisclaimerBanner />

          {/* Analysis in progress — simple loading state */}
          {analyzing && (
            <Card>
              <CardContent className="py-16 text-center">
                <Loader2 className="h-10 w-10 animate-spin text-primary mx-auto mb-4" />
                <p className="text-lg font-medium">Analyzing Contract…</p>
                <p className="text-sm text-muted-foreground mt-1">
                  This may take up to a minute depending on contract length.
                </p>
              </CardContent>
            </Card>
          )}

          {/* Completed analysis: three-panel layout */}
          {analysis && !analyzing && (
            <>
              {/* Analysis header bar */}
              <div className="flex items-center justify-between gap-4 flex-wrap">
                {/* Summary stats */}
                <div className="flex items-center gap-3">
                  <Badge variant="outline" className="gap-1">
                    Overall:{" "}
                    <span className="font-semibold capitalize">
                      {analysis.overallRisk}
                    </span>
                  </Badge>
                  <div className="flex items-center gap-1.5">
                    {analysis.redCount > 0 && (
                      <SeverityBadge severity="RED" size="sm" />
                    )}
                    {analysis.yellowCount > 0 && (
                      <SeverityBadge severity="YELLOW" size="sm" />
                    )}
                    {analysis.greenCount > 0 && (
                      <SeverityBadge severity="GREEN" size="sm" />
                    )}
                    <span className="text-xs text-muted-foreground ml-1">
                      {analysis.clauses.length} clauses · {totalFindings}{" "}
                      findings
                    </span>
                  </div>

                  {/* Playbook Version Badge */}
                  <PlaybookVersionBadge
                    playbookVersion={analysis.playbookVersion}
                    currentPlaybookVersion={analysis.currentPlaybookVersion}
                  />
                </div>

                {/* Analyzed by / Finalized by + triage progress + activity */}
                <div className="flex items-center gap-3">
                  {analysis.createdByName && (
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <User className="h-3 w-3" />
                      Analyzed by {analysis.createdByName}
                    </span>
                  )}

                  {isFinalized ? (
                    <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 gap-1">
                      <Lock className="h-3 w-3" />
                      Finalized{analysis.finalizedByName ? ` by ${analysis.finalizedByName}` : ""}
                    </Badge>
                  ) : (
                    <>
                      <span className="text-sm text-muted-foreground">
                        {triagedCount}/{totalFindings} findings triaged
                      </span>
                      <Button
                        size="sm"
                        variant="default"
                        disabled={!allTriaged || finalizing}
                        onClick={handleFinalize}
                        className="gap-1.5"
                      >
                        {finalizing && (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        )}
                        <Lock className="h-3 w-3" />
                        Finalize Triage
                      </Button>
                    </>
                  )}

                  {/* Activity Log drawer trigger */}
                  <ActivityTimeline
                    contractId={contract.id}
                    refreshKey={timelineRefreshKey}
                  />
                </div>
              </div>

              {/* Executive Summary */}
              {analysis.executiveSummary && (
                <Card>
                  <CardHeader className="py-3">
                    <CardTitle className="text-sm">Executive Summary</CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0 pb-3">
                    <p className="text-sm text-muted-foreground">
                      {analysis.executiveSummary}
                    </p>
                  </CardContent>
                </Card>
              )}

              {/* Three-panel layout */}
              <div className="flex-1 grid grid-cols-1 md:grid-cols-[minmax(200px,1fr)_minmax(300px,1.6fr)_minmax(280px,1.4fr)] gap-3 min-h-0 md:min-h-[500px]">
                {/* Left panel: Clause list */}
                <Card className="overflow-hidden">
                  <CardHeader className="py-2 px-3 border-b">
                    <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      Clauses
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-0 h-[calc(100%-2.5rem)]">
                    <ClauseList
                      clauses={analysis.clauses}
                      selectedClauseId={selectedClauseId}
                      onSelectClause={setSelectedClauseId}
                    />
                  </CardContent>
                </Card>

                {/* Center panel: Clause text */}
                <Card className="overflow-hidden">
                  <CardHeader className="py-2 px-3 border-b">
                    <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      Clause Text
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-0 h-[calc(100%-2.5rem)]">
                    <ClauseText clause={selectedClause} />
                  </CardContent>
                </Card>

                {/* Right panel: Findings + triage */}
                <Card className="overflow-hidden">
                  <CardHeader className="py-2 px-3 border-b">
                    <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      Findings & Triage
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-0 h-[calc(100%-2.5rem)]">
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

              {/* Negotiation Strategy */}
              {analysis.negotiationStrategy && (
                <Card>
                  <CardHeader className="py-3">
                    <CardTitle className="text-sm">
                      Negotiation Strategy
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0 pb-3">
                    <MarkdownViewer
                      content={analysis.negotiationStrategy}
                    />
                  </CardContent>
                </Card>
              )}

            </>
          )}

          {/* No analysis yet */}
          {!analysis && !analyzing && (contract.status === "pending" || contract.status === "error") && (
            <Card>
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
                  <p className="text-muted-foreground">
                    Click &quot;Run Analysis&quot; to start the AI-powered
                    contract review.
                  </p>
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
