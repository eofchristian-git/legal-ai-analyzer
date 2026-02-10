"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const LEVELS = [
  {
    value: "LOW",
    label: "Low",
    activeClass: "bg-emerald-500 text-white border-emerald-500 hover:bg-emerald-600",
    inactiveClass: "text-emerald-700 border-emerald-300 hover:bg-emerald-50",
  },
  {
    value: "MEDIUM",
    label: "Medium",
    activeClass: "bg-amber-500 text-white border-amber-500 hover:bg-amber-600",
    inactiveClass: "text-amber-700 border-amber-300 hover:bg-amber-50",
  },
  {
    value: "HIGH",
    label: "High",
    activeClass: "bg-orange-500 text-white border-orange-500 hover:bg-orange-600",
    inactiveClass: "text-orange-700 border-orange-300 hover:bg-orange-50",
  },
  {
    value: "CRITICAL",
    label: "Critical",
    activeClass: "bg-red-500 text-white border-red-500 hover:bg-red-600",
    inactiveClass: "text-red-700 border-red-300 hover:bg-red-50",
  },
] as const;

interface RiskLevelPillsProps {
  value: string;
  onChange: (value: string) => void;
}

export function RiskLevelPills({ value, onChange }: RiskLevelPillsProps) {
  return (
    <div className="flex items-center gap-1.5">
      {LEVELS.map((level) => {
        const isActive = value === level.value;
        return (
          <Button
            key={level.value}
            variant="outline"
            size="sm"
            className={cn(
              "h-8 px-3 text-xs font-medium transition-all",
              isActive ? level.activeClass : level.inactiveClass
            )}
            onClick={() => onChange(isActive ? "" : level.value)}
          >
            {level.label}
          </Button>
        );
      })}
    </div>
  );
}
