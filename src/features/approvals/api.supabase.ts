import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { fetchAll } from "@/lib/fetchAll";
import type { ChangeDecision, ChangeRequest, ChangeTable } from "./types";

/** Admins get every request in the business; staff get their own (RLS). */
export async function fetchChangeRequests(): Promise<ChangeRequest[]> {
  const rows = await fetchAll<Tables<"pending_updates">>(() =>
    supabase.from("pending_updates").select("*").order("requested_at", { ascending: false }).order("id"),
  );
  // old_values/new_values are JSON objects of field → value (see submit_change()).
  return rows as unknown as ChangeRequest[];
}

export async function fetchMemberNames(): Promise<Map<string, string>> {
  const { data, error } = await supabase.from("profiles").select("user_id, first_name, last_name");
  if (error) throw error;
  return toMemberNames(data ?? []);
}

export function toMemberNames(rows: Array<{ user_id: string; first_name: string; last_name: string }>) {
  return new Map(rows.map((p) => [p.user_id, `${p.first_name} ${p.last_name}`.trim()]));
}

export async function submitChange(input: { table: ChangeTable; recordId: string; values: Record<string, unknown>; reason: string }) {
  const { data, error } = await supabase.rpc("submit_change", {
    _table: input.table,
    _record_id: input.recordId,
    _new_values: input.values as never,
    _reason: input.reason,
  });
  if (error) throw error;
  return data;
}

export async function resubmitChange(input: { id: string; values: Record<string, unknown>; reason: string }) {
  const { data, error } = await supabase.rpc("resubmit_change", {
    _id: input.id,
    _new_values: input.values as never,
    _reason: input.reason,
  });
  if (error) throw error;
  return data;
}

export async function reviewChange(input: { id: string; decision: ChangeDecision; note?: string }) {
  const { data, error } = await supabase.rpc("review_change", {
    _id: input.id,
    _decision: input.decision,
    _note: input.note || undefined,
  });
  if (error) throw error;
  return data;
}

export async function archiveChange(input: { id: string; archived: boolean }) {
  const { data, error } = await supabase.rpc("archive_change", { _id: input.id, _archived: input.archived });
  if (error) throw error;
  return data;
}

/** Sidebar badge. Reviewers: requests waiting for review. Requesters: their requests sent back. */
export async function countApprovalsBadge(input: { reviewer: boolean; userId: string }): Promise<number> {
  let query = supabase.from("pending_updates").select("id", { count: "exact", head: true });
  query = input.reviewer
    ? query.eq("status", "pending")
    : query.eq("status", "sent_back_for_review").eq("requested_by", input.userId);
  const { count, error } = await query;
  if (error) throw error;
  return count ?? 0;
}
