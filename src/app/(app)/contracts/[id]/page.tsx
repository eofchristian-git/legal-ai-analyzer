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
import { EscalateModal } from "./_components/escalate-modal";
import { NoteInput } from "./_components/note-input";
import type { ContractWithAnalysis, TriageDecision } from "./_components/types";
import type { ProjectionResult } from "@/types/decisions";

export default function ContractDetailPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { data: session } = useSession();
  const [contract, setContract] = useState<ContractWithAnalysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [selectedClauseId, setSelectedClauseId] = useState<string | null>(null);
  const [finalizing, setFinalizing] = useState(false);
  const [timelineRefreshKey, setTimelineRefreshKey] = useState(0);
  const [redirecting, setRedirecting] = useState(false);
  // T031, T045: Feature 006 - Clause decision state
  const [projection, setProjection] = useState<ProjectionResult | null>(null);
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0);
  // T048: Feature 006 - Edit mode state
  const [isEditMode, setIsEditMode] = useState(false);
  // Feature 007: Finding-level modal state
  const [escalateModalOpen, setEscalateModalOpen] = useState(false);
  const [noteInputOpen, setNoteInputOpen] = useState(false);
  const [activeModalFindingId, setActiveModalFindingId] = useState<string | null>(null);
  const [editingFindingId, setEditingFindingId] = useState<string | null>(null);
  // Feature 007 T011: Clause projection map for resolution progress
  const [clauseProjections, setClauseProjections] = useState<Record<string, { 
    resolvedCount: number; 
    totalFindingCount: number; 
    effectiveStatus: 'PENDING' | 'PARTIALLY_RESOLVED' | 'RESOLVED' | 'ESCALATED' | 'NO_ISSUES';
  }>>({});
  const autoAnalyzeTriggered = useRef(false);
  const analyzeStartTime = useRef<number | null>(null);
  const isRedirecting = useRef(false);

  const loadContract = useCallback(async () => {
    try {
      const res = await fetch(`/api/contracts/${params.id}`);
      if (res.ok) {
        const data = await res.json();
        
        // Check if we should redirect to wizard before setting any state
        if (
          data.status === "analyzing" &&
          searchParams.get("autoAnalyze") !== "true" &&
          searchParams.get("completed") !== "true"
        ) {
          // Set redirecting flags and redirect immediately
          isRedirecting.current = true;
          setRedirecting(true);
          router.replace(`/contracts/upload?contractId=${data.id}&step=2`);
          return; // Don't set any other state, just return
        }
        
        setContract(data);
        if (data.analysis?.clauses?.length > 0 && !selectedClauseId) {
          setSelectedClauseId(data.analysis.clauses[0].id);
        }
        if (data.status === "analyzing") {
          setAnalyzing(true);
        }
      }
    } finally {
      if (!isRedirecting.current) {
        setLoading(false);
      }
    }
  }, [params.id, selectedClauseId, searchParams, router]);

  useEffect(() => {
    loadContract();
  }, [loadContract]);

  // Clean up URL params and handle legacy autoAnalyze
  useEffect(() => {
    if (!loading && contract) {
      // Remove completed param if present
      if (searchParams.get("completed") === "true") {
        router.replace(`/contracts/${contract.id}`, { scroll: false });
      }
      
      // Legacy: Auto-start analysis when arriving from old upload flows
      // This is kept for backward compatibility
      if (
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

  // T011: Fetch projections for all clauses when contract is loaded
  useEffect(() => {
    const fetchAllProjections = async () => {
      if (!contract?.analysis?.clauses) return;

      const clauses = contract.analysis.clauses;
      const projections: Record<string, { 
        resolvedCount: number; 
        totalFindingCount: number; 
        effectiveStatus: 'PENDING' | 'PARTIALLY_RESOLVED' | 'RESOLVED' | 'ESCALATED' | 'NO_ISSUES';
      }> = {};

      // Fetch projections for all clauses in parallel
      const results = await Promise.allSettled(
        clauses.map(async (clause) => {
          const response = await fetch(`/api/clauses/${clause.id}/projection`);
          if (response.ok) {
            const data = await response.json();
            return { clauseId: clause.id, projection: data.projection };
          }
          return null;
        })
      );

      // Process results
      results.forEach((result) => {
        if (result.status === 'fulfilled' && result.value?.projection) {
          const { clauseId, projection } = result.value;
          projections[clauseId] = {
            resolvedCount: projection.resolvedCount || 0,
            totalFindingCount: projection.totalFindingCount || 0,
            effectiveStatus: projection.effectiveStatus || 'PENDING'
          };
        }
      });

      setClauseProjections(projections);
    };

    fetchAllProjections();
  }, [contract?.analysis?.clauses, historyRefreshKey]);

  // T031: Fetch projection when clause is selected (Feature 006)
  useEffect(() => {
    const fetchProjection = async () => {
      if (!selectedClauseId) {
        setProjection(null);
        return;
      }

      try {
        console.log('[DEBUG] Fetching projection for clause:', selectedClauseId, 'historyRefreshKey:', historyRefreshKey);
        const response = await fetch(`/api/clauses/${selectedClauseId}/projection`);
        if (response.ok) {
          const data = await response.json();
          console.log('[DEBUG] Projection fetched:', {
            clauseId: selectedClauseId,
            effectiveText: data.projection?.effectiveText?.substring(0, 100) + '...',
            effectiveStatus: data.projection?.effectiveStatus,
            decisionCount: data.projection?.decisionCount,
            cached: data.cached
          });
          setProjection(data.projection);
          
          // T011: Update clause projections map for resolution progress
          if (data.projection) {
            setClauseProjections(prev => ({
              ...prev,
              [selectedClauseId]: {
                resolvedCount: data.projection.resolvedCount || 0,
                totalFindingCount: data.projection.totalFindingCount || 0,
                effectiveStatus: data.projection.effectiveStatus || 'PENDING'
              }
            }));
          }
        } else {
          console.error('Failed to fetch projection');
          setProjection(null);
        }
      } catch (error) {
        console.error('Error fetching projection:', error);
        setProjection(null);
      }
    };

    fetchProjection();
  }, [selectedClauseId, historyRefreshKey]);

  // Reset edit mode when switching clauses
  useEffect(() => {
    setIsEditMode(false);
  }, [selectedClauseId]);

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
      // Navigate to wizard at analyze step for re-analysis
      router.push(`/contracts/upload?contractId=${params.id}&step=2`);
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

      toast.success("Analysis finalized — all decisions are now locked.");
      await loadContract();
      setTimelineRefreshKey((k) => k + 1);
    } catch {
      toast.error("Failed to finalize triage");
    } finally {
      setFinalizing(false);
    }
  }

  if (loading || redirecting) {
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

  // Resolution progress (Feature 007: Per-finding decisions)
  const allFindings = analysis?.clauses.flatMap((c) => c.findings) ?? [];
  const totalFindings = allFindings.length;
  
  // Calculate total resolved findings from clause projections
  const resolvedCount = Object.values(clauseProjections).reduce(
    (sum, projection) => sum + projection.resolvedCount,
    0
  );
  
  const allResolved = totalFindings > 0 && resolvedCount === totalFindings;
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
                  clauseCount={analysis.totalClauses || analysis.clauses.length}
                  resolvedCount={resolvedCount}
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
                      clauseProjections={clauseProjections}
                    />
                  </div>
                </ResizablePanel>

                <ResizableHandle withHandle />

                {/* Center panel: Clause text */}
                <ResizablePanel defaultSize="45%" minSize="25%">
                  <div className="h-full overflow-hidden flex flex-col">
                    <ClauseText 
                      clause={selectedClause}
                      effectiveStatus={projection?.effectiveStatus}
                      trackedChanges={projection?.trackedChanges}
                      isEditMode={isEditMode}
                      effectiveText={projection?.effectiveText}
                      onEditModeChange={setIsEditMode}
                      onDecisionApplied={() => {
                        loadContract();
                        setHistoryRefreshKey((k) => k + 1);
                        setTimelineRefreshKey((k) => k + 1);
                      }}
                      escalatedToUserName={projection?.escalatedToUserName}
                      hasUnresolvedEscalation={projection?.hasUnresolvedEscalation}
                      editingFindingId={editingFindingId}
                    />
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
                      projection={projection}
                      onDecisionApplied={() => {
                        loadContract();
                        setHistoryRefreshKey((k) => k + 1);
                        setTimelineRefreshKey((k) => k + 1);
                      }}
                      historyRefreshKey={historyRefreshKey}
                      onEditManualClick={(findingId) => {
                        setEditingFindingId(findingId ?? null);
                        setIsEditMode(true);
                      }}
                      onEscalateClick={(findingId) => {
                        setActiveModalFindingId(findingId);
                        setEscalateModalOpen(true);
                      }}
                      onNoteClick={(findingId) => {
                        setActiveModalFindingId(findingId);
                        setNoteInputOpen(true);
                      }}
                      currentUserId={session?.user?.id}
                      currentUserRole={session?.user?.role}
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

      {/* Feature 007: Escalate Modal (finding-level) */}
      {selectedClause && (
        <EscalateModal
          open={escalateModalOpen}
          onOpenChange={setEscalateModalOpen}
          clauseId={selectedClause.id}
          clauseName={selectedClause.clauseName}
          findingId={activeModalFindingId ?? undefined}
          onEscalated={() => {
            loadContract();
            setHistoryRefreshKey((k) => k + 1);
            setTimelineRefreshKey((k) => k + 1);
            setActiveModalFindingId(null);
          }}
        />
      )}

      {/* Feature 007: Note Input (finding-level) */}
      {selectedClause && (
        <NoteInput
          open={noteInputOpen}
          onOpenChange={setNoteInputOpen}
          clauseId={selectedClause.id}
          clauseName={selectedClause.clauseName}
          findingId={activeModalFindingId ?? undefined}
          onNoteSaved={() => {
            loadContract();
            setHistoryRefreshKey((k) => k + 1);
            setTimelineRefreshKey((k) => k + 1);
            setActiveModalFindingId(null);
          }}
        />
      )}
    </div>
  );
}
