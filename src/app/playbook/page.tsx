"use client";

import { useEffect, useState } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MarkdownViewer } from "@/components/shared/markdown-viewer";
import { Save, Loader2 } from "lucide-react";
import { toast } from "sonner";

const DEFAULT_PLAYBOOK = `# Organization Legal Playbook

## Contract Review Standards

### Limitation of Liability
- **Standard position**: Mutual cap at 12 months of fees
- **Acceptable range**: 6-24 months of fees
- **Escalation trigger**: Uncapped liability or cap below 6 months

### Indemnification
- **Standard position**: Mutual indemnification for IP infringement and breach of confidentiality
- **Acceptable range**: Reasonable carveouts for negligence and willful misconduct
- **Escalation trigger**: Unilateral indemnification obligations

### Data Protection
- **Standard position**: GDPR-compliant DPA required, data processed in approved jurisdictions
- **Acceptable range**: Standard Contractual Clauses for cross-border transfers
- **Escalation trigger**: No DPA offered, data processed in non-adequate jurisdictions

### IP Ownership
- **Standard position**: Each party retains pre-existing IP, customer owns custom deliverables
- **Acceptable range**: Vendor retains general know-how and improvements
- **Escalation trigger**: Vendor claims ownership of customer data or custom work

### Term and Termination
- **Standard position**: Annual term with 30-day termination for convenience
- **Acceptable range**: 60-90 day notice period
- **Escalation trigger**: Auto-renewal without opt-out, termination fees exceeding 1 month

## NDA Standards
- Prefer mutual NDAs
- Standard term: 2-3 years
- Required carveouts: public knowledge, prior possession, independent development, required by law
- Reject: non-solicitation, non-compete, residuals clauses
`;

export default function PlaybookPage() {
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState("edit");

  useEffect(() => {
    fetch("/api/playbook")
      .then((r) => r.json())
      .then((data) => {
        if (data?.content) {
          setContent(data.content);
        } else {
          setContent(DEFAULT_PLAYBOOK);
        }
      })
      .catch(() => setContent(DEFAULT_PLAYBOOK))
      .finally(() => setLoading(false));
  }, []);

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch("/api/playbook", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });

      if (!res.ok) throw new Error("Failed to save");
      toast.success("Playbook saved successfully");
    } catch {
      toast.error("Failed to save playbook");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Playbook"
        description="Define your organization's standard contract positions, NDA criteria, and review policies"
        actions={
          <Button onClick={handleSave} disabled={saving} className="gap-2">
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            Save Playbook
          </Button>
        }
      />
      <div className="p-8">
        <Card>
          <CardHeader>
            <Tabs value={tab} onValueChange={setTab}>
              <TabsList>
                <TabsTrigger value="edit">Edit</TabsTrigger>
                <TabsTrigger value="preview">Preview</TabsTrigger>
              </TabsList>
            </Tabs>
          </CardHeader>
          <CardContent>
            {tab === "edit" ? (
              <Textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                rows={30}
                className="font-mono text-sm"
                placeholder="Write your playbook in markdown..."
              />
            ) : (
              <div className="min-h-[400px]">
                <MarkdownViewer content={content} />
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
