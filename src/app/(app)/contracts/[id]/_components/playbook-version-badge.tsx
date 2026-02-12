"use client";

import { Badge } from "@/components/ui/badge";
import { AlertTriangle, BookOpen } from "lucide-react";

interface PlaybookVersionBadgeProps {
  playbookVersion: number | null;
  currentPlaybookVersion: number | null;
}

export function PlaybookVersionBadge({
  playbookVersion,
  currentPlaybookVersion,
}: PlaybookVersionBadgeProps) {
  if (playbookVersion == null) {
    return (
      <Badge variant="secondary" className="gap-1 text-xs">
        <BookOpen className="h-3 w-3" />
        Standard review (no playbook)
      </Badge>
    );
  }

  const isStale =
    currentPlaybookVersion != null &&
    currentPlaybookVersion > playbookVersion;

  if (isStale) {
    return (
      <Badge
        variant="outline"
        className="gap-1 text-xs bg-amber-50 text-amber-800 border-amber-200"
      >
        <AlertTriangle className="h-3 w-3" />
        Playbook v{playbookVersion} (updated to v{currentPlaybookVersion} —
        consider re-analyzing)
      </Badge>
    );
  }

  return (
    <Badge variant="outline" className="gap-1 text-xs">
      <BookOpen className="h-3 w-3" />
      Reviewed against Playbook v{playbookVersion}
    </Badge>
  );
}
