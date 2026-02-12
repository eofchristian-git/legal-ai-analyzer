import { Badge } from "@/components/ui/badge";
import { CheckCircle2, AlertTriangle, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface SeverityBadgeProps {
  severity: "GREEN" | "YELLOW" | "RED" | "ORANGE";
  size?: "sm" | "md";
}

const config = {
  GREEN: {
    label: "Low",
    icon: CheckCircle2,
    className: "bg-risk-green-soft text-risk-green border-risk-green-border",
  },
  YELLOW: {
    label: "Medium",
    icon: AlertTriangle,
    className: "bg-risk-yellow-soft text-risk-yellow border-risk-yellow-border",
  },
  ORANGE: {
    label: "Medium",
    icon: AlertTriangle,
    className: "bg-risk-yellow-soft text-risk-yellow border-risk-yellow-border",
  },
  RED: {
    label: "High",
    icon: AlertCircle,
    className: "bg-risk-red-soft text-risk-red border-risk-red-border",
  },
};

export function SeverityBadge({ severity, size = "md" }: SeverityBadgeProps) {
  const { label, icon: Icon, className } = config[severity];

  return (
    <Badge
      variant="outline"
      className={cn(
        className,
        size === "sm" ? "px-2 py-0.5 text-xs" : "px-2.5 py-1 text-sm"
      )}
    >
      <Icon className={cn(size === "sm" ? "mr-1 h-3.5 w-3.5" : "mr-1.5 h-4 w-4")} />
      {label}
    </Badge>
  );
}
