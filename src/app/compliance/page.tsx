"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { FileDropzone } from "@/components/shared/file-dropzone";
import { Badge } from "@/components/ui/badge";
import { Plus, CheckSquare, Loader2 } from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";

const REGULATIONS = [
  { value: "gdpr", label: "GDPR" },
  { value: "ccpa", label: "CCPA/CPRA" },
  { value: "lgpd", label: "LGPD" },
  { value: "pipeda", label: "PIPEDA" },
  { value: "pipl", label: "PIPL" },
];

interface ComplianceRow {
  id: string;
  title: string;
  regulations: string;
  analysisType: string;
  status: string;
  overallStatus: string | null;
  createdAt: string;
  document: { filename: string };
}

export default function CompliancePage() {
  const router = useRouter();
  const [checks, setChecks] = useState<ComplianceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [pastedText, setPastedText] = useState("");
  const [title, setTitle] = useState("");
  const [selectedRegs, setSelectedRegs] = useState<string[]>(["gdpr"]);
  const [analysisType, setAnalysisType] = useState("dpa-review");

  useEffect(() => {
    fetch("/api/compliance")
      .then((r) => r.json())
      .then((data) => setChecks(Array.isArray(data) ? data : []))
      .finally(() => setLoading(false));
  }, []);

  function toggleRegulation(reg: string) {
    setSelectedRegs((prev) =>
      prev.includes(reg) ? prev.filter((r) => r !== reg) : [...prev, reg]
    );
  }

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
    if (selectedRegs.length === 0) {
      toast.error("Select at least one regulation");
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

      const res = await fetch("/api/compliance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          documentId: doc.id,
          title: title.trim(),
          regulations: selectedRegs,
          analysisType,
        }),
      });

      if (!res.ok) throw new Error("Compliance check failed");
      const check = await res.json();

      toast.success("Compliance check completed");
      setDialogOpen(false);
      router.push(`/compliance/${check.id}`);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Something went wrong"
      );
    } finally {
      setSubmitting(false);
    }
  }

  const statusColor = (status: string | null) => {
    if (status === "COMPLIANT") return "bg-emerald-100 text-emerald-800";
    if (status === "NON_COMPLIANT") return "bg-red-100 text-red-800";
    return "bg-amber-100 text-amber-800";
  };

  return (
    <div>
      <PageHeader
        title="Compliance Checking"
        description="Check contracts and documents against privacy regulations"
        actions={
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2">
                <Plus className="h-4 w-4" /> New Check
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>New Compliance Check</DialogTitle>
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
                    placeholder="e.g., Vendor DPA Review"
                  />
                </div>
                <div>
                  <Label>Regulations</Label>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {REGULATIONS.map((reg) => (
                      <Badge
                        key={reg.value}
                        variant={
                          selectedRegs.includes(reg.value)
                            ? "default"
                            : "outline"
                        }
                        className="cursor-pointer"
                        onClick={() => toggleRegulation(reg.value)}
                      >
                        {reg.label}
                      </Badge>
                    ))}
                  </div>
                </div>
                <div>
                  <Label>Analysis Type</Label>
                  <Select value={analysisType} onValueChange={setAnalysisType}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="dpa-review">DPA Review</SelectItem>
                      <SelectItem value="contract-compliance">
                        Contract Compliance
                      </SelectItem>
                      <SelectItem value="data-transfer">
                        Data Transfer Assessment
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button type="submit" className="w-full" disabled={submitting}>
                  {submitting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Analyzing...
                    </>
                  ) : (
                    "Run Compliance Check"
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
        ) : checks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <CheckSquare className="h-12 w-12 text-muted-foreground/50 mb-4" />
            <h3 className="text-lg font-medium">No compliance checks yet</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Upload a document to check against regulatory requirements.
            </p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Regulations</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Result</TableHead>
                <TableHead>Date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {checks.map((check) => {
                const regs = JSON.parse(check.regulations || "[]");
                return (
                  <TableRow key={check.id}>
                    <TableCell>
                      <Link
                        href={`/compliance/${check.id}`}
                        className="font-medium hover:underline"
                      >
                        {check.title}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        {regs.map((r: string) => (
                          <Badge key={r} variant="secondary" className="text-xs">
                            {r.toUpperCase()}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">
                      {check.analysisType}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          check.status === "completed" ? "default" : "secondary"
                        }
                      >
                        {check.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {check.overallStatus && (
                        <Badge className={statusColor(check.overallStatus)}>
                          {check.overallStatus.replace("_", " ")}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(check.createdAt).toLocaleDateString()}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
