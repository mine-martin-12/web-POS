import type { ApprovalsApi } from "@/features/approvals/api";
import { toMemberNames } from "@/features/approvals/api.supabase";
import type { ChangeDecision, ChangeRequest, ChangeTable } from "@/features/approvals/types";
import { asActor, callRpc, rows } from "../db/engine";

type Row = ReturnType<ApprovalsApi["submitChange"]>;

export const approvals = {
  fetchChangeRequests() {
    // Admins get every request in the business; staff get their own (RLS).
    return asActor((tx) => rows<ChangeRequest>(tx, "SELECT * FROM public.pending_updates ORDER BY requested_at DESC, id"));
  },

  async fetchMemberNames() {
    const result = await asActor((tx) =>
      rows<{ user_id: string; first_name: string; last_name: string }>(tx, "SELECT user_id, first_name, last_name FROM public.profiles"),
    );
    return toMemberNames(result);
  },

  submitChange(input: { table: ChangeTable; recordId: string; values: Record<string, unknown>; reason: string }) {
    return asActor((tx) =>
      callRpc(
        tx,
        "submit_change",
        { _table: input.table, _record_id: input.recordId, _new_values: input.values, _reason: input.reason },
        "row",
      ),
    ) as Row;
  },

  resubmitChange(input: { id: string; values: Record<string, unknown>; reason: string }) {
    return asActor((tx) =>
      callRpc(tx, "resubmit_change", { _id: input.id, _new_values: input.values, _reason: input.reason }, "row"),
    ) as Row;
  },

  reviewChange(input: { id: string; decision: ChangeDecision; note?: string }) {
    return asActor((tx) =>
      callRpc(tx, "review_change", { _id: input.id, _decision: input.decision, _note: input.note || undefined }, "row"),
    ) as Row;
  },

  archiveChange(input: { id: string; archived: boolean }) {
    return asActor((tx) => callRpc(tx, "archive_change", { _id: input.id, _archived: input.archived }, "row")) as Row;
  },

  async countApprovalsBadge(input: { reviewer: boolean; userId: string }) {
    const [{ n }] = await asActor((tx) =>
      input.reviewer
        ? rows<{ n: number }>(tx, "SELECT count(*)::int AS n FROM public.pending_updates WHERE status = 'pending'")
        : rows<{ n: number }>(
            tx,
            "SELECT count(*)::int AS n FROM public.pending_updates WHERE status = 'sent_back_for_review' AND requested_by = $1",
            [input.userId],
          ),
    );
    return n;
  },
} satisfies ApprovalsApi;
