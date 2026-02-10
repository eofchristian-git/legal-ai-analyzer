"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  RiskLevelBadge,
  getRiskBorderColor,
} from "@/components/shared/risk-level-badge";
import { getCountryByCode } from "@/lib/countries";
import { CountryFlag } from "@/components/shared/country-flag";
import {
  ChevronRight,
  Edit2,
  Trash2,
  Target,
  Scale,
  AlertTriangle,
  MessageSquare,
  User,
  Clock,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { PlaybookRule } from "./types";

interface RuleCardProps {
  rule: PlaybookRule;
  isExpanded: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

export function RuleCard({
  rule,
  isExpanded,
  onToggle,
  onEdit,
  onDelete,
}: RuleCardProps) {
  const country = rule.country ? getCountryByCode(rule.country) : null;

  return (
    <Collapsible open={isExpanded} onOpenChange={onToggle}>
      <Card
        className={cn(
          "overflow-hidden border-l-4 py-0 gap-0 transition-all duration-200",
          getRiskBorderColor(rule.riskLevel),
          isExpanded ? "shadow-sm" : "hover:shadow-xs"
        )}
      >
        <CollapsibleTrigger asChild>
          <button
            className="w-full px-4 py-2 flex items-center justify-between hover:bg-accent/30 transition-colors text-left group/rule"
          >
            <div className="flex-1 min-w-0">
              {/* Title row */}
              <div className="flex items-center gap-2">
                <ChevronRight
                  className={cn(
                    "h-3.5 w-3.5 text-muted-foreground shrink-0 transition-transform duration-200",
                    isExpanded && "rotate-90"
                  )}
                />
                <span className="font-medium text-sm truncate">{rule.title}</span>
                <RiskLevelBadge level={rule.riskLevel} size="sm" />
                {country && (
                  <span className="flex items-center gap-1 text-xs shrink-0 text-muted-foreground">
                    <CountryFlag code={country.code} name={country.name} size="sm" />
                    {country.name}
                  </span>
                )}
              </div>

              {/* Business context preview — visible when collapsed */}
              {!isExpanded && (
                <p className="text-xs text-muted-foreground mt-0.5 ml-[22px] line-clamp-1">
                  {rule.description}
                </p>
              )}
            </div>

            <div className="flex items-center gap-0.5 shrink-0 ml-2">
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 text-muted-foreground hover:text-foreground"
                onClick={(e) => {
                  e.stopPropagation();
                  onEdit();
                }}
              >
                <Edit2 className="h-3 w-3" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 text-muted-foreground hover:text-destructive"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete();
                }}
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          </button>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <CardContent className="border-t bg-accent/10 px-5 pt-4 pb-5 space-y-5">
            {/* Business Context */}
            <p className="text-sm leading-relaxed text-foreground/90">
              {rule.description}
            </p>

            {/* Rule Details Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {[
                {
                  icon: Target,
                  iconColor: "text-blue-500",
                  label: "Standard Position",
                  value: rule.standardPosition,
                },
                {
                  icon: Scale,
                  iconColor: "text-emerald-500",
                  label: "Acceptable Range",
                  value: rule.acceptableRange,
                },
                {
                  icon: AlertTriangle,
                  iconColor: "text-amber-500",
                  label: "Escalation Trigger",
                  value: rule.escalationTrigger,
                },
                {
                  icon: MessageSquare,
                  iconColor: "text-violet-500",
                  label: "Negotiation Guidance",
                  value: rule.negotiationGuidance,
                },
              ].map(({ icon: Icon, iconColor, label, value }) => (
                <div key={label} className="rounded-lg border bg-background p-3.5">
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <Icon className={cn("h-3.5 w-3.5", iconColor)} />
                    <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                      {label}
                    </p>
                  </div>
                  <p className="text-sm leading-relaxed">{value}</p>
                </div>
              ))}
            </div>

            {/* Audit Footer */}
            <div className="flex items-center gap-4 pt-2 border-t text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <User className="h-3 w-3" />
                {rule.createdByName}
              </span>
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {new Date(rule.createdAt).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              </span>
            </div>
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}
