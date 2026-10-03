import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { fetchAll } from "@/lib/fetchAll";
import { invokeFunction } from "@/lib/functions";

export type SmsTemplate = Tables<"sms_templates">;
export type SmsMessage = Tables<"sms_messages">;
export type Audience = "all" | "owing" | "overdue";

export interface SendResult {
  sent: number;
  failed: number;
  recipients?: number;
}

export async function fetchMessages(sinceIso: string): Promise<SmsMessage[]> {
  return fetchAll<SmsMessage>(() =>
    supabase.from("sms_messages").select("*").gte("created_at", sinceIso).order("created_at", { ascending: false }).order("id"),
  );
}

export async function fetchTemplates(): Promise<SmsTemplate[]> {
  const { data, error } = await supabase.from("sms_templates").select("*").order("name");
  if (error) throw error;
  return data ?? [];
}

export async function saveTemplate(input: { id?: string; name: string; body: string }): Promise<void> {
  const { error } = input.id
    ? await supabase.from("sms_templates").update({ name: input.name, body: input.body }).eq("id", input.id)
    : await supabase.from("sms_templates").insert({ name: input.name, body: input.body });
  if (error) throw error;
}

export async function deleteTemplate(id: string): Promise<void> {
  const { error } = await supabase.from("sms_templates").delete().eq("id", id);
  if (error) throw error;
}

export async function fetchAudience(audience: Audience): Promise<Array<{ customer_id: string; name: string }>> {
  const { data, error } = await supabase.rpc("sms_audience", { _audience: audience });
  if (error) throw error;
  return data ?? [];
}

export const sendSms = (input: { customerIds: string[]; message: string; broadcast?: boolean }) =>
  invokeFunction<SendResult>("send-sms", { action: "send", ...input });

export const retrySms = (messageIds: string[]) => invokeFunction<SendResult>("send-sms", { action: "retry", messageIds });

export const sendOverdueReminders = (message: string) =>
  invokeFunction<SendResult>("send-sms", { action: "overdue_reminders", message });
