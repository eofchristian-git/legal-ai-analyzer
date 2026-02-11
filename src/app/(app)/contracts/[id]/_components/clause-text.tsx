"use client";

import { ScrollArea } from "@/components/ui/scroll-area";
import { FileText } from "lucide-react";
import type { Clause } from "./types";

interface ClauseTextProps {
  clause: Clause | null;
}

export function ClauseText({ clause }: ClauseTextProps) {
  if (!clause) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2">
        <FileText className="h-8 w-8" />
        <p className="text-sm">Select a clause to view its text</p>
      </div>
    );
  }

  return (
    <ScrollArea className="h-full">
      <div className="p-4 space-y-3">
        <h3 className="text-base font-semibold">
          {clause.clauseNumber
            ? `${clause.clauseNumber} — ${clause.clauseName}`
            : `${clause.position}. ${clause.clauseName}`}
        </h3>
        <div className="text-sm leading-relaxed text-foreground/90 whitespace-pre-wrap">
          {clause.clauseText}
        </div>
      </div>
    </ScrollArea>
  );
}
