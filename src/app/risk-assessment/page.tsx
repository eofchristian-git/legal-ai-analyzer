"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SeverityBadge } from "@/components/shared/severity-badge";
import { FileDropzone } from "@/components/shared/file-dropzone";
import { Badge } from "@/components/ui/badge";
import { Plus, AlertTriangle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";

interface RiskRow {
  id: string;
  title: string;
  category: string;
  status: string;
  severity: number | null;
  likelihood: number | null;
  riskScore: number | null;
  riskLevel: string | null;
  createdAt: string;
  document: { filename: string };
}

export default function RiskAssessmentPage() {
  const router = useRouter();
  const [risks, setRisks] = useState<RiskRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [pastedText, setPastedText] = useState("");
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("contract");
  const [context, setContext] = useState("");

  useEffect(() => {
    fetch("/api/risk-assessment")
      .then((r) => r.json())
      .then((data) => setRisks(Array.isArray(data) ? data : []))
      .finally(() => setLoading(false));
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file && !pastedText) {
      toast.error("Please upload a file or paste text");
      return;
    }
    if (!title.trim()) {
      toast.error("Please enter a title");
      return;
    }

    setSubmitting(true);
    try {
      const formData = new FormData();
      if (file) formData.append("file", file);
      else formData.append("text", pastedText);

      const uploadRes = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });
      if (!uploadRes.ok) throw new Error("Upload failed");
      const doc = await uploadRes.json();

      const res = await fetch("/api/risk-assessment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          documentId: doc.id,
          title: title.trim(),
          category,
          context: context || undefined,
        }),
      });

      if (!res.ok) throw new Error("Risk assessment failed");
      const risk = await res.json();

      toast.success("Risk assessment completed");
      setDialogOpen(false);
      router.push(`/risk-assessment/${risk.id}`);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Something went wrong"
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Risk Assessment"
        description="Evaluate legal risks using severity-by-likelihood framework"
        actions={
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2">
                <Plus className="h-4 w-4" /> New Assessment
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>New Risk Assessment</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <FileDropzone
                  onFileSelect={setFile}
                  onTextPaste={setPastedText}
                  selectedFile={file}
                  onClear={() => setFile(null)}
                />
                <div>
                  <Label>Title *</Label>
                  <Input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g., Vendor Data Processing Risk"
                  />
                </div>
                <div>
                  <Label>Risk Category</Label>
                  <Select value={category} onValueChange={setCategory}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="contract">Contract</SelectItem>
                      <SelectItem value="regulatory">Regulatory</SelectItem>
                      <SelectItem value="litigation">Litigation</SelectItem>
                      <SelectItem value="ip">
                        Intellectual Property
                      </SelectItem>
                      <SelectItem value="data-privacy">
                        Data Privacy
                      </SelectItem>
                      <SelectItem value="employment">Employment</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Context</Label>
                  <Textarea
                    value={context}
                    onChange={(e) => setContext(e.target.value)}
                    placeholder="Describe the risk scenario or concerns..."
                    rows={3}
                  />
                </div>
                <Button type="submit" className="w-full" disabled={submitting}>
                  {submitting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Analyzing...
                    </>
                  ) : (
                    "Run Assessment"
                  )}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        }
      />
      <div className="p-8">
        {loading ? (
          <div className="text-center text-muted-foreground py-12">Loading...</div>
        ) : risks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <AlertTriangle className="h-12 w-12 text-muted-foreground/50 mb-4" />
            <h3 className="text-lg font-medium">No risk assessments yet</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Upload a document to evaluate legal risks.
            </p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Risk Score</TableHead>
                <TableHead>Level</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {risks.map((risk) => (
                <TableRow key={risk.id}>
                  <TableCell>
                    <Link
                      href={`/risk-assessment/${risk.id}`}
                      className="font-medium hover:underline"
                    >
                      {risk.title}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">{risk.category}</Badge>
                  </TableCell>
                  <TableCell>
                    {risk.riskScore !== null && (
                      <span className="font-mono font-bold">
                        {risk.riskScore}
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
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
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        risk.status === "completed" ? "default" : "secondary"
                      }
                    >
                      {risk.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {new Date(risk.createdAt).toLocaleDateString()}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
