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
    className: "bg-risk-green-soft text-risk-green border-risk-green-border",
    dotColor: "bg-risk-green",
  },
  MEDIUM: {
    label: "Medium",
    className: "bg-risk-yellow-soft text-risk-yellow border-risk-yellow-border",
    dotColor: "bg-risk-yellow",
  },
  HIGH: {
    label: "High",
    className: "bg-risk-red-soft text-risk-red border-risk-red-border",
    dotColor: "bg-risk-red",
  },
  CRITICAL: {
    label: "Critical",
    className: "bg-risk-red-soft text-risk-red border-risk-red-border",
    dotColor: "bg-risk-red",
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
        size === "sm" ? "px-2 py-0.5 text-xs" : "px-2.5 py-1 text-xs"
      )}
    >
      {showDot && (
        <span
          className={cn(
            "rounded-full shrink-0",
            dotColor,
            size === "sm" ? "h-2 w-2" : "h-2.5 w-2.5"
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
      return "border-l-risk-green";
    case "MEDIUM":
      return "border-l-risk-yellow";
    case "HIGH":
    case "CRITICAL":
      return "border-l-risk-red";
    default:
      return "border-l-border";
  }
}
