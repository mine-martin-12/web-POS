import React, { useEffect, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

interface ReasonDialogProps {
  open: boolean;
  busy: boolean;
  title?: string;
  initialReason?: string;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
}

/** Asks why a change is needed. The reason is required and stored with the request. */
export function ReasonDialog({ open, busy, title = "Why does this need changing?", initialReason = "", onCancel, onConfirm }: ReasonDialogProps) {
  const [reason, setReason] = useState(initialReason);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (open) {
      setReason(initialReason);
      setError(false);
    }
  }, [open, initialReason]);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (reason.trim().length < 3) {
      setError(true);
      return;
    }
    onConfirm(reason.trim());
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && !busy && onCancel()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription className="flex items-start gap-2">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            An admin will review this change. This reason will be logged for audit purposes.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4" noValidate>
          <div className="space-y-2">
            <Label htmlFor="change-reason" className={cn(error && "text-destructive")}>
              Reason
            </Label>
            <Textarea
              id="change-reason"
              rows={3}
              value={reason}
              onChange={(e) => {
                setReason(e.target.value);
                setError(false);
              }}
              placeholder="e.g. The customer returned one item"
              aria-invalid={error}
              className={cn(error && "border-destructive")}
              autoFocus
            />
            {error && <p className="text-sm font-medium text-destructive">Please explain the change (at least 3 characters).</p>}
          </div>
          <DialogFooter className="flex-col gap-2 sm:flex-row-reverse sm:justify-start sm:gap-2">
            <Button type="submit" disabled={busy} className="w-full sm:w-auto">
              {busy ? "Submitting…" : "Submit for approval"}
            </Button>
            <Button type="button" variant="outline" onClick={onCancel} disabled={busy} className="w-full sm:w-auto">
              Cancel
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
