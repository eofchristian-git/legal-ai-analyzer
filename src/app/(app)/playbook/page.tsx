"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  RiskLevelBadge,
  getRiskBorderColor,
} from "@/components/shared/risk-level-badge";
import { COUNTRIES, getCountryByCode } from "@/lib/countries";
import {
  Save,
  Loader2,
  Plus,
  History,
  ChevronDown,
  ChevronRight,
  Edit2,
  Trash2,
  GitBranch,
  RotateCcw,
  BookOpen,
  Search,
  X,
  Shield,
  Clock,
  User,
  AlertTriangle,
  Scale,
  FileText,
  Target,
  MessageSquare,
  Undo2,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type RiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

interface PlaybookRule {
  id: string;
  title: string;
  description: string;
  country: string | null;
  riskLevel: RiskLevel;
  standardPosition: string;
  acceptableRange: string;
  escalationTrigger: string;
  negotiationGuidance: string;
  createdBy: string;
  createdByName: string;
  createdAt: string;
}

interface PlaybookData {
  id: string;
  version: number;
  updatedAt: string;
  updatedByName: string | null;
}

interface Snapshot {
  id: string;
  version: number;
  createdBy: string;
  createdByName: string;
  createdAt: string;
  ruleCount: number;
}

interface SnapshotDetail {
  id: string;
  version: number;
  createdByName: string;
  createdAt: string;
  rules: {
    id: string;
    title: string;
    description: string;
    country: string | null;
    riskLevel: RiskLevel;
    standardPosition: string;
    acceptableRange: string;
    escalationTrigger: string;
    negotiationGuidance: string;
  }[];
}

const EMPTY_FORM = {
  title: "",
  description: "",
  country: "",
  riskLevel: "" as string,
  standardPosition: "",
  acceptableRange: "",
  escalationTrigger: "",
  negotiationGuidance: "",
};

function generateTempId() {
  return `temp-${crypto.randomUUID()}`;
}

export default function PlaybookPage() {
  const [playbook, setPlaybook] = useState<PlaybookData | null>(null);
  const [savedRules, setSavedRules] = useState<PlaybookRule[]>([]);
  const [draftRules, setDraftRules] = useState<PlaybookRule[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [search, setSearch] = useState("");
  const [countryFilter, setCountryFilter] = useState("");
  const [riskFilter, setRiskFilter] = useState("");

  // Rule dialog
  const [ruleDialogOpen, setRuleDialogOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<PlaybookRule | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);

  // Delete dialog
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingRule, setDeletingRule] = useState<PlaybookRule | null>(null);

  // Version history
  const [historyOpen, setHistoryOpen] = useState(false);
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [viewingSnapshot, setViewingSnapshot] =
    useState<SnapshotDetail | null>(null);

  // Save
  const [saving, setSaving] = useState(false);

  // Expanded rules
  const [expandedRules, setExpandedRules] = useState<Set<string>>(new Set());

  // Dirty check
  const isDirty = useMemo(
    () => JSON.stringify(draftRules) !== JSON.stringify(savedRules),
    [draftRules, savedRules]
  );

  // Change summary for the unsaved banner
  const changeSummary = useMemo(() => {
    if (!isDirty) return null;
    const savedIds = new Set(savedRules.map((r) => r.id));
    const draftIds = new Set(draftRules.map((r) => r.id));

    const added = draftRules.filter((r) => !savedIds.has(r.id)).length;
    const removed = savedRules.filter((r) => !draftIds.has(r.id)).length;
    const edited = draftRules.filter((r) => {
      if (!savedIds.has(r.id)) return false;
      const saved = savedRules.find((s) => s.id === r.id);
      return saved && JSON.stringify(r) !== JSON.stringify(saved);
    }).length;

    const parts: string[] = [];
    if (added > 0) parts.push(`${added} added`);
    if (edited > 0) parts.push(`${edited} edited`);
    if (removed > 0) parts.push(`${removed} removed`);
    return parts.join(", ");
  }, [isDirty, savedRules, draftRules]);

  const fetchPlaybook = useCallback(async () => {
    try {
      const res = await fetch("/api/playbook");
      const data = await res.json();
      const rules: PlaybookRule[] = data.rules || [];
      setSavedRules(rules);
      setDraftRules(rules);
      setPlaybook({
        id: data.id,
        version: data.version,
        updatedAt: data.updatedAt,
        updatedByName: data.updatedByName,
      });
    } catch {
      toast.error("Failed to load playbook");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPlaybook();
  }, [fetchPlaybook]);

  // Warn before navigating away with unsaved changes
  useEffect(() => {
    function handleBeforeUnload(e: BeforeUnloadEvent) {
      if (isDirty) {
        e.preventDefault();
      }
    }
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isDirty]);

  // Client-side filtering on draft rules
  const filteredRules = draftRules.filter((rule) => {
    if (search) {
      const q = search.toLowerCase();
      if (
        !rule.title.toLowerCase().includes(q) &&
        !rule.description.toLowerCase().includes(q)
      )
        return false;
    }
    if (countryFilter && countryFilter !== "all" && rule.country !== countryFilter)
      return false;
    if (riskFilter && riskFilter !== "all" && rule.riskLevel !== riskFilter)
      return false;
    return true;
  });

  const hasFilters =
    search ||
    (countryFilter && countryFilter !== "all") ||
    (riskFilter && riskFilter !== "all");

  // Stats based on draft rules
  const ruleCount = draftRules.length;
  const riskCounts = draftRules.reduce(
    (acc, r) => {
      acc[r.riskLevel] = (acc[r.riskLevel] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  function toggleRule(id: string) {
    setExpandedRules((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function openCreateDialog() {
    setEditingRule(null);
    setForm(EMPTY_FORM);
    setRuleDialogOpen(true);
  }

  function openEditDialog(rule: PlaybookRule) {
    setEditingRule(rule);
    setForm({
      title: rule.title,
      description: rule.description,
      country: rule.country || "",
      riskLevel: rule.riskLevel,
      standardPosition: rule.standardPosition,
      acceptableRange: rule.acceptableRange,
      escalationTrigger: rule.escalationTrigger,
      negotiationGuidance: rule.negotiationGuidance,
    });
    setRuleDialogOpen(true);
  }

  function openDeleteDialog(rule: PlaybookRule) {
    setDeletingRule(rule);
    setDeleteDialogOpen(true);
  }

  function handleRuleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (
      !form.title ||
      !form.description ||
      !form.riskLevel ||
      !form.standardPosition ||
      !form.acceptableRange ||
      !form.escalationTrigger ||
      !form.negotiationGuidance
    ) {
      toast.error("Please fill in all required fields");
      return;
    }

    if (editingRule) {
      // Update in draft
      setDraftRules((prev) =>
        prev.map((r) =>
          r.id === editingRule.id
            ? {
                ...r,
                title: form.title,
                description: form.description,
                country: form.country || null,
                riskLevel: form.riskLevel as RiskLevel,
                standardPosition: form.standardPosition,
                acceptableRange: form.acceptableRange,
                escalationTrigger: form.escalationTrigger,
                negotiationGuidance: form.negotiationGuidance,
              }
            : r
        )
      );
      toast.success("Rule updated (unsaved)");
    } else {
      // Add to draft with temp ID
      const newRule: PlaybookRule = {
        id: generateTempId(),
        title: form.title,
        description: form.description,
        country: form.country || null,
        riskLevel: form.riskLevel as RiskLevel,
        standardPosition: form.standardPosition,
        acceptableRange: form.acceptableRange,
        escalationTrigger: form.escalationTrigger,
        negotiationGuidance: form.negotiationGuidance,
        createdBy: "",
        createdByName: "You",
        createdAt: new Date().toISOString(),
      };
      setDraftRules((prev) => [...prev, newRule]);
      toast.success("Rule added (unsaved)");
    }

    setRuleDialogOpen(false);
    setEditingRule(null);
  }

  function handleDelete() {
    if (!deletingRule) return;
    setDraftRules((prev) => prev.filter((r) => r.id !== deletingRule.id));
    setExpandedRules((prev) => {
      const next = new Set(prev);
      next.delete(deletingRule.id);
      return next;
    });
    toast.success("Rule removed (unsaved)");
    setDeleteDialogOpen(false);
    setDeletingRule(null);
  }

  function handleDiscard() {
    setDraftRules(savedRules);
    setExpandedRules(new Set());
    toast.info("Changes discarded");
  }

  async function handleSave() {
    if (draftRules.length === 0) {
      toast.error("Cannot save an empty playbook");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/playbook/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rules: draftRules.map((r) => ({
            title: r.title,
            description: r.description,
            country: r.country,
            riskLevel: r.riskLevel,
            standardPosition: r.standardPosition,
            acceptableRange: r.acceptableRange,
            escalationTrigger: r.escalationTrigger,
            negotiationGuidance: r.negotiationGuidance,
          })),
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to save");
      }

      const data = await res.json();
      const newRules: PlaybookRule[] = data.rules;
      setSavedRules(newRules);
      setDraftRules(newRules);
      setPlaybook((prev) =>
        prev
          ? {
              ...prev,
              version: data.version,
              updatedAt: new Date().toISOString(),
              updatedByName: data.playbook.updatedByName,
            }
          : prev
      );
      setExpandedRules(new Set());
      toast.success(`Playbook saved as v${data.version}`);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to save playbook"
      );
    } finally {
      setSaving(false);
    }
  }

  async function openHistory() {
    setHistoryOpen(true);
    setViewingSnapshot(null);
    try {
      const res = await fetch("/api/playbook/history");
      const data = await res.json();
      if (Array.isArray(data)) setSnapshots(data);
    } catch {
      toast.error("Failed to load version history");
    }
  }

  async function viewSnapshot(version: number) {
    try {
      const res = await fetch(`/api/playbook/history/${version}`);
      const data = await res.json();
      setViewingSnapshot(data);
    } catch {
      toast.error("Failed to load snapshot");
    }
  }

  function handleRestore(snapshot: SnapshotDetail) {
    // Load snapshot rules into draft state (client-side only)
    const restoredRules: PlaybookRule[] = snapshot.rules.map((r) => ({
      id: generateTempId(),
      title: r.title,
      description: r.description,
      country: r.country,
      riskLevel: r.riskLevel,
      standardPosition: r.standardPosition,
      acceptableRange: r.acceptableRange,
      escalationTrigger: r.escalationTrigger,
      negotiationGuidance: r.negotiationGuidance,
      createdBy: "",
      createdByName: "Restored",
      createdAt: new Date().toISOString(),
    }));

    setDraftRules(restoredRules);
    setExpandedRules(new Set());
    setHistoryOpen(false);
    toast.success(
      `Loaded ${restoredRules.length} rules from v${snapshot.version}. Click "Save Playbook" to apply.`
    );
  }

  async function handleRestoreFromHistory(version: number) {
    try {
      const res = await fetch(`/api/playbook/history/${version}`);
      if (!res.ok) throw new Error("Failed to load snapshot");
      const data: SnapshotDetail = await res.json();
      handleRestore(data);
    } catch {
      toast.error("Failed to restore from snapshot");
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
        title="Legal Playbook"
        description="Define your organization's standard contract positions, NDA criteria, and review policies"
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={openHistory} className="gap-2">
              <History className="h-4 w-4" />
              History
            </Button>
            <Button
              onClick={handleSave}
              disabled={saving || !isDirty}
              className="gap-2"
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              Save Playbook
            </Button>
          </div>
        }
      />

      <div className="p-8 space-y-6">
        {/* Version Info + Stats Bar */}
        {playbook && playbook.version > 0 && (
          <div className="rounded-lg border border-blue-200/80 bg-gradient-to-r from-blue-50 to-indigo-50/50 px-5 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-100">
                    <GitBranch className="h-4 w-4 text-blue-700" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-blue-900">
                        Version {playbook.version}
                      </span>
                      <Badge className="bg-blue-600 text-white text-[10px] px-1.5 py-0">
                        CURRENT
                      </Badge>
                    </div>
                    <p className="text-xs text-blue-600/80">
                      {new Date(playbook.updatedAt).toLocaleDateString(
                        "en-US",
                        { month: "short", day: "numeric", year: "numeric" }
                      )}
                      {playbook.updatedByName &&
                        ` by ${playbook.updatedByName}`}
                    </p>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-6">
                <div className="text-center">
                  <p className="text-lg font-semibold text-foreground">
                    {ruleCount}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    Total Rules
                  </p>
                </div>
                {(["CRITICAL", "HIGH", "MEDIUM", "LOW"] as const).map(
                  (level) =>
                    riskCounts[level] ? (
                      <div key={level} className="text-center">
                        <p className="text-lg font-semibold text-foreground">
                          {riskCounts[level]}
                        </p>
                        <p className="text-[11px]">
                          <RiskLevelBadge level={level} size="sm" />
                        </p>
                      </div>
                    ) : null
                )}
              </div>
            </div>
          </div>
        )}

        {/* Unsaved Changes Banner */}
        {isDirty && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 px-5 py-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-100">
                  <AlertTriangle className="h-4 w-4 text-amber-600" />
                </div>
                <div>
                  <p className="text-sm font-medium text-amber-900">
                    Unsaved changes
                  </p>
                  {changeSummary && (
                    <p className="text-xs text-amber-700">{changeSummary}</p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleDiscard}
                  className="gap-1.5 border-amber-300 text-amber-800 hover:bg-amber-100"
                >
                  <Undo2 className="h-3.5 w-3.5" />
                  Discard
                </Button>
                <Button
                  size="sm"
                  onClick={handleSave}
                  disabled={saving}
                  className="gap-1.5 bg-amber-600 hover:bg-amber-700 text-white"
                >
                  {saving ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Save className="h-3.5 w-3.5" />
                  )}
                  Save
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Filter Bar */}
        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/60" />
            <Input
              placeholder="Search rules..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={countryFilter} onValueChange={setCountryFilter}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="All Countries" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Countries</SelectItem>
              {COUNTRIES.map((c) => (
                <SelectItem key={c.code} value={c.code}>
                  {c.flag} {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={riskFilter} onValueChange={setRiskFilter}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="All Risk Levels" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Risk Levels</SelectItem>
              <SelectItem value="LOW">Low</SelectItem>
              <SelectItem value="MEDIUM">Medium</SelectItem>
              <SelectItem value="HIGH">High</SelectItem>
              <SelectItem value="CRITICAL">Critical</SelectItem>
            </SelectContent>
          </Select>
          {hasFilters && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSearch("");
                setCountryFilter("");
                setRiskFilter("");
              }}
              className="gap-1 text-muted-foreground"
            >
              <X className="h-3 w-3" />
              Clear
            </Button>
          )}
          <div className="flex-1" />
          {hasFilters && (
            <p className="text-xs text-muted-foreground">
              {filteredRules.length} of {ruleCount} rules
            </p>
          )}
          <Button onClick={openCreateDialog} className="gap-2">
            <Plus className="h-4 w-4" />
            Add Rule
          </Button>
        </div>

        {/* Rules List */}
        {filteredRules.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted/60 mb-5">
              <BookOpen className="h-8 w-8 text-muted-foreground/50" />
            </div>
            <h3 className="text-lg font-medium">
              {hasFilters
                ? "No rules match your filters"
                : "No rules defined yet"}
            </h3>
            <p className="mt-1.5 text-sm text-muted-foreground max-w-sm">
              {hasFilters
                ? "Try adjusting your search or filters to find what you're looking for."
                : "Start building your playbook by adding your first rule. Rules define your organization's standard positions on contract clauses."}
            </p>
            {!hasFilters && (
              <Button onClick={openCreateDialog} className="mt-5 gap-2">
                <Plus className="h-4 w-4" />
                Add First Rule
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {filteredRules.map((rule) => {
              const isExpanded = expandedRules.has(rule.id);
              const country = rule.country
                ? getCountryByCode(rule.country)
                : null;

              return (
                <Card
                  key={rule.id}
                  className={cn(
                    "overflow-hidden border-l-4 transition-shadow",
                    getRiskBorderColor(rule.riskLevel),
                    isExpanded && "shadow-sm"
                  )}
                >
                  <button
                    onClick={() => toggleRule(rule.id)}
                    className="w-full px-5 py-3.5 flex items-center justify-between hover:bg-accent/40 transition-colors text-left"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {isExpanded ? (
                        <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                      )}
                      <span className="font-medium truncate">
                        {rule.title}
                      </span>
                      <RiskLevelBadge level={rule.riskLevel} size="sm" />
                      {country && (
                        <TooltipProvider delayDuration={300}>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="text-sm shrink-0">
                                {country.flag}
                              </span>
                            </TooltipTrigger>
                            <TooltipContent side="top">
                              <p>{country.name}</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0 ml-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-foreground"
                        onClick={(e) => {
                          e.stopPropagation();
                          openEditDialog(rule);
                        }}
                      >
                        <Edit2 className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                        onClick={(e) => {
                          e.stopPropagation();
                          openDeleteDialog(rule);
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </button>
                  {isExpanded && (
                    <CardContent className="border-t bg-accent/20 px-5 pt-4 pb-5 space-y-5">
                      {/* Business Context */}
                      <div>
                        <div className="flex items-center gap-1.5 mb-1.5">
                          <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                            Business Context
                          </p>
                        </div>
                        <p className="text-sm leading-relaxed">
                          {rule.description}
                        </p>
                      </div>

                      {/* Rule Details Grid */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="rounded-lg border bg-background p-3.5">
                          <div className="flex items-center gap-1.5 mb-1.5">
                            <Target className="h-3.5 w-3.5 text-blue-500" />
                            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                              Standard Position
                            </p>
                          </div>
                          <p className="text-sm leading-relaxed">
                            {rule.standardPosition}
                          </p>
                        </div>
                        <div className="rounded-lg border bg-background p-3.5">
                          <div className="flex items-center gap-1.5 mb-1.5">
                            <Scale className="h-3.5 w-3.5 text-emerald-500" />
                            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                              Acceptable Range
                            </p>
                          </div>
                          <p className="text-sm leading-relaxed">
                            {rule.acceptableRange}
                          </p>
                        </div>
                        <div className="rounded-lg border bg-background p-3.5">
                          <div className="flex items-center gap-1.5 mb-1.5">
                            <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                              Escalation Trigger
                            </p>
                          </div>
                          <p className="text-sm leading-relaxed">
                            {rule.escalationTrigger}
                          </p>
                        </div>
                        <div className="rounded-lg border bg-background p-3.5">
                          <div className="flex items-center gap-1.5 mb-1.5">
                            <MessageSquare className="h-3.5 w-3.5 text-violet-500" />
                            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                              Negotiation Guidance
                            </p>
                          </div>
                          <p className="text-sm leading-relaxed">
                            {rule.negotiationGuidance}
                          </p>
                        </div>
                      </div>

                      {/* Audit Footer */}
                      <div className="flex items-center gap-4 pt-2 border-t text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <User className="h-3 w-3" />
                          {rule.createdByName}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {new Date(rule.createdAt).toLocaleDateString(
                            "en-US",
                            {
                              month: "short",
                              day: "numeric",
                              year: "numeric",
                            }
                          )}
                        </span>
                      </div>
                    </CardContent>
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Rule Create/Edit Dialog */}
      <Dialog
        open={ruleDialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            setRuleDialogOpen(false);
            setEditingRule(null);
          }
        }}
      >
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingRule ? "Edit Rule" : "Create Rule"}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleRuleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="rule-title">Title *</Label>
              <Input
                id="rule-title"
                value={form.title}
                onChange={(e) =>
                  setForm((f) => ({ ...f, title: e.target.value }))
                }
                placeholder="e.g., Limitation of Liability"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rule-description">
                Description — Business Context *
              </Label>
              <Textarea
                id="rule-description"
                value={form.description}
                onChange={(e) =>
                  setForm((f) => ({ ...f, description: e.target.value }))
                }
                rows={3}
                placeholder="Why this rule matters for the business..."
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Country (optional)</Label>
                <Select
                  value={form.country || "none"}
                  onValueChange={(v) =>
                    setForm((f) => ({ ...f, country: v === "none" ? "" : v }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Global (no country)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Global (no country)</SelectItem>
                    {COUNTRIES.map((c) => (
                      <SelectItem key={c.code} value={c.code}>
                        {c.flag} {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Risk Level *</Label>
                <Select
                  value={form.riskLevel || "placeholder"}
                  onValueChange={(v) =>
                    setForm((f) => ({
                      ...f,
                      riskLevel: v === "placeholder" ? "" : v,
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select risk level" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="LOW">Low</SelectItem>
                    <SelectItem value="MEDIUM">Medium</SelectItem>
                    <SelectItem value="HIGH">High</SelectItem>
                    <SelectItem value="CRITICAL">Critical</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rule-standard">Standard Position *</Label>
              <Textarea
                id="rule-standard"
                value={form.standardPosition}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    standardPosition: e.target.value,
                  }))
                }
                rows={2}
                placeholder="Our default negotiating position..."
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rule-range">Acceptable Range *</Label>
              <Textarea
                id="rule-range"
                value={form.acceptableRange}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    acceptableRange: e.target.value,
                  }))
                }
                rows={2}
                placeholder="Range of terms we can accept..."
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rule-escalation">Escalation Trigger *</Label>
              <Textarea
                id="rule-escalation"
                value={form.escalationTrigger}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    escalationTrigger: e.target.value,
                  }))
                }
                rows={2}
                placeholder="When to escalate for senior review..."
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rule-guidance">Negotiation Guidance *</Label>
              <Textarea
                id="rule-guidance"
                value={form.negotiationGuidance}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    negotiationGuidance: e.target.value,
                  }))
                }
                rows={2}
                placeholder="How to negotiate this clause..."
              />
            </div>
            <Button type="submit" className="w-full">
              {editingRule ? "Update Rule" : "Add Rule"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Remove Rule</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Remove &ldquo;{deletingRule?.title}&rdquo; from the draft? This
            won&apos;t affect the saved playbook until you click Save.
          </p>
          <div className="flex justify-end gap-2 mt-4">
            <Button
              variant="outline"
              onClick={() => setDeleteDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete}>
              Remove
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Version History Sheet */}
      <Sheet open={historyOpen} onOpenChange={setHistoryOpen}>
        <SheetContent className="w-[440px] overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <History className="h-5 w-5" />
              Version History
            </SheetTitle>
          </SheetHeader>
          <div className="mt-6">
            {snapshots.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted/60 mb-3">
                  <Shield className="h-6 w-6 text-muted-foreground/50" />
                </div>
                <p className="text-sm text-muted-foreground">
                  No versions saved yet.
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Click &ldquo;Save Playbook&rdquo; to create the first
                  snapshot.
                </p>
              </div>
            ) : (
              <div className="relative">
                {/* Timeline line */}
                <div className="absolute left-[19px] top-3 bottom-3 w-px bg-border" />

                <div className="space-y-1">
                  {snapshots.map((s, idx) => {
                    const isCurrent =
                      playbook && s.version === playbook.version;
                    const isFirst = idx === 0;

                    return (
                      <div key={s.id}>
                        <div
                          className={cn(
                            "relative pl-10 py-3 pr-4 rounded-lg cursor-pointer transition-all",
                            isCurrent
                              ? "bg-blue-50 border border-blue-200/80"
                              : "hover:bg-accent/50"
                          )}
                          onClick={() => viewSnapshot(s.version)}
                        >
                          {/* Timeline dot */}
                          <div
                            className={cn(
                              "absolute left-3 top-4.5 h-3 w-3 rounded-full border-2",
                              isCurrent
                                ? "bg-blue-600 border-blue-300"
                                : isFirst
                                  ? "bg-foreground border-muted-foreground/30"
                                  : "bg-muted-foreground/40 border-muted-foreground/20"
                            )}
                          />

                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="font-semibold text-sm">
                                  v{s.version}
                                </span>
                                {isCurrent && (
                                  <Badge className="bg-blue-600 text-white text-[10px] px-1.5 py-0">
                                    CURRENT
                                  </Badge>
                                )}
                              </div>
                              <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground">
                                <span>
                                  {new Date(s.createdAt).toLocaleDateString(
                                    "en-US",
                                    {
                                      month: "short",
                                      day: "numeric",
                                      year: "numeric",
                                    }
                                  )}
                                </span>
                                <span>·</span>
                                <span>{s.createdByName}</span>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <span className="text-xs text-muted-foreground">
                                {s.ruleCount} rules
                              </span>
                              {!isCurrent && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-7 text-xs gap-1"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleRestoreFromHistory(s.version);
                                  }}
                                >
                                  <RotateCcw className="h-3 w-3" />
                                  Restore
                                </Button>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Inline snapshot detail */}
                        {viewingSnapshot &&
                          viewingSnapshot.version === s.version && (
                            <div className="ml-10 mr-4 mt-1 mb-2 space-y-1.5">
                              {viewingSnapshot.rules.map((r) => (
                                <div
                                  key={r.id}
                                  className={cn(
                                    "border-l-3 rounded-r-md border bg-background p-3 text-sm",
                                    getRiskBorderColor(r.riskLevel)
                                  )}
                                >
                                  <div className="flex items-center gap-2 mb-0.5">
                                    <span className="font-medium text-xs">
                                      {r.title}
                                    </span>
                                    <RiskLevelBadge
                                      level={r.riskLevel}
                                      size="sm"
                                    />
                                  </div>
                                  <p className="text-muted-foreground text-xs leading-relaxed">
                                    {r.standardPosition}
                                  </p>
                                </div>
                              ))}
                            </div>
                          )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
