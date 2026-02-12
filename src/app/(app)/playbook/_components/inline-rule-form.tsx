"use client";

import { useState, useMemo, useRef } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { COUNTRIES } from "@/lib/countries";
import { CountryFlag } from "@/components/shared/country-flag";
import { toast } from "sonner";
import { EMPTY_FORM } from "./types";
import { cn } from "@/lib/utils";
import { Edit2, Plus, X, Check } from "lucide-react";

type FormData = typeof EMPTY_FORM;

const RISK_OPTIONS = [
  {
    value: "LOW",
    label: "Low",
    dotColor: "bg-emerald-500",
    activeClass:
      "bg-emerald-50 border-emerald-300 text-emerald-800 ring-1 ring-emerald-200",
    hoverClass: "hover:border-emerald-200 hover:bg-emerald-50/50",
  },
  {
    value: "MEDIUM",
    label: "Medium",
    dotColor: "bg-amber-500",
    activeClass:
      "bg-amber-50 border-amber-300 text-amber-800 ring-1 ring-amber-200",
    hoverClass: "hover:border-amber-200 hover:bg-amber-50/50",
  },
  {
    value: "HIGH",
    label: "High",
    dotColor: "bg-orange-500",
    activeClass:
      "bg-orange-50 border-orange-300 text-orange-800 ring-1 ring-orange-200",
    hoverClass: "hover:border-orange-200 hover:bg-orange-50/50",
  },
  {
    value: "CRITICAL",
    label: "Critical",
    dotColor: "bg-red-500",
    activeClass:
      "bg-red-50 border-red-300 text-red-800 ring-1 ring-red-200",
    hoverClass: "hover:border-red-200 hover:bg-red-50/50",
  },
] as const;

interface InlineRuleFormProps {
  initialData: FormData | null;
  editingRuleId: string | null;
  onSubmit: (data: FormData) => void;
  onCancel: () => void;
}

export function InlineRuleForm({
  initialData,
  editingRuleId,
  onSubmit,
  onCancel,
}: InlineRuleFormProps) {
  const [form, setForm] = useState<FormData>(initialData || EMPTY_FORM);
  const [activeTab, setActiveTab] = useState("details");
  const slideDirection = useRef<"left" | "right">("left");
  const [animKey, setAnimKey] = useState(0);
  const isEditing = !!editingRuleId;

  const TABS = ["details", "positions"] as const;

  function handleTabChange(tab: string) {
    const oldIdx = TABS.indexOf(activeTab as (typeof TABS)[number]);
    const newIdx = TABS.indexOf(tab as (typeof TABS)[number]);
    slideDirection.current = newIdx > oldIdx ? "left" : "right";
    setAnimKey((k) => k + 1);
    setActiveTab(tab);
  }

  const detailsComplete = useMemo(
    () => !!(form.title && form.riskLevel && form.description),
    [form.title, form.riskLevel, form.description]
  );

  const positionsComplete = useMemo(
    () =>
      !!(
        form.standardPosition ||
        form.acceptableRange ||
        form.escalationTrigger ||
        form.negotiationGuidance
      ),
    [
      form.standardPosition,
      form.acceptableRange,
      form.escalationTrigger,
      form.negotiationGuidance,
    ]
  );

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    // Cross-tab validation: switch to the tab with missing fields
    if (!form.title || !form.riskLevel || !form.description) {
      handleTabChange("details");
      toast.error("Please fill in all required fields in Details");
      return;
    }
    onSubmit(form);
  }

  const riskBorderColor =
    {
      LOW: "border-t-emerald-400",
      MEDIUM: "border-t-amber-400",
      HIGH: "border-t-orange-400",
      CRITICAL: "border-t-red-400",
    }[form.riskLevel] || "border-t-primary/30";

  return (
    <Card
      className={cn(
        "border-t-[3px] py-0 gap-0 overflow-hidden animate-scale-fade-in",
        riskBorderColor
      )}
    >
      <form onSubmit={handleSubmit}>
        <Tabs value={activeTab} onValueChange={handleTabChange} className="gap-0">
          {/* Header with tabs */}
          <div className="flex items-center justify-between px-4 py-2 bg-accent/40 border-b">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5">
                {isEditing ? (
                  <Edit2 className="h-3.5 w-3.5 text-muted-foreground" />
                ) : (
                  <Plus className="h-3.5 w-3.5 text-muted-foreground" />
                )}
                <span className="text-sm font-medium">
                  {isEditing ? "Edit" : "New Rule"}
                </span>
                {isEditing && initialData?.title && (
                  <span className="text-xs text-muted-foreground truncate max-w-[150px]">
                    &mdash; {initialData.title}
                  </span>
                )}
              </div>

              <TabsList className="h-7">
                <TabsTrigger
                  value="details"
                  className="text-xs h-6 px-2.5 gap-1.5"
                >
                  Details
                  <span
                    className={cn(
                      "h-1.5 w-1.5 rounded-full transition-colors",
                      detailsComplete ? "bg-emerald-500" : "bg-muted-foreground/30"
                    )}
                  />
                </TabsTrigger>
                <TabsTrigger
                  value="positions"
                  className="text-xs h-6 px-2.5 gap-1.5"
                >
                  Positions
                  <span
                    className={cn(
                      "h-1.5 w-1.5 rounded-full transition-colors",
                      positionsComplete
                        ? "bg-emerald-500"
                        : "bg-muted-foreground/30"
                    )}
                  />
                </TabsTrigger>
              </TabsList>
            </div>

            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-muted-foreground hover:text-foreground"
              onClick={onCancel}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>

          {/* Tab 1: Details */}
          <TabsContent
            key={`details-${animKey}`}
            value="details"
            className={cn(
              "p-4 space-y-3",
              slideDirection.current === "right"
                ? "animate-tab-slide-right"
                : "animate-tab-slide-left"
            )}
          >
            <div className="space-y-1">
              <Label htmlFor="inline-rule-title" className="text-xs">
                Rule Title <span className="text-destructive">*</span>
              </Label>
              <Input
                id="inline-rule-title"
                value={form.title}
                onChange={(e) =>
                  setForm((f) => ({ ...f, title: e.target.value }))
                }
                placeholder="e.g., Limitation of Liability"
                className="h-8 text-sm"
              />
            </div>

            <div className="grid grid-cols-[1fr_auto] gap-3 items-end">
              <div className="space-y-1">
                <Label className="text-xs">Jurisdiction</Label>
                <Select
                  value={form.country || "none"}
                  onValueChange={(v) =>
                    setForm((f) => ({
                      ...f,
                      country: v === "none" ? "" : v,
                    }))
                  }
                >
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue placeholder="Global (all)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">
                      Global (all jurisdictions)
                    </SelectItem>
                    {COUNTRIES.map((c) => (
                      <SelectItem key={c.code} value={c.code}>
                        <CountryFlag code={c.code} name={c.name} size="sm" />
                        <span>{c.name}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Risk Level Buttons */}
              <div className="space-y-1">
                <Label className="text-xs">
                  Risk Level <span className="text-destructive">*</span>
                </Label>
                <div className="flex gap-1">
                  {RISK_OPTIONS.map((opt) => {
                    const isActive = form.riskLevel === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() =>
                          setForm((f) => ({ ...f, riskLevel: opt.value }))
                        }
                        className={cn(
                          "h-8 px-2.5 text-xs font-medium rounded-md border transition-all duration-150",
                          "flex items-center gap-1.5",
                          isActive
                            ? opt.activeClass
                            : cn(
                                "border-border text-muted-foreground",
                                opt.hoverClass
                              )
                        )}
                      >
                        <span
                          className={cn(
                            "h-2 w-2 rounded-full shrink-0",
                            opt.dotColor,
                            !isActive && "opacity-40"
                          )}
                        />
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="space-y-1">
              <Label htmlFor="inline-rule-description" className="text-xs">
                Business Context <span className="text-destructive">*</span>
              </Label>
              <Textarea
                id="inline-rule-description"
                value={form.description}
                onChange={(e) =>
                  setForm((f) => ({ ...f, description: e.target.value }))
                }
                rows={2}
                placeholder="Why this clause matters to the business and what risk it mitigates..."
                className="resize-none text-sm"
              />
            </div>
          </TabsContent>

          {/* Tab 2: Positions */}
          <TabsContent
            key={`positions-${animKey}`}
            value="positions"
            className={cn(
              "p-4 space-y-3",
              slideDirection.current === "left"
                ? "animate-tab-slide-left"
                : "animate-tab-slide-right"
            )}
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="inline-rule-standard" className="text-xs">
                  Standard Position
                </Label>
                <Textarea
                  id="inline-rule-standard"
                  value={form.standardPosition}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      standardPosition: e.target.value,
                    }))
                  }
                  rows={2}
                  placeholder="Our default position in negotiations..."
                  className="resize-none text-sm"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="inline-rule-range" className="text-xs">
                  Acceptable Range
                </Label>
                <Textarea
                  id="inline-rule-range"
                  value={form.acceptableRange}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      acceptableRange: e.target.value,
                    }))
                  }
                  rows={2}
                  placeholder="Range of terms we can accept..."
                  className="resize-none text-sm"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="inline-rule-escalation" className="text-xs">
                  Escalation Trigger
                </Label>
                <Textarea
                  id="inline-rule-escalation"
                  value={form.escalationTrigger}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      escalationTrigger: e.target.value,
                    }))
                  }
                  rows={2}
                  placeholder="When to escalate for senior review..."
                  className="resize-none text-sm"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="inline-rule-guidance" className="text-xs">
                  Negotiation Guidance
                </Label>
                <Textarea
                  id="inline-rule-guidance"
                  value={form.negotiationGuidance}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      negotiationGuidance: e.target.value,
                    }))
                  }
                  rows={2}
                  placeholder="How to negotiate this clause..."
                  className="resize-none text-sm"
                />
              </div>
            </div>
          </TabsContent>

          {/* Actions */}
        <div className="flex items-center justify-end gap-2 px-4 py-2.5 border-t">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onCancel}
            className="h-7 text-xs gap-1.5"
          >
            Cancel
          </Button>
          <Button type="submit" size="sm" className="h-7 text-xs gap-1.5">
            <Check className="h-3 w-3" />
            {isEditing ? "Update Rule" : "Add Rule"}
          </Button>
          </div>
        </Tabs>
      </form>
    </Card>
  );
}
