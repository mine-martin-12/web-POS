import React, { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { DateField } from "@/components/common/DateField";
import { PAYMENT_METHOD_LABELS } from "@/features/sales/types";
import { getErrorMessage } from "@/lib/errors";
import { useResubmitChange } from "../hooks";
import { CHANGE_FIELDS, formatChangeValue, type Lookups } from "../lib";
import type { ChangeRequest } from "../types";

/** "Edit & resubmit": the requester adjusts the requested values after feedback. */
export function ResubmitDialog({
  change,
  lookups,
  onOpenChange,
}: {
  change: ChangeRequest | null;
  lookups: Lookups;
  onOpenChange: (open: boolean) => void;
}) {
  const resubmit = useResubmitChange();
  const [values, setValues] = useState<Record<string, string>>({});
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (!change) return;
    setValues(Object.fromEntries(Object.entries(change.new_values).map(([k, v]) => [k, v == null ? "" : String(v)])));
    setReason(change.reason);
  }, [change]);

  if (!change) return null;
  const fields = CHANGE_FIELDS[change.table_name];

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (reason.trim().length < 3) {
      toast.error("Please give a reason for the change");
      return;
    }
    const typed: Record<string, unknown> = {};
    for (const [key, raw] of Object.entries(values)) {
      const kind = fields[key]?.kind;
      typed[key] = kind === "number" || kind === "money" ? Number(raw) : raw === "" ? null : raw;
    }
    try {
      await resubmit.mutateAsync({ id: change.id, values: typed, reason: reason.trim() });
      toast.success("Request resubmitted", { description: "It's back in the review queue." });
      onOpenChange(false);
    } catch (error) {
      toast.error("Couldn't resubmit", { description: getErrorMessage(error) });
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !resubmit.isPending && onOpenChange(open)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit &amp; resubmit</DialogTitle>
          <DialogDescription>Admin feedback: {change.admin_note}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4" noValidate>
          {Object.keys(values).map((key) => {
            const field = fields[key];
            const id = `resubmit-${key}`;
            const set = (v: string) => setValues((prev) => ({ ...prev, [key]: v }));
            return (
              <div key={key} className="space-y-2">
                <Label htmlFor={id}>{field?.label ?? key}</Label>
                {field?.kind === "date" ? (
                  <DateField id={id} value={values[key]} onChange={set} />
                ) : field?.kind === "method" ? (
                  <Select value={values[key]} onValueChange={set}>
                    <SelectTrigger id={id}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(["cash", "mpesa", "bank_cheque"] as const).map((m) => (
                        <SelectItem key={m} value={m}>
                          {PAYMENT_METHOD_LABELS[m]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : field?.kind === "product" || field?.kind === "customer" ? (
                  <p id={id} className="rounded-md border bg-muted px-3 py-2 text-sm">
                    {formatChangeValue(change.table_name, key, values[key], lookups)}
                  </p>
                ) : (
                  <Input
                    id={id}
                    type={field?.kind === "number" || field?.kind === "money" ? "number" : "text"}
                    step={field?.kind === "money" ? "0.01" : field?.kind === "number" ? 1 : undefined}
                    value={values[key]}
                    onChange={(e) => set(e.target.value)}
                  />
                )}
              </div>
            );
          })}
          <div className="space-y-2">
            <Label htmlFor="resubmit-reason">Reason</Label>
            <Textarea id="resubmit-reason" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
            <p className="text-xs text-muted-foreground">This reason will be logged for audit purposes.</p>
          </div>
          <DialogFooter className="flex-col gap-2 sm:flex-row-reverse sm:justify-start sm:gap-2">
            <Button type="submit" disabled={resubmit.isPending} className="w-full sm:w-auto">
              {resubmit.isPending ? "Submitting…" : "Resubmit"}
            </Button>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={resubmit.isPending} className="w-full sm:w-auto">
              Cancel
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
