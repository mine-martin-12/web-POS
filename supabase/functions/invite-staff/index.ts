// Admin-only staff invitations.
//
//   { action: "invite", email, firstName?, lastName?, role, delivery?: "email" | "link" }
//   { action: "resend", invitationId, delivery?: "email" | "link" }
//   { action: "revoke", invitationId }
//
// Staff never sign themselves up: an admin creates an invitation (random token, email,
// role, 7-day expiry) and Supabase Auth creates the account server-side. The database
// sign-up trigger reads the role and business from the invitation row, not the client.
import { requireAdmin, type Caller } from "../_shared/auth.ts";
import {
  HttpError,
  json,
  optionalString,
  requireRole,
  requireString,
  requireUuid,
  serve,
  siteUrl,
} from "../_shared/http.ts";

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

interface Invitation {
  id: string;
  business_id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  role: "admin" | "user";
  token: string;
  user_id: string | null;
  expires_at: string;
  accepted_at: string | null;
  revoked_at: string | null;
}

const PUBLIC_COLUMNS = "id, email, first_name, last_name, role, expires_at, accepted_at, revoked_at, created_at";

serve(async (req, body) => {
  const caller = await requireAdmin(req);
  const action = requireString(body, "action");
  const delivery = body.delivery === "link" ? "link" : "email";

  switch (action) {
    case "invite": {
      const email = requireString(body, "email", "Email").toLowerCase();
      if (!EMAIL.test(email)) throw new HttpError(400, "Enter a valid email address");
      const invitation = await createInvitation(caller, {
        email,
        first_name: optionalString(body, "firstName") || null,
        last_name: optionalString(body, "lastName") || null,
        role: requireRole(body.role),
      });
      const result = await sendInvitation(req, caller, invitation, delivery);
      return json(req, result, 201);
    }

    case "resend": {
      const old = await loadOpenInvitation(caller, requireUuid(body, "invitationId"));
      await retireInvitation(caller, old);
      const invitation = await createInvitation(caller, {
        email: old.email,
        first_name: old.first_name,
        last_name: old.last_name,
        role: old.role,
      });
      return json(req, await sendInvitation(req, caller, invitation, delivery));
    }

    case "revoke": {
      const invitation = await loadOpenInvitation(caller, requireUuid(body, "invitationId"));
      await retireInvitation(caller, invitation);
      return json(req, { ok: true });
    }

    default:
      throw new HttpError(400, "Unknown action");
  }
});

async function createInvitation(
  caller: Caller,
  input: Pick<Invitation, "email" | "first_name" | "last_name" | "role">,
): Promise<Invitation> {
  const { admin, businessId, userId } = caller;

  const { data: member } = await admin.from("profiles").select("business_id").ilike("email", input.email).maybeSingle();
  if (member) {
    throw new HttpError(
      409,
      member.business_id === businessId
        ? "This person is already a member of your business"
        : "This email already belongs to another business",
    );
  }

  // Expired invitations no longer block a fresh one.
  await admin
    .from("invitations")
    .update({ revoked_at: new Date().toISOString() })
    .ilike("email", input.email)
    .is("accepted_at", null)
    .is("revoked_at", null)
    .lt("expires_at", new Date().toISOString());

  const { data, error } = await admin
    .from("invitations")
    .insert({ ...input, business_id: businessId, invited_by: userId })
    .select("*")
    .single();
  if (error) {
    if (error.code === "23505") throw new HttpError(409, "This email already has a pending invitation. Resend it instead.");
    throw error;
  }
  return data as Invitation;
}

async function sendInvitation(req: Request, caller: Caller, invitation: Invitation, delivery: "email" | "link") {
  const { admin } = caller;
  const options = {
    redirectTo: `${siteUrl(req)}/accept-invite`,
    data: {
      invite_token: invitation.token,
      first_name: invitation.first_name ?? undefined,
      last_name: invitation.last_name ?? undefined,
    },
  };

  let actionLink: string | null = null;
  let emailSent = false;
  let failure: { message: string } | null = null;

  if (delivery === "email") {
    const { error } = await admin.auth.admin.inviteUserByEmail(invitation.email, options);
    if (!error) {
      emailSent = true;
    } else if (/rate limit|smtp|sending/i.test(error.message)) {
      // Email is down or rate limited: fall back to a link the admin can share.
      delivery = "link";
    } else {
      failure = error;
    }
  }

  if (delivery === "link" && !failure) {
    const { data, error } = await admin.auth.admin.generateLink({ type: "invite", email: invitation.email, options });
    if (error) failure = error;
    else actionLink = data.properties?.action_link ?? null;
  }

  if (failure) {
    await admin.from("invitations").delete().eq("id", invitation.id);
    if (/already been registered|already registered|already exists/i.test(failure.message)) {
      throw new HttpError(409, "An account with this email already exists");
    }
    if (/database error/i.test(failure.message)) {
      throw new HttpError(400, "The invitation could not be created. Please try again.");
    }
    throw new HttpError(502, failure.message);
  }

  const { data } = await admin.from("invitations").select(PUBLIC_COLUMNS).eq("id", invitation.id).single();
  return { invitation: data, emailSent, actionLink };
}

async function loadOpenInvitation(caller: Caller, id: string): Promise<Invitation> {
  const { data, error } = await caller.admin
    .from("invitations")
    .select("*")
    .eq("id", id)
    .eq("business_id", caller.businessId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new HttpError(404, "Invitation not found");
  const invitation = data as Invitation;
  if (invitation.accepted_at) throw new HttpError(409, "This invitation has already been accepted");
  if (invitation.revoked_at) throw new HttpError(409, "This invitation has already been revoked");
  return invitation;
}

/** Revoke an unaccepted invitation and remove the placeholder account Supabase created for
 *  it, so the email can be invited again. Only accounts that never signed in are removed. */
async function retireInvitation(caller: Caller, invitation: Invitation) {
  const { admin } = caller;
  await admin.from("invitations").update({ revoked_at: new Date().toISOString() }).eq("id", invitation.id);

  if (!invitation.user_id) return;
  const { data } = await admin.auth.admin.getUserById(invitation.user_id);
  if (data.user && !data.user.last_sign_in_at) {
    const { data: profile } = await admin
      .from("profiles")
      .select("business_id")
      .eq("user_id", invitation.user_id)
      .maybeSingle();
    if (!profile || profile.business_id === caller.businessId) {
      const { error } = await admin.auth.admin.deleteUser(invitation.user_id);
      if (error) throw error;
    }
  }
}
