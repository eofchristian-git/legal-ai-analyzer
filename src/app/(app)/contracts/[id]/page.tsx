"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SeverityBadge } from "@/components/shared/severity-badge";
import { DisclaimerBanner } from "@/components/shared/disclaimer-banner";
import { MarkdownViewer } from "@/components/shared/markdown-viewer";
import { Loader2, Play } from "lucide-react";
import { toast } from "sonner";

interface Contract {
  id: string;
  title: string;
  ourSide: string;
  contractType: string | null;
  counterparty: string | null;
  status: string;
  document: { filename: string; extractedText: string };
  analysis: {
    overallRisk: string;
    greenCount: number;
    yellowCount: number;
    redCount: number;
    rawAnalysis: string;
    clauseAnalyses: string;
    negotiationStrategy: string | null;
    executiveSummary: string | null;
  } | null;
}

interface ClauseAnalysis {
  clauseName: string;
  severity: "GREEN" | "YELLOW" | "RED";
  content: string;
}

export default function ContractDetailPage() {
  const params = useParams();
  const [contract, setContract] = useState<Contract | null>(null);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [streamedContent, setStreamedContent] = useState("");
  const [filter, setFilter] = useState("all");

  const loadContract = useCallback(async () => {
    try {
      const res = await fetch(`/api/contracts/${params.id}`);
      if (res.ok) {
        setContract(await res.json());
      }
    } finally {
      setLoading(false);
    }
  }, [params.id]);

  useEffect(() => {
    loadContract();
  }, [loadContract]);

  async function startAnalysis() {
    setAnalyzing(true);
    setStreamedContent("");

    try {
      const res = await fetch(`/api/contracts/${params.id}/analyze`, {
        method: "POST",
      });

      if (!res.ok) {
        throw new Error("Failed to start analysis");
      }

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) throw new Error("No response body");

      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.type === "chunk" && data.content) {
                setStreamedContent((prev) => prev + data.content);
              }
              if (data.type === "done") {
                await loadContract();
              }
              if (data.type === "error") {
                toast.error("Analysis error: " + data.message);
              }
            } catch {
              // Skip malformed JSON
            }
          }
        }
      }
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Analysis failed"
      );
    } finally {
      setAnalyzing(false);
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

  const clauses: ClauseAnalysis[] = contract.analysis?.clauseAnalyses
    ? JSON.parse(contract.analysis.clauseAnalyses)
    : [];

  const filteredClauses =
    filter === "all"
      ? clauses
      : clauses.filter((c) => c.severity === filter);

  const hasAnalysis = contract.analysis || streamedContent;

  return (
    <div>
      <PageHeader
        title={contract.title}
        description={`${contract.ourSide} | ${contract.document.filename}`}
        actions={
          !contract.analysis &&
          !analyzing && (
            <Button onClick={startAnalysis} className="gap-2">
              <Play className="h-4 w-4" /> Run Analysis
            </Button>
          )
        }
      />
      <div className="space-y-6 p-8">
        <DisclaimerBanner />

        {/* Analysis in progress */}
        {analyzing && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Loader2 className="h-4 w-4 animate-spin" />
                Analysis in Progress
              </CardTitle>
            </CardHeader>
            <CardContent>
              <MarkdownViewer content={streamedContent} />
            </CardContent>
          </Card>
        )}

        {/* Completed analysis */}
        {contract.analysis && (
          <>
            {/* Summary cards */}
            <div className="grid grid-cols-4 gap-4">
              <Card>
                <CardContent className="pt-6">
                  <div className="text-2xl font-bold">
                    {contract.analysis.greenCount +
                      contract.analysis.yellowCount +
                      contract.analysis.redCount}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Clauses Analyzed
                  </p>
                </CardContent>
              </Card>
              <Card className="border-emerald-200 bg-emerald-50">
                <CardContent className="pt-6">
                  <div className="text-2xl font-bold text-emerald-700">
                    {contract.analysis.greenCount}
                  </div>
                  <p className="text-sm text-emerald-600">Acceptable</p>
                </CardContent>
              </Card>
              <Card className="border-amber-200 bg-amber-50">
                <CardContent className="pt-6">
                  <div className="text-2xl font-bold text-amber-700">
                    {contract.analysis.yellowCount}
                  </div>
                  <p className="text-sm text-amber-600">Negotiate</p>
                </CardContent>
              </Card>
              <Card className="border-red-200 bg-red-50">
                <CardContent className="pt-6">
                  <div className="text-2xl font-bold text-red-700">
                    {contract.analysis.redCount}
                  </div>
                  <p className="text-sm text-red-600">Escalate</p>
                </CardContent>
              </Card>
            </div>

            {/* Executive Summary */}
            {contract.analysis.executiveSummary && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">
                    Executive Summary
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <MarkdownViewer
                    content={contract.analysis.executiveSummary}
                  />
                </CardContent>
              </Card>
            )}

            {/* Clause Analysis */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">
                    Clause-by-Clause Analysis
                  </CardTitle>
                  <Tabs value={filter} onValueChange={setFilter}>
                    <TabsList>
                      <TabsTrigger value="all">
                        All ({clauses.length})
                      </TabsTrigger>
                      <TabsTrigger value="RED">
                        Red (
                        {clauses.filter((c) => c.severity === "RED").length})
                      </TabsTrigger>
                      <TabsTrigger value="YELLOW">
                        Yellow (
                        {
                          clauses.filter((c) => c.severity === "YELLOW")
                            .length
                        }
                        )
                      </TabsTrigger>
                      <TabsTrigger value="GREEN">
                        Green (
                        {
                          clauses.filter((c) => c.severity === "GREEN")
                            .length
                        }
                        )
                      </TabsTrigger>
                    </TabsList>
                  </Tabs>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {filteredClauses.map((clause, i) => (
                  <div key={i} className="rounded-lg border p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <h4 className="font-medium">{clause.clauseName}</h4>
                      <SeverityBadge severity={clause.severity} />
                    </div>
                    <MarkdownViewer content={clause.content} />
                  </div>
                ))}
                {filteredClauses.length === 0 && (
                  <p className="text-center text-sm text-muted-foreground py-4">
                    No clauses match the selected filter
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Negotiation Strategy */}
            {contract.analysis.negotiationStrategy && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">
                    Negotiation Strategy
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <MarkdownViewer
                    content={contract.analysis.negotiationStrategy}
                  />
                </CardContent>
              </Card>
            )}

            {/* Full Analysis */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Full Analysis</CardTitle>
              </CardHeader>
              <CardContent>
                <MarkdownViewer
                  content={contract.analysis.rawAnalysis}
                />
              </CardContent>
            </Card>
          </>
        )}

        {/* No analysis yet */}
        {!hasAnalysis && contract.status === "pending" && (
          <Card>
            <CardContent className="py-12 text-center">
              <p className="text-muted-foreground">
                Click &quot;Run Analysis&quot; to start the AI-powered contract
                review.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
