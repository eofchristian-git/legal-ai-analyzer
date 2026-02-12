"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { RiskLevelBadge } from "@/components/shared/risk-level-badge";
import { CountryFlag } from "@/components/shared/country-flag";
import { COUNTRIES } from "@/lib/countries";
import {
  Loader2,
  History,
  GitBranch,
  BookOpen,
  Search,
  X,
} from "lucide-react";
import { toast } from "sonner";

import type {
  PlaybookGroup,
  PlaybookRule,
  PlaybookData,
  Snapshot,
  SnapshotDetail,
  RiskLevel,
} from "./_components/types";
import { EMPTY_FORM, generateTempId } from "./_components/types";
import { PlaybookGroupSection } from "./_components/playbook-group-section";
import { InlineRuleForm } from "./_components/inline-rule-form";
import { RiskLevelPills } from "./_components/risk-level-pills";
import { StickySaveBar } from "./_components/sticky-save-bar";
import { VersionHistorySheet } from "./_components/version-history-sheet";

export default function PlaybookPage() {
  const [playbook, setPlaybook] = useState<PlaybookData | null>(null);
  const [savedRules, setSavedRules] = useState<PlaybookRule[]>([]);
  const [draftRules, setDraftRules] = useState<PlaybookRule[]>([]);
  const [groups, setGroups] = useState<PlaybookGroup[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [search, setSearch] = useState("");
  const [countryFilter, setCountryFilter] = useState("");
  const [riskFilter, setRiskFilter] = useState("");

  // Inline form state
  const [inlineFormGroupId, setInlineFormGroupId] = useState<string | null>(
    null
  );
  const [inlineFormEditingRule, setInlineFormEditingRule] =
    useState<PlaybookRule | null>(null);

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

  // Expanded rules + groups
  const [expandedRules, setExpandedRules] = useState<Set<string>>(new Set());
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  // Dirty check
  const isDirty = useMemo(
    () => JSON.stringify(draftRules) !== JSON.stringify(savedRules),
    [draftRules, savedRules]
  );

  // Change summary for the sticky bar
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
      if (Array.isArray(data.groups)) {
        setGroups(data.groups);
        // All groups collapsed by default
      }
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
    if (riskFilter && rule.riskLevel !== riskFilter) return false;
    return true;
  });

  const hasFilters =
    search ||
    (countryFilter && countryFilter !== "all") ||
    !!riskFilter;

  // Stats based on draft rules
  const ruleCount = draftRules.length;
  const riskCounts = draftRules.reduce(
    (acc, r) => {
      acc[r.riskLevel] = (acc[r.riskLevel] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  // Group filtered rules by groupId
  const rulesByGroup = useMemo(() => {
    const map = new Map<string, PlaybookRule[]>();
    for (const group of groups) {
      map.set(group.id, []);
    }
    const boilerplateId = groups[groups.length - 1]?.id;
    for (const rule of filteredRules) {
      const gid = rule.groupId || boilerplateId;
      if (gid) {
        const arr = map.get(gid);
        if (arr) {
          arr.push(rule);
        } else {
          map.set(gid, [rule]);
        }
      }
    }
    return map;
  }, [filteredRules, groups]);

  function toggleRule(id: string) {
    setExpandedRules((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleGroup(id: string) {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function openInlineCreate(groupId: string) {
    setInlineFormEditingRule(null);
    setInlineFormGroupId(groupId);
    // Ensure group is expanded
    setExpandedGroups((prev) => new Set(prev).add(groupId));
  }

  function openInlineEdit(rule: PlaybookRule) {
    setInlineFormEditingRule(rule);
    const groupId = rule.groupId || groups[groups.length - 1]?.id;
    setInlineFormGroupId(groupId || null);
    if (groupId) {
      setExpandedGroups((prev) => new Set(prev).add(groupId));
    }
  }

  function closeInlineForm() {
    setInlineFormGroupId(null);
    setInlineFormEditingRule(null);
  }

  function handleInlineSubmit(formData: typeof EMPTY_FORM) {
    if (inlineFormEditingRule) {
      // Update in draft
      setDraftRules((prev) =>
        prev.map((r) =>
          r.id === inlineFormEditingRule.id
            ? {
                ...r,
                title: formData.title,
                description: formData.description,
                country: formData.country || null,
                riskLevel: formData.riskLevel as RiskLevel,
                standardPosition: formData.standardPosition,
                acceptableRange: formData.acceptableRange,
                escalationTrigger: formData.escalationTrigger,
                negotiationGuidance: formData.negotiationGuidance,
              }
            : r
        )
      );
      toast.success("Rule updated (unsaved)");
    } else {
      // Add to draft with temp ID
      const newRule: PlaybookRule = {
        id: generateTempId(),
        title: formData.title,
        description: formData.description,
        country: formData.country || null,
        riskLevel: formData.riskLevel as RiskLevel,
        standardPosition: formData.standardPosition,
        acceptableRange: formData.acceptableRange,
        escalationTrigger: formData.escalationTrigger,
        negotiationGuidance: formData.negotiationGuidance,
        groupId: inlineFormGroupId,
        createdBy: "",
        createdByName: "You",
        createdAt: new Date().toISOString(),
      };
      setDraftRules((prev) => [...prev, newRule]);
      toast.success("Rule added (unsaved)");
    }
    closeInlineForm();
  }

  function openDeleteDialog(rule: PlaybookRule) {
    setDeletingRule(rule);
    setDeleteDialogOpen(true);
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
    closeInlineForm();
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
            groupId: r.groupId,
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

  async function handleRestoreFromHistory(version: number) {
    try {
      const res = await fetch(`/api/playbook/history/${version}`);
      if (!res.ok) throw new Error("Failed to load snapshot");
      const snapshot: SnapshotDetail = await res.json();

      // Build group name → id lookup for mapping snapshot rules back
      const groupNameToId = new Map<string, string>();
      for (const g of groups) {
        groupNameToId.set(g.name, g.id);
      }
      const boilerplateId = groups[groups.length - 1]?.id || null;

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
        groupId:
          r.groupId ||
          (r.groupName ? groupNameToId.get(r.groupName) || boilerplateId : boilerplateId),
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
        title="Global Playbook"
        description="Define your organization's standard contract positions, NDA criteria, and review policies"
        actions={
          <div className="flex items-center gap-2">
            {playbook && playbook.version > 0 && (
              <Badge
                variant="outline"
                className="text-blue-700 border-blue-300 bg-blue-50 px-2.5 py-1"
              >
                v.{playbook.version}
              </Badge>
            )}
            <Button variant="outline" onClick={openHistory} className="gap-2">
              <History className="h-4 w-4" />
              History
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

        {/* Filter Bar */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 max-w-sm min-w-[200px]">
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
                  <CountryFlag code={c.code} name={c.name} size="sm" />
                  <span>{c.name}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <RiskLevelPills value={riskFilter} onChange={setRiskFilter} />
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
        </div>

        {/* Grouped Rules */}
        {groups.length === 0 && draftRules.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted/60 mb-5">
              <BookOpen className="h-8 w-8 text-muted-foreground/50" />
            </div>
            <h3 className="text-lg font-medium">No rules defined yet</h3>
            <p className="mt-1.5 text-sm text-muted-foreground max-w-sm">
              Start building your playbook by adding rules to any category
              group. Rules define your organization&apos;s standard positions on
              contract clauses.
            </p>
          </div>
        ) : (
          <div className="space-y-3 pb-24">
            {groups.map((group, groupIdx) => {
              const groupRules = rulesByGroup.get(group.id) || [];
              // Hide empty groups when filtering (unless inline form is open for it)
              if (
                hasFilters &&
                groupRules.length === 0 &&
                inlineFormGroupId !== group.id
              ) {
                return null;
              }

              return (
                <PlaybookGroupSection
                  key={group.id}
                  group={group}
                  index={groupIdx}
                  rules={groupRules}
                  expandedRules={expandedRules}
                  onToggleRule={toggleRule}
                  onEditRule={openInlineEdit}
                  onDeleteRule={openDeleteDialog}
                  onAddRule={() => openInlineCreate(group.id)}
                  isExpanded={expandedGroups.has(group.id)}
                  onToggleExpand={() => toggleGroup(group.id)}
                  editingRuleId={inlineFormEditingRule?.id || null}
                  inlineForm={
                    inlineFormGroupId === group.id ? (
                      <InlineRuleForm
                        initialData={
                          inlineFormEditingRule
                            ? {
                                title: inlineFormEditingRule.title,
                                description: inlineFormEditingRule.description,
                                country:
                                  inlineFormEditingRule.country || "",
                                riskLevel: inlineFormEditingRule.riskLevel,
                                standardPosition:
                                  inlineFormEditingRule.standardPosition || "",
                                acceptableRange:
                                  inlineFormEditingRule.acceptableRange || "",
                                escalationTrigger:
                                  inlineFormEditingRule.escalationTrigger || "",
                                negotiationGuidance:
                                  inlineFormEditingRule.negotiationGuidance || "",
                              }
                            : null
                        }
                        editingRuleId={inlineFormEditingRule?.id || null}
                        onSubmit={handleInlineSubmit}
                        onCancel={closeInlineForm}
                      />
                    ) : null
                  }
                />
              );
            })}

            {/* Show message when all groups are hidden by filter */}
            {hasFilters && filteredRules.length === 0 && (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted/60 mb-5">
                  <BookOpen className="h-8 w-8 text-muted-foreground/50" />
                </div>
                <h3 className="text-lg font-medium">
                  No rules match your filters
                </h3>
                <p className="mt-1.5 text-sm text-muted-foreground max-w-sm">
                  Try adjusting your search or filters to find what you&apos;re
                  looking for.
                </p>
              </div>
            )}
          </div>
        )}
      </div>

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
      <VersionHistorySheet
        open={historyOpen}
        onOpenChange={setHistoryOpen}
        snapshots={snapshots}
        viewingSnapshot={viewingSnapshot}
        currentVersion={playbook?.version || 0}
        onViewSnapshot={viewSnapshot}
        onRestore={handleRestoreFromHistory}
      />

      {/* Sticky Save Bar */}
      <StickySaveBar
        isDirty={isDirty}
        changeSummary={changeSummary}
        saving={saving}
        onSave={handleSave}
        onDiscard={handleDiscard}
      />
    </div>
  );
}
