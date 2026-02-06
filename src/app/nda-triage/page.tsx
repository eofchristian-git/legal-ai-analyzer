"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { SeverityBadge } from "@/components/shared/severity-badge";
import { FileDropzone } from "@/components/shared/file-dropzone";
import { Badge } from "@/components/ui/badge";
import { Plus, Shield, Loader2 } from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";

interface NdaRow {
  id: string;
  title: string;
  status: string;
  classification: string | null;
  ndaType: string | null;
  createdAt: string;
  document: { filename: string };
}

export default function NdaTriagePage() {
  const router = useRouter();
  const [ndas, setNdas] = useState<NdaRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [pastedText, setPastedText] = useState("");
  const [title, setTitle] = useState("");
  const [context, setContext] = useState("");

  useEffect(() => {
    fetch("/api/nda-triage")
      .then((r) => r.json())
      .then((data) => setNdas(Array.isArray(data) ? data : []))
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

      const res = await fetch("/api/nda-triage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          documentId: doc.id,
          title: title.trim(),
          context: context || undefined,
        }),
      });

      if (!res.ok) throw new Error("Triage failed");
      const nda = await res.json();

      toast.success("NDA triaged successfully");
      setDialogOpen(false);
      router.push(`/nda-triage/${nda.id}`);
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
        title="NDA Triage"
        description="Screen incoming NDAs and classify them for routing"
        actions={
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2">
                <Plus className="h-4 w-4" /> Triage NDA
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>Triage New NDA</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <FileDropzone
                  onFileSelect={setFile}
                  onTextPaste={setPastedText}
                  selectedFile={file}
                  onClear={() => setFile(null)}
                />
                <div>
                  <Label htmlFor="nda-title">Title *</Label>
                  <Input
                    id="nda-title"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g., Acme Corp Mutual NDA"
                  />
                </div>
                <div>
                  <Label htmlFor="nda-context">Context</Label>
                  <Textarea
                    id="nda-context"
                    value={context}
                    onChange={(e) => setContext(e.target.value)}
                    placeholder="e.g., Incoming from sales for exploratory discussions"
                    rows={2}
                  />
                </div>
                <Button type="submit" className="w-full" disabled={submitting}>
                  {submitting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Analyzing...
                    </>
                  ) : (
                    "Triage NDA"
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
        ) : ndas.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Shield className="h-12 w-12 text-muted-foreground/50 mb-4" />
            <h3 className="text-lg font-medium">No NDAs triaged yet</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Upload an NDA to screen it against standard criteria.
            </p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>File</TableHead>
                <TableHead>Classification</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ndas.map((nda) => (
                <TableRow key={nda.id}>
                  <TableCell>
                    <Link
                      href={`/nda-triage/${nda.id}`}
                      className="font-medium hover:underline"
                    >
                      {nda.title}
                    </Link>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {nda.document.filename}
                  </TableCell>
                  <TableCell>
                    {nda.classification && (
                      <SeverityBadge
                        severity={
                          nda.classification as "GREEN" | "YELLOW" | "RED"
                        }
                      />
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        nda.status === "completed" ? "default" : "secondary"
                      }
                    >
                      {nda.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {new Date(nda.createdAt).toLocaleDateString()}
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
