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
  return new Map((data ?? []).map((p) => [p.user_id, `${p.first_name} ${p.last_name}`.trim()]));
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
