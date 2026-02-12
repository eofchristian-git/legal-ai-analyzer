"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
  FileSpreadsheet,
  FileText,
  Scale,
} from "lucide-react";
import { toast } from "sonner";

import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable";
import { ClauseList } from "./_components/clause-list";
import { ClauseText } from "./_components/clause-text";
import { FindingsPanel } from "./_components/findings-panel";
import { RiskHeatmap } from "./_components/risk-heatmap";
import { ActivityTimeline } from "./_components/activity-timeline";
import type { ContractWithAnalysis, TriageDecision } from "./_components/types";

export default function ContractDetailPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { data: session } = useSession();
  const [contract, setContract] = useState<ContractWithAnalysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [selectedClauseId, setSelectedClauseId] = useState<string | null>(null);
  const [showReanalyzeDialog, setShowReanalyzeDialog] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [timelineRefreshKey, setTimelineRefreshKey] = useState(0);
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
                      triagedByName: session?.user?.name ?? f.triagedByName,
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
        <div className="p-0 space-y-0">
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
              {/* Risk Heatmap + Activity Timeline */}
              <div className="bg-card px-5 py-2.5 flex items-center gap-5 rounded-lg border shadow-sm">
                <RiskHeatmap
                  overallRisk={analysis.overallRisk}
                  redCount={redCount}
                  yellowCount={yellowCount}
                  greenCount={greenCount}
                  clauseCount={analysis.clauses.length}
                  triagedCount={triagedCount}
                  totalFindings={totalFindings}
                  playbookVersion={analysis.playbookVersion}
                  isFinalized={isFinalized}
                  finalizing={finalizing}
                  onFinalize={handleFinalize}
                />
                <ActivityTimeline
                  contractId={contract.id}
                  refreshKey={timelineRefreshKey}
                />
              </div>

              {/* Three-panel resizable layout */}
              <ResizablePanelGroup
                orientation="horizontal"
                className="rounded-lg border shadow-sm"
                style={{ height: "calc(100vh - 160px)" }}
              >
                {/* Left panel: Clause list */}
                <ResizablePanel defaultSize="20%" minSize="15%" maxSize="35%">
                  <div className="h-full overflow-hidden flex flex-col">
                    <ClauseList
                      clauses={analysis.clauses}
                      selectedClauseId={selectedClauseId}
                      finalized={isFinalized}
                      onSelectClause={setSelectedClauseId}
                    />
                  </div>
                </ResizablePanel>

                <ResizableHandle withHandle />

                {/* Center panel: Clause text */}
                <ResizablePanel defaultSize="45%" minSize="25%">
                  <div className="h-full overflow-hidden flex flex-col">
                    <ClauseText clause={selectedClause} />
                  </div>
                </ResizablePanel>

                <ResizableHandle withHandle />

                {/* Right panel: Findings */}
                <ResizablePanel defaultSize="35%" minSize="20%">
                  <div className="h-full overflow-hidden flex flex-col">
                    <FindingsPanel
                      clause={selectedClause}
                      finalized={isFinalized}
                      contractId={contract.id}
                      executiveSummary={analysis.executiveSummary}
                      negotiationItems={analysis.negotiationItems}
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
                  </div>
                </ResizablePanel>
              </ResizablePanelGroup>
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
