// Admin-only customer SMS via Africa's Talking.
//
//   { action: "send", customerIds: string[], message: string, broadcast?: boolean }
//   { action: "retry", messageIds: string[] }
//   { action: "overdue_reminders", message: string }
//
// Anti-spam: recipients are ONLY ever customers of the caller's business (by id; raw
// phone numbers are never accepted), numbers are de-duplicated, and every message is
// logged in sms_messages with its delivery status.
//
// Secrets: AT_USERNAME, AT_API_KEY, optional AT_SENDER_ID, optional AT_SANDBOX=true.
import { requireAdmin, type Caller } from "../_shared/auth.ts";
import { HttpError, json, requireString, serve } from "../_shared/http.ts";
import { renderTemplate, SMS_MAX_LENGTH } from "../_shared/template.ts";

const MAX_RECIPIENTS = 500;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface Recipient {
  customerId: string;
  name: string;
  phone: string;
  amountDue: number;
  dueDate: string | null;
}

serve(async (req, body) => {
  const caller = await requireAdmin(req);
  const action = requireString(body, "action");

  if (action === "send") {
    const message = requireMessage(body);
    const ids = requireIds(body.customerIds, "customerIds");
    const recipients = await loadRecipients(caller, ids);
    const broadcastId = body.broadcast === true ? crypto.randomUUID() : null;
    const result = await deliver(caller, recipients, message, broadcastId ? "broadcast" : "manual", broadcastId);
    return json(req, result);
  }

  if (action === "retry") {
    const ids = requireIds(body.messageIds, "messageIds");
    const { data, error } = await caller.admin
      .from("sms_messages")
      .select("id, phone, body")
      .eq("business_id", caller.businessId)
      .eq("status", "failed")
      .in("id", ids);
    if (error) throw error;
    let sent = 0;
    let failed = 0;
    for (const m of data ?? []) {
      const outcome = await sendOne(m.phone, m.body);
      await caller.admin
        .from("sms_messages")
        .update({ status: outcome.ok ? "sent" : "failed", error: outcome.error, provider_message_id: outcome.messageId })
        .eq("id", m.id);
      if (outcome.ok) sent++;
      else failed++;
    }
    return json(req, { sent, failed, skipped: 0 });
  }

  if (action === "overdue_reminders") {
    const message = requireMessage(body);
    const tz = await businessTimezone(caller);
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date());
    const { data: credits, error } = await caller.admin
      .from("credits")
      .select("id, customer_id")
      .eq("business_id", caller.businessId)
      .neq("status", "paid")
      .is("reminder_sent_at", null)
      .lt("due_date", today)
      .not("customer_id", "is", null);
    if (error) throw error;
    const customerIds = [...new Set((credits ?? []).map((c) => c.customer_id as string))];
    const recipients = customerIds.length ? await loadRecipients(caller, customerIds) : [];
    const result = await deliver(caller, recipients, message, "reminder", null);
    // Side effect runs once: mark every credit we reminded about.
    const reminded = new Set(result.sentCustomerIds);
    const creditIds = (credits ?? []).filter((c) => reminded.has(c.customer_id as string)).map((c) => c.id);
    if (creditIds.length) {
      await caller.admin.from("credits").update({ reminder_sent_at: new Date().toISOString() }).in("id", creditIds);
    }
    return json(req, result);
  }

  throw new HttpError(400, "Unknown action");
});

function requireMessage(body: Record<string, unknown>): string {
  const message = requireString(body, "message", "Message");
  if (message.length > SMS_MAX_LENGTH) throw new HttpError(400, `Messages are limited to ${SMS_MAX_LENGTH} characters`);
  return message;
}

function requireIds(value: unknown, name: string): string[] {
  if (!Array.isArray(value) || value.length === 0) throw new HttpError(400, `Choose at least one recipient`);
  const ids = [...new Set(value.filter((v): v is string => typeof v === "string" && UUID.test(v)))];
  if (ids.length === 0) throw new HttpError(400, `Invalid ${name}`);
  if (ids.length > MAX_RECIPIENTS) throw new HttpError(400, `Send to at most ${MAX_RECIPIENTS} people at a time`);
  return ids;
}

async function businessTimezone(caller: Caller): Promise<string> {
  const { data } = await caller.admin.from("businesses").select("timezone").eq("id", caller.businessId).single();
  return (data?.timezone as string) ?? "Africa/Nairobi";
}

/** Only customers of this business with a phone; one recipient per phone number. */
async function loadRecipients(caller: Caller, customerIds: string[]): Promise<Recipient[]> {
  const { data: customers, error } = await caller.admin
    .from("customers")
    .select("id, name, phone")
    .eq("business_id", caller.businessId)
    .is("archived_at", null)
    .not("phone", "is", null)
    .in("id", customerIds);
  if (error) throw error;
  const { data: credits } = await caller.admin
    .from("credits")
    .select("customer_id, amount_owed, amount_paid, due_date, status")
    .eq("business_id", caller.businessId)
    .neq("status", "paid")
    .in("customer_id", customerIds);

  const seen = new Set<string>();
  const recipients: Recipient[] = [];
  for (const c of customers ?? []) {
    if (seen.has(c.phone as string)) continue;
    seen.add(c.phone as string);
    const open = (credits ?? []).filter((cr) => cr.customer_id === c.id);
    recipients.push({
      customerId: c.id as string,
      name: c.name as string,
      phone: c.phone as string,
      amountDue: open.reduce((s, cr) => s + Number(cr.amount_owed) - Number(cr.amount_paid), 0),
      dueDate: open.map((cr) => cr.due_date as string).sort()[0] ?? null,
    });
  }
  return recipients;
}

async function deliver(caller: Caller, recipients: Recipient[], template: string, kind: string, broadcastId: string | null) {
  const { data: business } = await caller.admin
    .from("businesses")
    .select("name, currency")
    .eq("id", caller.businessId)
    .single();
  const money = new Intl.NumberFormat("en-US", { style: "currency", currency: (business?.currency as string) ?? "KES" });

  let sent = 0;
  let failed = 0;
  const sentCustomerIds: string[] = [];
  for (const r of recipients) {
    const body = renderTemplate(template, {
      customer_name: r.name.split(" ")[0],
      amount_due: r.amountDue > 0 ? money.format(r.amountDue) : "",
      due_date: r.dueDate ?? "",
      business_name: (business?.name as string) ?? "",
    });
    const { data: row, error } = await caller.admin
      .from("sms_messages")
      .insert({ business_id: caller.businessId, customer_id: r.customerId, phone: r.phone, body, kind, broadcast_id: broadcastId, sent_by: caller.userId })
      .select("id")
      .single();
    if (error) throw error;
    const outcome = await sendOne(r.phone, body);
    await caller.admin
      .from("sms_messages")
      .update({ status: outcome.ok ? "sent" : "failed", error: outcome.error, provider_message_id: outcome.messageId })
      .eq("id", row.id);
    if (outcome.ok) {
      sent++;
      sentCustomerIds.push(r.customerId);
    } else failed++;
  }
  return { sent, failed, skipped: 0, recipients: recipients.length, sentCustomerIds };
}

async function sendOne(phone: string, message: string): Promise<{ ok: boolean; error: string | null; messageId: string | null }> {
  const username = Deno.env.get("AT_USERNAME");
  const apiKey = Deno.env.get("AT_API_KEY");
  if (!username || !apiKey) return { ok: false, error: "SMS is not configured (AT_USERNAME / AT_API_KEY)", messageId: null };
  const host = Deno.env.get("AT_SANDBOX") === "true" ? "api.sandbox.africastalking.com" : "api.africastalking.com";
  const form = new URLSearchParams({ username, to: phone, message });
  const sender = Deno.env.get("AT_SENDER_ID");
  if (sender) form.set("from", sender);
  try {
    const res = await fetch(`https://${host}/version1/messaging`, {
      method: "POST",
      headers: { apiKey, Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
      body: form,
    });
    if (!res.ok) return { ok: false, error: `Provider error ${res.status}`, messageId: null };
    const payload = await res.json();
    const recipient = payload?.SMSMessageData?.Recipients?.[0];
    const ok = recipient?.statusCode === 100 || recipient?.statusCode === 101 || recipient?.status === "Success";
    return { ok, error: ok ? null : (recipient?.status ?? payload?.SMSMessageData?.Message ?? "Not sent"), messageId: recipient?.messageId ?? null };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Network error", messageId: null };
  }
}
