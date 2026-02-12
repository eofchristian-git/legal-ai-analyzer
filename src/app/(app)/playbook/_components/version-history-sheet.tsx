"use client";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  RiskLevelBadge,
  getRiskBorderColor,
} from "@/components/shared/risk-level-badge";
import { History, Shield, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Snapshot, SnapshotDetail } from "./types";

interface VersionHistorySheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  snapshots: Snapshot[];
  viewingSnapshot: SnapshotDetail | null;
  currentVersion: number;
  onViewSnapshot: (version: number) => void;
  onRestore: (version: number) => void;
}

export function VersionHistorySheet({
  open,
  onOpenChange,
  snapshots,
  viewingSnapshot,
  currentVersion,
  onViewSnapshot,
  onRestore,
}: VersionHistorySheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-[440px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            Version History
          </SheetTitle>
        </SheetHeader>
        <div className="mt-6">
          {snapshots.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted/60 mb-3">
                <Shield className="h-6 w-6 text-muted-foreground/50" />
              </div>
              <p className="text-sm text-muted-foreground">
                No versions saved yet.
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Click &ldquo;Save Playbook&rdquo; to create the first snapshot.
              </p>
            </div>
          ) : (
            <div className="relative">
              <div className="absolute left-[19px] top-3 bottom-3 w-px bg-border" />

              <div className="space-y-1">
                {snapshots.map((s, idx) => {
                  const isCurrent = s.version === currentVersion;
                  const isFirst = idx === 0;

                  return (
                    <div key={s.id}>
                      <div
                        className={cn(
                          "relative pl-10 py-3 pr-4 rounded-lg cursor-pointer transition-all",
                          isCurrent
                            ? "bg-blue-50 border border-blue-200/80"
                            : "hover:bg-accent/50"
                        )}
                        onClick={() => onViewSnapshot(s.version)}
                      >
                        <div
                          className={cn(
                            "absolute left-3 top-4.5 h-3 w-3 rounded-full border-2",
                            isCurrent
                              ? "bg-blue-600 border-blue-300"
                              : isFirst
                                ? "bg-foreground border-muted-foreground/30"
                                : "bg-muted-foreground/40 border-muted-foreground/20"
                          )}
                        />

                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-sm">
                                v{s.version}
                              </span>
                              {isCurrent && (
                                <Badge className="bg-blue-600 text-white text-[10px] px-1.5 py-0">
                                  CURRENT
                                </Badge>
                              )}
                            </div>
                            <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground">
                              <span>
                                {new Date(s.createdAt).toLocaleDateString(
                                  "en-US",
                                  {
                                    month: "short",
                                    day: "numeric",
                                    year: "numeric",
                                  }
                                )}
                              </span>
                              <span>·</span>
                              <span>{s.createdByName}</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="text-xs text-muted-foreground">
                              {s.ruleCount} rules
                            </span>
                            {!isCurrent && (
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 text-xs gap-1"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onRestore(s.version);
                                }}
                              >
                                <RotateCcw className="h-3 w-3" />
                                Restore
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>

                      {viewingSnapshot &&
                        viewingSnapshot.version === s.version && (
                          <div className="ml-10 mr-4 mt-1 mb-2 space-y-1.5">
                            {viewingSnapshot.rules.map((r) => (
                              <div
                                key={r.id}
                                className={cn(
                                  "border-l-3 rounded-r-md border bg-background p-3 text-sm",
                                  getRiskBorderColor(r.riskLevel)
                                )}
                              >
                                <div className="flex items-center gap-2 mb-0.5">
                                  <span className="font-medium text-xs">
                                    {r.title}
                                  </span>
                                  <RiskLevelBadge
                                    level={r.riskLevel}
                                    size="sm"
                                  />
                                  {r.groupName && (
                                    <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                                      {r.groupName}
                                    </span>
                                  )}
                                </div>
                                <p className="text-muted-foreground text-xs leading-relaxed">
                                  {r.standardPosition || r.description}
                                </p>
                              </div>
                            ))}
                          </div>
                        )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
