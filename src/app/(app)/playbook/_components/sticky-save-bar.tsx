"use client";

import { Button } from "@/components/ui/button";
import { AlertTriangle, Loader2, Save, Undo2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface StickySaveBarProps {
  isDirty: boolean;
  changeSummary: string | null;
  saving: boolean;
  onSave: () => void;
  onDiscard: () => void;
}

export function StickySaveBar({
  isDirty,
  changeSummary,
  saving,
  onSave,
  onDiscard,
}: StickySaveBarProps) {
  return (
    <div
      className={cn(
        "fixed bottom-0 right-0 left-0 z-40 transition-all duration-300 ease-in-out",
        isDirty
          ? "translate-y-0 opacity-100"
          : "translate-y-full opacity-0 pointer-events-none"
      )}
    >
      <div className="bg-background/80 backdrop-blur-lg border-t shadow-lg">
        <div className="flex items-center justify-between px-8 py-3">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-100">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
            </div>
            <div>
              <p className="text-sm font-medium">Unsaved changes</p>
              {changeSummary && (
                <p className="text-xs text-muted-foreground">
                  {changeSummary}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={onDiscard}
              className="gap-1.5"
            >
              <Undo2 className="h-3.5 w-3.5" />
              Discard
            </Button>
            <Button
              size="sm"
              onClick={onSave}
              disabled={saving}
              className="gap-1.5"
            >
              {saving ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Save className="h-3.5 w-3.5" />
              )}
              Save Playbook
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
