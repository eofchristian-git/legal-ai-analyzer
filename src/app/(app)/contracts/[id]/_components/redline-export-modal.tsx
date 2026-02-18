'use client';

// Feature 008: Interactive Document Viewer & Redline Export
// Modal for selecting export format and triggering download (T042)

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
      const response = await fetch(`/api/contracts/${contractId}/export-redline`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ format }),
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Export failed');
      }

      // T056: Trigger file download
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `redline-${contractTitle.replace(/[^a-z0-9]/gi, '-').toLowerCase()}.${format}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast.success(`Redline exported as ${format.toUpperCase()}`);
      onOpenChange(false);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Export failed'
      );
    } finally {
      setExporting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle>Export Redline Document</DialogTitle>
          <DialogDescription>
            Generate a document with all tracked changes from this contract review.
            Deleted text will appear with strikethrough, inserted text with underline.
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          <p className="text-sm font-medium mb-3">Export format:</p>
          <div className="space-y-3">
            {(['docx', 'pdf'] as ExportFormat[]).map((fmt) => (
              <button
                key={fmt}
                type="button"
                onClick={() => setFormat(fmt)}
                className={cn(
                  'w-full flex items-start gap-3 p-3 border rounded-md text-left transition-colors',
                  format === fmt
                    ? 'border-primary bg-primary/5'
                    : 'hover:bg-muted/30 border-border'
                )}
              >
                <div
                  className={cn(
                    'mt-0.5 h-4 w-4 rounded-full border-2 flex-shrink-0',
                    format === fmt
                      ? 'border-primary bg-primary'
                      : 'border-muted-foreground/40'
                  )}
                >
                  {format === fmt && (
                    <div className="h-full w-full flex items-center justify-center">
                      <div className="h-1.5 w-1.5 rounded-full bg-white" />
                    </div>
                  )}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 font-medium text-sm">
                    {fmt === 'docx' ? (
                      <FileText className="h-4 w-4 text-blue-600" />
                    ) : (
                      <FileDown className="h-4 w-4 text-red-600" />
                    )}
                    {fmt === 'docx' ? 'Word Document (.docx)' : 'PDF Document (.pdf)'}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {fmt === 'docx'
                      ? 'Visual redline with strikethrough and underline formatting. Compatible with Microsoft Word.'
                      : 'Fixed-format redline. Best for sharing with external parties.'}
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
                Generating...
              </>
            ) : (
              <>
                <FileDown className="h-4 w-4" />
                Export {format.toUpperCase()}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
