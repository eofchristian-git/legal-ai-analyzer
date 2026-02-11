"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SeverityBadge } from "@/components/shared/severity-badge";

import { MarkdownViewer } from "@/components/shared/markdown-viewer";
import { Loader2 } from "lucide-react";

interface NdaTriage {
  id: string;
  title: string;
  classification: string | null;
  ndaType: string | null;
  term: string | null;
  governingLaw: string | null;
  rawAnalysis: string | null;
  recommendation: string | null;
  document: { filename: string };
}

export default function NdaTriageDetailPage() {
  const params = useParams();
  const [nda, setNda] = useState<NdaTriage | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/nda-triage/${params.id}`)
      .then((r) => r.json())
      .then(setNda)
      .finally(() => setLoading(false));
  }, [params.id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!nda) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        NDA triage not found
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title={nda.title}
        description={nda.document.filename}
      />
      <div className="space-y-6 p-8">

        {nda.classification && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Classification Result
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-4">
                <SeverityBadge
                  severity={
                    nda.classification as "GREEN" | "YELLOW" | "RED"
                  }
                />
                <span className="text-sm text-muted-foreground">
                  {nda.classification === "GREEN" &&
                    "Market-standard NDA, route for standard approval"}
                  {nda.classification === "YELLOW" &&
                    "Minor issues found, recommend counsel review"}
                  {nda.classification === "RED" &&
                    "Significant issues, requires full review or counterproposal"}
                </span>
              </div>
            </CardContent>
          </Card>
        )}

        {nda.rawAnalysis && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Full Triage Report</CardTitle>
            </CardHeader>
            <CardContent>
              <MarkdownViewer content={nda.rawAnalysis} />
            </CardContent>
          </Card>
        )}

        {nda.recommendation && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Recommendation</CardTitle>
            </CardHeader>
            <CardContent>
              <MarkdownViewer content={nda.recommendation} />
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
