'use client';

// Feature 012: Original-File Export with Track Changes
// Replaces Feature 008 reconstructed DOCX export (T031)

import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Loader2, FileText, FileDown } from 'lucide-react';
import { toast } from 'sonner';

interface RedlineExportModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contractId: string;
  contractTitle: string;
}

type ExportFormat = 'docx' | 'pdf';

interface ExportOption {
  fmt: ExportFormat;
  label: string;
  description: string;
  icon: React.ReactNode;
}

const EXPORT_OPTIONS: ExportOption[] = [
  {
    fmt: 'docx',
    label: 'Original with Changes (.docx)',
    description:
      'Original file with native Word Track Changes (Accept/Reject) and margin comments. Author: Legal AI Analyzer.',
    icon: <FileText className="h-4 w-4 text-blue-600" />,
  },
  {
    fmt: 'pdf',
    label: 'Annotated PDF (.pdf)',
    description:
      'PDF with risk highlights, strikethrough on replaced text, and note annotations baked in. Opens in any PDF reader.',
    icon: <FileDown className="h-4 w-4 text-red-600" />,
  },
];

export function RedlineExportModal({
  open,
  onOpenChange,
  contractId,
  contractTitle,
}: RedlineExportModalProps) {
  const [format, setFormat] = useState<ExportFormat>('docx');
  const [exporting, setExporting] = useState(false);

  async function handleExport() {
    setExporting(true);
    try {
      // Feature 012: Use new export-modified endpoint
      const url = `/api/contracts/${contractId}/export-modified?format=${format}`;
      const response = await fetch(url);

      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: 'Export failed' }));
        throw new Error(err.error || 'Export failed');
      }

      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objectUrl;
      const safeTitle = contractTitle.replace(/[^a-z0-9]/gi, '-').toLowerCase();
      a.download = `${safeTitle}-reviewed.${format}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(objectUrl);

      toast.success(`Document exported as ${format.toUpperCase()}`);
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Export failed');
    } finally {
      setExporting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle>Export Contract with Changes</DialogTitle>
          <DialogDescription>
            Export the original document with all applied triage decisions as track changes and comments.
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          <p className="text-sm font-medium mb-3">Export format:</p>
          <div className="space-y-3">
            {EXPORT_OPTIONS.map((option) => (
              <button
                key={option.fmt}
                type="button"
                onClick={() => setFormat(option.fmt)}
                className={cn(
                  'w-full flex items-start gap-3 p-3 border rounded-md text-left transition-colors',
                  format === option.fmt
                    ? 'border-primary bg-primary/5'
                    : 'hover:bg-muted/30 border-border'
                )}
              >
                <div
                  className={cn(
                    'mt-0.5 h-4 w-4 rounded-full border-2 flex-shrink-0',
                    format === option.fmt
                      ? 'border-primary bg-primary'
                      : 'border-muted-foreground/40'
                  )}
                >
                  {format === option.fmt && (
                    <div className="h-full w-full flex items-center justify-center">
                      <div className="h-1.5 w-1.5 rounded-full bg-white" />
                    </div>
                  )}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 font-medium text-sm">
                    {option.icon}
                    {option.label}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {option.description}
                  </p>
                </div>
              </button>
            ))}
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={exporting}
          >
            Cancel
          </Button>
          <Button onClick={handleExport} disabled={exporting} className="gap-2">
            {exporting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Generating…
              </>
            ) : (
              <>
                <FileDown className="h-4 w-4" />
                Export {format === 'docx' ? 'DOCX' : 'PDF'}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
