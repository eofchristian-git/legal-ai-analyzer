"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DisclaimerBanner } from "@/components/shared/disclaimer-banner";
import { MarkdownViewer } from "@/components/shared/markdown-viewer";
import { Loader2 } from "lucide-react";

interface ComplianceCheck {
  id: string;
  title: string;
  regulations: string;
  analysisType: string;
  overallStatus: string | null;
  rawAnalysis: string | null;
  document: { filename: string };
}

export default function ComplianceDetailPage() {
  const params = useParams();
  const [check, setCheck] = useState<ComplianceCheck | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/compliance/${params.id}`)
      .then((r) => r.json())
      .then(setCheck)
      .finally(() => setLoading(false));
  }, [params.id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!check) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        Compliance check not found
      </div>
    );
  }

  const regs = JSON.parse(check.regulations || "[]");
  const statusColor = (status: string | null) => {
    if (status === "COMPLIANT") return "bg-emerald-100 text-emerald-800";
    if (status === "NON_COMPLIANT") return "bg-red-100 text-red-800";
    return "bg-amber-100 text-amber-800";
  };

  return (
    <div>
      <PageHeader title={check.title} description={check.document.filename} />
      <div className="space-y-6 p-8">
        <DisclaimerBanner />

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Compliance Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4">
              {check.overallStatus && (
                <Badge className={statusColor(check.overallStatus)}>
                  {check.overallStatus.replace("_", " ")}
                </Badge>
              )}
              <div className="flex gap-1">
                {regs.map((r: string) => (
                  <Badge key={r} variant="secondary">
                    {r.toUpperCase()}
                  </Badge>
                ))}
              </div>
              <Badge variant="outline">{check.analysisType}</Badge>
            </div>
          </CardContent>
        </Card>

        {check.rawAnalysis && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Full Analysis</CardTitle>
            </CardHeader>
            <CardContent>
              <MarkdownViewer content={check.rawAnalysis} />
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
