import {
  Shield,
  ShieldCheck,
  Briefcase,
  Settings,
  Clock,
  Landmark,
  FileStack,
  type LucideIcon,
} from "lucide-react";

interface GroupIconConfig {
  icon: LucideIcon;
  color: string;
  bg: string;
}

const GROUP_ICON_MAP: Record<string, GroupIconConfig> = {
  "core-legal": {
    icon: Shield,
    color: "text-blue-600",
    bg: "bg-blue-100",
  },
  compliance: {
    icon: ShieldCheck,
    color: "text-emerald-600",
    bg: "bg-emerald-100",
  },
  commercial: {
    icon: Briefcase,
    color: "text-violet-600",
    bg: "bg-violet-100",
  },
  operational: {
    icon: Settings,
    color: "text-orange-600",
    bg: "bg-orange-100",
  },
  "contract-lifecycle": {
    icon: Clock,
    color: "text-cyan-600",
    bg: "bg-cyan-100",
  },
  "legal-framework": {
    icon: Landmark,
    color: "text-indigo-600",
    bg: "bg-indigo-100",
  },
  boilerplate: {
    icon: FileStack,
    color: "text-slate-500",
    bg: "bg-slate-100",
  },
};

const DEFAULT_CONFIG: GroupIconConfig = {
  icon: FileStack,
  color: "text-muted-foreground",
  bg: "bg-muted",
};

export function getGroupIconConfig(slug: string): GroupIconConfig {
  return GROUP_ICON_MAP[slug] || DEFAULT_CONFIG;
}
