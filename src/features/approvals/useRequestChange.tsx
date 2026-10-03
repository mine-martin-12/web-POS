import React, { useCallback, useState } from "react";
import { toast } from "sonner";
import { getErrorMessage } from "@/lib/errors";
import { ReasonDialog } from "./components/ReasonDialog";
import { useSubmitChange } from "./hooks";
import type { ChangeTable } from "./types";

interface PendingRequest {
  table: ChangeTable;
  recordId: string;
  values: Record<string, unknown>;
  onDone?: () => void;
}

/**
 * For people who can't edit records directly: turns an edit into a change request.
 * Render `dialog` once; call `request(...)` with the changed fields.
 */
export function useRequestChange() {
  const submit = useSubmitChange();
  const [pending, setPending] = useState<PendingRequest | null>(null);

  const request = useCallback((input: PendingRequest) => setPending(input), []);

  const dialog = (
    <ReasonDialog
      open={pending !== null}
      busy={submit.isPending}
      onCancel={() => setPending(null)}
      onConfirm={async (reason) => {
        if (!pending) return;
        try {
          await submit.mutateAsync({ table: pending.table, recordId: pending.recordId, values: pending.values, reason });
          toast.success("Change requested", { description: "An admin will review it. You'll see the outcome in Approvals." });
          pending.onDone?.();
          setPending(null);
        } catch (error) {
          toast.error("Couldn't submit the request", { description: getErrorMessage(error) });
        }
      }}
    />
  );

  return { request, dialog };
}
