"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SeverityBadge } from "@/components/shared/severity-badge";
import { DisclaimerBanner } from "@/components/shared/disclaimer-banner";
import { MarkdownViewer } from "@/components/shared/markdown-viewer";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface RiskAssessment {
  id: string;
  title: string;
  category: string;
  severity: number | null;
  likelihood: number | null;
  riskScore: number | null;
  riskLevel: string | null;
  rawAnalysis: string | null;
  riskMemo: string | null;
  document: { filename: string };
}

const SEVERITY_LABELS = ["", "Negligible", "Low", "Moderate", "High", "Critical"];
const LIKELIHOOD_LABELS = [
  "",
  "Remote",
  "Unlikely",
  "Possible",
  "Likely",
  "Almost Certain",
];

function getRiskColor(score: number): string {
  if (score >= 16) return "bg-red-500 text-white";
  if (score >= 10) return "bg-orange-500 text-white";
  if (score >= 5) return "bg-amber-400 text-black";
  return "bg-emerald-400 text-black";
}

function RiskMatrix({
  severity,
  likelihood,
}: {
  severity: number;
  likelihood: number;
}) {
  return (
    <div className="overflow-auto">
      <table className="min-w-[400px] border-collapse text-xs">
        <thead>
          <tr>
            <th className="p-2"></th>
            {[1, 2, 3, 4, 5].map((l) => (
              <th key={l} className="p-2 text-center font-medium">
                {LIKELIHOOD_LABELS[l]}
                <br />({l})
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {[5, 4, 3, 2, 1].map((s) => (
            <tr key={s}>
              <td className="p-2 text-right font-medium whitespace-nowrap">
                {SEVERITY_LABELS[s]} ({s})
              </td>
              {[1, 2, 3, 4, 5].map((l) => {
                const score = s * l;
                const isSelected = s === severity && l === likelihood;
                return (
                  <td
                    key={l}
                    className={cn(
                      "border p-3 text-center font-bold",
                      getRiskColor(score),
                      isSelected && "ring-2 ring-black ring-offset-2"
                    )}
                  >
                    {score}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function RiskAssessmentDetailPage() {
  const params = useParams();
  const [risk, setRisk] = useState<RiskAssessment | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/risk-assessment/${params.id}`)
      .then((r) => r.json())
      .then(setRisk)
      .finally(() => setLoading(false));
  }, [params.id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!risk) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        Risk assessment not found
      </div>
    );
  }

  return (
    <div>
      <PageHeader title={risk.title} description={risk.document.filename} />
      <div className="space-y-6 p-8">
        <DisclaimerBanner />

        {/* Score summary */}
        {risk.riskScore !== null && (
          <div className="grid grid-cols-4 gap-4">
            <Card>
              <CardContent className="pt-6">
                <div className="text-sm text-muted-foreground">Severity</div>
                <div className="text-2xl font-bold">
                  {risk.severity}/5
                </div>
                <div className="text-xs text-muted-foreground">
                  {SEVERITY_LABELS[risk.severity || 0]}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-sm text-muted-foreground">Likelihood</div>
                <div className="text-2xl font-bold">
                  {risk.likelihood}/5
                </div>
                <div className="text-xs text-muted-foreground">
                  {LIKELIHOOD_LABELS[risk.likelihood || 0]}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-sm text-muted-foreground">Risk Score</div>
                <div className="text-2xl font-bold">{risk.riskScore}/25</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-sm text-muted-foreground">Risk Level</div>
                <div className="mt-1">
                  {risk.riskLevel && (
                    <SeverityBadge
                      severity={
                        risk.riskLevel as
                          | "GREEN"
                          | "YELLOW"
                          | "ORANGE"
                          | "RED"
                      }
                    />
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Risk Matrix */}
        {risk.severity && risk.likelihood && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Risk Matrix</CardTitle>
            </CardHeader>
            <CardContent>
              <RiskMatrix
                severity={risk.severity}
                likelihood={risk.likelihood}
              />
            </CardContent>
          </Card>
        )}

        {/* Full Analysis */}
        {risk.rawAnalysis && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Full Risk Assessment
              </CardTitle>
            </CardHeader>
            <CardContent>
              <MarkdownViewer content={risk.rawAnalysis} />
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
