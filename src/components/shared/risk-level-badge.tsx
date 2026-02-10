import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface RiskLevelBadgeProps {
  level: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  size?: "sm" | "md";
  showDot?: boolean;
}

const config = {
  LOW: {
    label: "Low",
    className: "bg-emerald-50 text-emerald-700 border-emerald-200/60",
    dotColor: "bg-emerald-500",
  },
  MEDIUM: {
    label: "Medium",
    className: "bg-amber-50 text-amber-700 border-amber-200/60",
    dotColor: "bg-amber-500",
  },
  HIGH: {
    label: "High",
    className: "bg-orange-50 text-orange-700 border-orange-200/60",
    dotColor: "bg-orange-500",
  },
  CRITICAL: {
    label: "Critical",
    className: "bg-red-50 text-red-700 border-red-200/60",
    dotColor: "bg-red-500",
  },
};

export function RiskLevelBadge({
  level,
  size = "md",
  showDot = true,
}: RiskLevelBadgeProps) {
  const { label, className, dotColor } = config[level];

  return (
    <Badge
      variant="outline"
      className={cn(
        "font-medium gap-1.5",
        className,
        size === "sm" ? "px-1.5 py-0 text-[11px]" : "px-2 py-0.5 text-xs"
      )}
    >
      {showDot && (
        <span
          className={cn(
            "rounded-full shrink-0",
            dotColor,
            size === "sm" ? "h-1.5 w-1.5" : "h-2 w-2"
          )}
        />
      )}
      {label}
    </Badge>
  );
}

export function getRiskBorderColor(level: string) {
  switch (level) {
    case "LOW":
      return "border-l-emerald-400";
    case "MEDIUM":
      return "border-l-amber-400";
    case "HIGH":
      return "border-l-orange-400";
    case "CRITICAL":
      return "border-l-red-400";
    default:
      return "border-l-border";
  }
}
