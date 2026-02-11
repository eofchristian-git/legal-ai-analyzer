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
    className: "bg-emerald-50 text-emerald-700 border-emerald-200",
  },
  YELLOW: {
    label: "Medium",
    icon: AlertTriangle,
    className: "bg-amber-50 text-amber-700 border-amber-200",
  },
  ORANGE: {
    label: "Medium",
    icon: AlertTriangle,
    className: "bg-orange-50 text-orange-700 border-orange-200",
  },
  RED: {
    label: "High",
    icon: AlertCircle,
    className: "bg-red-50 text-red-700 border-red-200",
  },
};

export function SeverityBadge({ severity, size = "md" }: SeverityBadgeProps) {
  const { label, icon: Icon, className } = config[severity];

  return (
    <Badge
      variant="outline"
      className={cn(
        className,
        size === "sm" ? "px-1.5 py-0 text-xs" : "px-2 py-0.5 text-sm"
      )}
    >
      <Icon className={cn(size === "sm" ? "mr-1 h-3 w-3" : "mr-1.5 h-3.5 w-3.5")} />
      {label}
    </Badge>
  );
}
