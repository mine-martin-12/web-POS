/**
 * Stand-ins for the edge functions (supabase/functions/*). They run the same checks and
 * write the same rows with the service role, but nothing leaves the browser: no email, no
 * SMS, no Supabase Auth call. Kept in step with the real functions by
 * src/demo/simulate/edge.test.ts.
 */
import type { Transaction } from "@electric-sql/pglite";
import type { AppRole } from "@/contexts/AuthContext";
import type { Invitation, InviteResult, Member } from "@/features/staff/types";
import { toMember } from "@/features/staff/api.supabase";
import { renderTemplate, SMS_MAX_LENGTH } from "@/lib/smsTemplate";
import { actor, asService, maybeOne, rows } from "../db/engine";

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_RECIPIENTS = 500;
const PUBLIC_COLUMNS = "id, email, first_name, last_name, role, user_id, expires_at, created_at";

interface Caller {
  userId: string;
  businessId: string;
}

/** _shared/auth.ts requireAdmin(): an active admin of an active business. */
async function requireAdmin(tx: Transaction): Promise<Caller> {
  const userId = actor();
  const me = await maybeOne<{ business_id: string; is_active: boolean; active_business: boolean; role: AppRole | null }>(
    tx,
    `SELECT p.business_id, p.is_active, public.business_is_active(p.business_id) AS active_business,
            (SELECT ur.role FROM public.user_roles ur WHERE ur.user_id = p.user_id AND ur.business_id = p.business_id) AS role
     FROM public.profiles p WHERE p.user_id = $1`,
    [userId],
  );
  if (!me || !me.is_active) throw new Error("Your account is not active");
  if (!me.active_business) throw new Error("Your business account has expired. Please contact support.");
  if (!me.role) throw new Error("Your account has no role");
  if (me.role !== "admin") throw new Error("Admin privileges required");
  return { userId, businessId: me.business_id };
}

// ---------------------------------------------------------------------------------------
// invite-staff
// ---------------------------------------------------------------------------------------

async function createInvitation(
  tx: Transaction,
  caller: Caller,
  input: { email: string; first_name: string | null; last_name: string | null; role: AppRole },
): Promise<string> {
  const member = await maybeOne<{ business_id: string }>(tx, "SELECT business_id FROM public.profiles WHERE email ILIKE $1", [
    input.email,
  ]);
  if (member) {
    throw new Error(
      member.business_id === caller.businessId
        ? "This person is already a member of your business"
        : "This email already belongs to another business",
    );
  }
  // Expired invitations no longer block a fresh one.
  await rows(
    tx,
    `UPDATE public.invitations SET revoked_at = now()
     WHERE email ILIKE $1 AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at < now()`,
    [input.email],
  );
  try {
    await tx.exec("SAVEPOINT invite");
    const [{ id }] = await rows<{ id: string }>(
      tx,
      `INSERT INTO public.invitations (business_id, email, first_name, last_name, role, invited_by)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [caller.businessId, input.email, input.first_name, input.last_name, input.role, caller.userId],
    );
    await tx.exec("RELEASE SAVEPOINT invite");
    return id;
  } catch (error) {
    await tx.exec("ROLLBACK TO SAVEPOINT invite");
    if ((error as { code?: string }).code === "23505") {
      throw new Error("This email already has a pending invitation. Resend it instead.");
    }
    throw error;
  }
}

/** Nothing is emailed: an "email" invitation just reports success; a link is a placeholder. */
async function sendInvitation(tx: Transaction, invitationId: string, delivery: "email" | "link"): Promise<InviteResult> {
  const [invitation] = await rows<Invitation>(tx, `SELECT ${PUBLIC_COLUMNS} FROM public.invitations WHERE id = $1`, [invitationId]);
  return {
    invitation,
    emailSent: delivery === "email",
    actionLink: delivery === "link" ? `${globalThis.location?.origin ?? ""}/accept-invite?demo-invitation=${invitationId}` : null,
  };
}

async function loadOpenInvitation(tx: Transaction, caller: Caller, id: string) {
  const invitation = await maybeOne<{
    id: string;
    email: string;
    first_name: string | null;
    last_name: string | null;
    role: AppRole;
    accepted_at: string | null;
    revoked_at: string | null;
  }>(tx, "SELECT * FROM public.invitations WHERE id = $1 AND business_id = $2", [id, caller.businessId]);
  if (!invitation) throw new Error("Invitation not found");
  if (invitation.accepted_at) throw new Error("This invitation has already been accepted");
  if (invitation.revoked_at) throw new Error("This invitation has already been revoked");
  return invitation;
}

const role = (value: unknown): AppRole => {
  if (value !== "admin" && value !== "user") throw new Error("Choose a valid role");
  return value;
};

export function inviteStaff(input: { email: string; firstName: string; lastName: string; role: AppRole; delivery: "email" | "link" }) {
  return asService(async (tx) => {
    const caller = await requireAdmin(tx);
    const email = input.email.trim().toLowerCase();
    if (!email) throw new Error("Email is required");
    if (!EMAIL.test(email)) throw new Error("Enter a valid email address");
    const id = await createInvitation(tx, caller, {
      email,
      first_name: input.firstName?.trim() || null,
      last_name: input.lastName?.trim() || null,
      role: role(input.role),
    });
    return sendInvitation(tx, id, input.delivery === "link" ? "link" : "email");
  });
}

export function resendInvitation(invitationId: string, delivery: "email" | "link" = "email") {
  return asService(async (tx) => {
    const caller = await requireAdmin(tx);
    const old = await loadOpenInvitation(tx, caller, invitationId);
    await rows(tx, "UPDATE public.invitations SET revoked_at = now() WHERE id = $1", [old.id]);
    const id = await createInvitation(tx, caller, {
      email: old.email,
      first_name: old.first_name,
      last_name: old.last_name,
      role: old.role,
    });
    return sendInvitation(tx, id, delivery);
  });
}

export function revokeInvitation(invitationId: string) {
  return asService(async (tx) => {
    const caller = await requireAdmin(tx);
    const invitation = await loadOpenInvitation(tx, caller, invitationId);
    await rows(tx, "UPDATE public.invitations SET revoked_at = now() WHERE id = $1", [invitation.id]);
    return { ok: true as const };
  });
}

// ---------------------------------------------------------------------------------------
// manage-staff
// ---------------------------------------------------------------------------------------

/** Turn database rule violations into messages an admin can act on. */
function friendly(error: unknown): Error {
  const message = (error as Error).message ?? "";
  if (/at least one active admin/i.test(message)) return new Error("Your business must keep at least one active admin");
  return error as Error;
}

async function writeOrFriendly(tx: Transaction, sql: string, params: unknown[]) {
  try {
    await tx.exec("SAVEPOINT manage");
    await rows(tx, sql, params);
    await tx.exec("RELEASE SAVEPOINT manage");
  } catch (error) {
    await tx.exec("ROLLBACK TO SAVEPOINT manage");
    throw friendly(error);
  }
}

export function manageStaff(
  action: "update" | "deactivate" | "reactivate",
  input: { userId: string; firstName?: string; lastName?: string; role?: AppRole },
) {
  return asService(async (tx) => {
    const caller = await requireAdmin(tx);
    if (!UUID.test(input.userId)) throw new Error("Invalid userId");
    const isSelf = input.userId === caller.userId;
    const target = await maybeOne<{ is_active: boolean }>(
      tx,
      "SELECT is_active FROM public.profiles WHERE user_id = $1 AND business_id = $2",
      [input.userId, caller.businessId],
    );
    if (!target) throw new Error("Team member not found");

    if (action === "update") {
      if (input.firstName !== undefined || input.lastName !== undefined) {
        if (input.firstName === "") throw new Error("First name is required");
        await rows(
          tx,
          "UPDATE public.profiles SET first_name = COALESCE($2, first_name), last_name = COALESCE($3, last_name) WHERE user_id = $1",
          [input.userId, input.firstName ?? null, input.lastName ?? null],
        );
      }
      if (input.role !== undefined) {
        const next = role(input.role);
        if (isSelf) throw new Error("You can't change your own role");
        await writeOrFriendly(tx, "UPDATE public.user_roles SET role = $3 WHERE user_id = $1 AND business_id = $2", [
          input.userId,
          caller.businessId,
          next,
        ]);
      }
    } else if (action === "deactivate") {
      if (isSelf) throw new Error("You can't deactivate your own account");
      if (target.is_active) {
        await writeOrFriendly(tx, "UPDATE public.profiles SET is_active = false WHERE user_id = $1", [input.userId]);
      }
    } else if (!target.is_active) {
      await rows(tx, "UPDATE public.profiles SET is_active = true WHERE user_id = $1", [input.userId]);
    }

    const [updated] = await rows<Parameters<typeof toMember>[0]>(
      tx,
      `SELECT p.user_id, p.email, p.first_name, p.last_name, p.is_active, p.deactivated_at, p.created_at,
              (SELECT json_build_object('role', ur.role) FROM public.user_roles ur
                WHERE ur.user_id = p.user_id AND ur.business_id = p.business_id) AS user_roles
       FROM public.profiles p WHERE p.user_id = $1`,
      [input.userId],
    );
    return { member: toMember(updated) as Member as unknown };
  });
}

// ---------------------------------------------------------------------------------------
// send-sms
// ---------------------------------------------------------------------------------------

interface Recipient {
  customerId: string;
  name: string;
  phone: string;
  amountDue: number;
  dueDate: string | null;
}

function requireMessage(message: unknown): string {
  if (typeof message !== "string" || !message.trim()) throw new Error("Message is required");
  if (message.length > SMS_MAX_LENGTH) throw new Error(`Messages are limited to ${SMS_MAX_LENGTH} characters`);
  return message;
}

function requireIds(value: unknown, name: string): string[] {
  if (!Array.isArray(value) || value.length === 0) throw new Error("Choose at least one recipient");
  const ids = [...new Set(value.filter((v): v is string => typeof v === "string" && UUID.test(v)))];
  if (ids.length === 0) throw new Error(`Invalid ${name}`);
  if (ids.length > MAX_RECIPIENTS) throw new Error(`Send to at most ${MAX_RECIPIENTS} people at a time`);
  return ids;
}

/** Only customers of this business with a phone; one recipient per phone number. */
async function loadRecipients(tx: Transaction, caller: Caller, customerIds: string[]): Promise<Recipient[]> {
  const customers = await rows<{ id: string; name: string; phone: string }>(
    tx,
    `SELECT id, name, phone FROM public.customers
     WHERE business_id = $1 AND archived_at IS NULL AND phone IS NOT NULL AND id = ANY($2::uuid[])`,
    [caller.businessId, customerIds],
  );
  const open = await rows<{ customer_id: string; amount_owed: number; amount_paid: number; due_date: string }>(
    tx,
    `SELECT customer_id, amount_owed, amount_paid, due_date FROM public.credits
     WHERE business_id = $1 AND status <> 'paid' AND customer_id = ANY($2::uuid[])`,
    [caller.businessId, customerIds],
  );
  const seen = new Set<string>();
  const recipients: Recipient[] = [];
  for (const c of customers) {
    if (seen.has(c.phone)) continue;
    seen.add(c.phone);
    const mine = open.filter((cr) => cr.customer_id === c.id);
    recipients.push({
      customerId: c.id,
      name: c.name,
      phone: c.phone,
      amountDue: mine.reduce((sum, cr) => sum + Number(cr.amount_owed) - Number(cr.amount_paid), 0),
      dueDate: mine.map((cr) => cr.due_date).sort()[0] ?? null,
    });
  }
  return recipients;
}

async function deliver(tx: Transaction, caller: Caller, recipients: Recipient[], template: string, kind: string, broadcastId: string | null) {
  const business = await maybeOne<{ name: string; currency: string }>(tx, "SELECT name, currency FROM public.businesses WHERE id = $1", [
    caller.businessId,
  ]);
  const money = new Intl.NumberFormat("en-US", { style: "currency", currency: business?.currency ?? "KES" });
  const sentCustomerIds: string[] = [];
  for (const r of recipients) {
    const body = renderTemplate(template, {
      customer_name: r.name.split(" ")[0],
      amount_due: r.amountDue > 0 ? money.format(r.amountDue) : "",
      due_date: r.dueDate ?? "",
      business_name: business?.name ?? "",
    });
    // Logged exactly as a delivered message would be; the provider is never called.
    await rows(
      tx,
      `INSERT INTO public.sms_messages (business_id, customer_id, phone, body, kind, broadcast_id, sent_by, status, provider_message_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'sent', 'demo-' || gen_random_uuid())`,
      [caller.businessId, r.customerId, r.phone, body, kind, broadcastId, caller.userId],
    );
    sentCustomerIds.push(r.customerId);
  }
  return { sent: sentCustomerIds.length, failed: 0, skipped: 0, recipients: recipients.length, sentCustomerIds };
}

export function sendSms(input: { customerIds: string[]; message: string; broadcast?: boolean }) {
  return asService(async (tx) => {
    const caller = await requireAdmin(tx);
    const message = requireMessage(input.message);
    const ids = requireIds(input.customerIds, "customerIds");
    const recipients = await loadRecipients(tx, caller, ids);
    const broadcastId = input.broadcast === true ? crypto.randomUUID() : null;
    return deliver(tx, caller, recipients, message, broadcastId ? "broadcast" : "manual", broadcastId);
  });
}

export function retrySms(messageIds: string[]) {
  return asService(async (tx) => {
    const caller = await requireAdmin(tx);
    const ids = requireIds(messageIds, "messageIds");
    const retried = await rows(
      tx,
      `UPDATE public.sms_messages SET status = 'sent', error = NULL, provider_message_id = 'demo-' || gen_random_uuid()
       WHERE business_id = $1 AND status = 'failed' AND id = ANY($2::uuid[]) RETURNING id`,
      [caller.businessId, ids],
    );
    return { sent: retried.length, failed: 0, skipped: 0 };
  });
}

export function sendOverdueReminders(message: string) {
  return asService(async (tx) => {
    const caller = await requireAdmin(tx);
    const text = requireMessage(message);
    const credits = await rows<{ id: string; customer_id: string }>(
      tx,
      `SELECT id, customer_id FROM public.credits
       WHERE business_id = $1 AND status <> 'paid' AND reminder_sent_at IS NULL AND customer_id IS NOT NULL
         AND due_date < (now() AT TIME ZONE public.business_timezone($1))::date`,
      [caller.businessId],
    );
    const customerIds = [...new Set(credits.map((c) => c.customer_id))];
    const recipients = customerIds.length ? await loadRecipients(tx, caller, customerIds) : [];
    const result = await deliver(tx, caller, recipients, text, "reminder", null);
    // Side effect runs once: mark every credit we reminded about.
    const reminded = new Set(result.sentCustomerIds);
    const creditIds = credits.filter((c) => reminded.has(c.customer_id)).map((c) => c.id);
    if (creditIds.length) {
      await rows(tx, "UPDATE public.credits SET reminder_sent_at = now() WHERE id = ANY($1::uuid[])", [creditIds]);
    }
    return result;
  });
}
