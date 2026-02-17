'use client';

/**
 * Escalate Modal Component
 * Feature 006: Clause Decision Actions & Undo System (T055, T057)
 * 
 * Modal for escalating a clause to a senior reviewer/approver.
 */

import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

// T055: Escalation reasons (from spec)
const ESCALATION_REASONS = [
  'Exceeds tolerance',
  'Commercial impact',
  'Regulatory',
  'Other',
] as const;

type EscalationReason = typeof ESCALATION_REASONS[number];

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
}

interface EscalateModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clauseId: string;
  clauseName: string;
  findingId?: string;  // Feature 007: Optional finding ID for per-finding escalation
  onEscalated: () => void;
}

export function EscalateModal({
  open,
  onOpenChange,
  clauseId,
  clauseName,
  findingId,
  onEscalated,
}: EscalateModalProps) {
  const [reason, setReason] = useState<EscalationReason | ''>('');
  const [comment, setComment] = useState('');
  const [assigneeId, setAssigneeId] = useState<string>('');
  const [approvers, setApprovers] = useState<User[]>([]);
  const [loadingApprovers, setLoadingApprovers] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // T055: Fetch approvers on mount
  useEffect(() => {
    if (open) {
      fetchApprovers();
    }
  }, [open]);

  const fetchApprovers = async () => {
    setLoadingApprovers(true);
    try {
      const response = await fetch('/api/users?permission=APPROVE_ESCALATIONS');
      if (!response.ok) {
        throw new Error('Failed to fetch approvers');
      }
      const data = await response.json();
      setApprovers(data.users || []);
    } catch (error) {
      console.error('Error fetching approvers:', error);
      toast.error('Failed to load approvers');
    } finally {
      setLoadingApprovers(false);
    }
  };

  // T057: Handle escalation confirmation
  const handleConfirmEscalate = async () => {
    // Validation
    if (!reason) {
      toast.error('Please select an escalation reason');
      return;
    }
    if (!comment.trim()) {
      toast.error('Please provide context for the escalation');
      return;
    }
    if (!assigneeId) {
      toast.error('Please select an approver');
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch(`/api/clauses/${clauseId}/decisions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          actionType: 'ESCALATE',
          findingId: findingId || undefined,
          payload: {
            reason,
            comment: comment.trim(),
            assigneeId,
          },
          clauseUpdatedAtWhenLoaded: new Date().toISOString(),
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to escalate clause');
      }

      const data = await response.json();

      // Check for conflict warning
      if (data.conflictWarning) {
        toast.warning(data.conflictWarning.message, { duration: 8000 });
      } else {
        const assignee = approvers.find((a) => a.id === assigneeId);
        toast.success(`Clause escalated to ${assignee?.name || 'approver'}`);
      }

      // Reset form
      setReason('');
      setComment('');
      setAssigneeId('');

      // Close modal
      onOpenChange(false);

      // Trigger parent refresh
      onEscalated();
    } catch (error) {
      console.error('Error escalating clause:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to escalate clause');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Escalate Clause</DialogTitle>
          <DialogDescription>
            Escalate <span className="font-semibold">{clauseName}</span> to a senior reviewer for decision.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Reason Dropdown */}
          <div className="space-y-2">
            <Label htmlFor="reason">Escalation Reason *</Label>
            <Select value={reason} onValueChange={(value) => setReason(value as EscalationReason)}>
              <SelectTrigger id="reason">
                <SelectValue placeholder="Select reason..." />
              </SelectTrigger>
              <SelectContent>
                {ESCALATION_REASONS.map((r) => (
                  <SelectItem key={r} value={r}>
                    {r}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Comment Textarea */}
          <div className="space-y-2">
            <Label htmlFor="comment">Context / Comment *</Label>
            <Textarea
              id="comment"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Explain why this clause needs escalation..."
              className="min-h-[100px] resize-none"
            />
          </div>

          {/* Assignee Dropdown */}
          <div className="space-y-2">
            <Label htmlFor="assignee">Assign To *</Label>
            {loadingApprovers ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading approvers...
              </div>
            ) : approvers.length === 0 ? (
              <div className="text-sm text-muted-foreground">
                No approvers available
              </div>
            ) : (
              <Select value={assigneeId} onValueChange={setAssigneeId}>
                <SelectTrigger id="assignee">
                  <SelectValue placeholder="Select approver..." />
                </SelectTrigger>
                <SelectContent>
                  {approvers.map((user) => (
                    <SelectItem key={user.id} value={user.id}>
                      {user.name} ({user.email})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button
            onClick={handleConfirmEscalate}
            disabled={submitting || !reason || !comment.trim() || !assigneeId}
          >
            {submitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Escalating...
              </>
            ) : (
              'Confirm Escalation'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
