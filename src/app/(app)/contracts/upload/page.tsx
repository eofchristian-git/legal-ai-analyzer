"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { FileDropzone } from "@/components/shared/file-dropzone";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

export default function UploadContractPage() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [pastedText, setPastedText] = useState("");
  const [title, setTitle] = useState("");
  const [ourSide, setOurSide] = useState("customer");
  const [contractType, setContractType] = useState("");
  const [counterparty, setCounterparty] = useState("");
  const [deadline, setDeadline] = useState("");
  const [focusAreas, setFocusAreas] = useState("");
  const [dealContext, setDealContext] = useState("");
  const [submitting, setSubmitting] = useState(false);

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
      // Step 1: Upload document
      const formData = new FormData();
      if (file) {
        formData.append("file", file);
      } else {
        formData.append("text", pastedText);
      }

      const uploadRes = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      if (!uploadRes.ok) {
        const err = await uploadRes.json();
        throw new Error(err.error || "Upload failed");
      }

      const doc = await uploadRes.json();

      // Step 2: Create contract
      const contractRes = await fetch("/api/contracts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          documentId: doc.id,
          title: title.trim(),
          ourSide,
          contractType: contractType || undefined,
          counterparty: counterparty || undefined,
          deadline: deadline || undefined,
          focusAreas: focusAreas
            ? JSON.stringify(focusAreas.split(",").map((s: string) => s.trim()))
            : undefined,
          dealContext: dealContext || undefined,
        }),
      });

      if (!contractRes.ok) {
        const err = await contractRes.json();
        throw new Error(err.error || "Failed to create contract");
      }

      const contract = await contractRes.json();

      // Step 3: Navigate to detail page (analysis will be triggered there)
      toast.success("Contract uploaded successfully");
      router.push(`/contracts/${contract.id}`);
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
        title="Upload Contract"
        description="Upload a contract for AI-powered clause-by-clause analysis"
      />
      <div className="mx-auto max-w-2xl p-8">
        <form onSubmit={handleSubmit} className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Document</CardTitle>
            </CardHeader>
            <CardContent>
              <FileDropzone
                onFileSelect={setFile}
                onTextPaste={setPastedText}
                selectedFile={file}
                onClear={() => setFile(null)}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Contract Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="title">Title *</Label>
                <Input
                  id="title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g., Acme Corp SaaS Agreement"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="ourSide">Our Side *</Label>
                  <Select value={ourSide} onValueChange={setOurSide}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="customer">Customer</SelectItem>
                      <SelectItem value="vendor">Vendor</SelectItem>
                      <SelectItem value="licensor">Licensor</SelectItem>
                      <SelectItem value="licensee">Licensee</SelectItem>
                      <SelectItem value="partner">Partner</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="contractType">Contract Type</Label>
                  <Select
                    value={contractType}
                    onValueChange={setContractType}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="saas">SaaS</SelectItem>
                      <SelectItem value="services">Services</SelectItem>
                      <SelectItem value="license">License</SelectItem>
                      <SelectItem value="partnership">Partnership</SelectItem>
                      <SelectItem value="procurement">Procurement</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="counterparty">Counterparty</Label>
                  <Input
                    id="counterparty"
                    value={counterparty}
                    onChange={(e) => setCounterparty(e.target.value)}
                    placeholder="e.g., Acme Corp"
                  />
                </div>
                <div>
                  <Label htmlFor="deadline">Review Deadline</Label>
                  <Input
                    id="deadline"
                    type="date"
                    value={deadline}
                    onChange={(e) => setDeadline(e.target.value)}
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="focusAreas">
                  Focus Areas (comma-separated)
                </Label>
                <Input
                  id="focusAreas"
                  value={focusAreas}
                  onChange={(e) => setFocusAreas(e.target.value)}
                  placeholder="e.g., liability, IP, data protection"
                />
              </div>

              <div>
                <Label htmlFor="dealContext">Deal Context</Label>
                <Textarea
                  id="dealContext"
                  value={dealContext}
                  onChange={(e) => setDealContext(e.target.value)}
                  placeholder="Any additional context about this deal..."
                  rows={3}
                />
              </div>
            </CardContent>
          </Card>

          <Button
            type="submit"
            className="w-full"
            size="lg"
            disabled={submitting}
          >
            {submitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Uploading...
              </>
            ) : (
              "Upload & Review"
            )}
          </Button>
        </form>
      </div>
    </div>
  );
}
