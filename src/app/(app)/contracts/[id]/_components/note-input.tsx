'use client';

/**
 * Note Input Component
 * Feature 006: Clause Decision Actions & Undo System (T068, T070)
 * 
 * Modal for adding internal notes to a clause without affecting status.
 */

import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

interface NoteInputProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clauseId: string;
  clauseName: string;
  findingId?: string;  // Feature 007: Optional finding ID for per-finding notes
  onNoteSaved: () => void;
}

export function NoteInput({
  open,
  onOpenChange,
  clauseId,
  clauseName,
  findingId,
  onNoteSaved,
}: NoteInputProps) {
  const [noteText, setNoteText] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // T070: Handle save note
  const handleSaveNote = async () => {
    if (!noteText.trim()) {
      toast.error('Please enter a note');
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch(`/api/clauses/${clauseId}/decisions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          actionType: 'ADD_NOTE',
          findingId: findingId || undefined,
          payload: {
            noteText: noteText.trim(),
          },
          clauseUpdatedAtWhenLoaded: new Date().toISOString(),
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to save note');
      }

      toast.success('Internal note saved');

      // Reset form
      setNoteText('');

      // Close modal
      onOpenChange(false);

      // Trigger parent refresh
      onNoteSaved();
    } catch (error) {
      console.error('Error saving note:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to save note');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Add Internal Note</DialogTitle>
          <DialogDescription>
            Add an internal note for <span className="font-semibold">{clauseName}</span>. This won't affect the clause status.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="noteText">Note *</Label>
            <Textarea
              id="noteText"
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              placeholder="Add context, follow-up items, or team notes..."
              className="min-h-[150px] resize-none"
              autoFocus
            />
            <p className="text-xs text-muted-foreground">
              This note will be visible to all team members in the decision history.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              setNoteText('');
              onOpenChange(false);
            }}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSaveNote}
            disabled={submitting || !noteText.trim()}
          >
            {submitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              'Save Note'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
