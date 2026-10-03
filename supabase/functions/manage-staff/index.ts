// Admin-only staff management. Members are deactivated (soft), never hard-deleted.
//
//   { action: "update", userId, firstName?, lastName?, role? }
//   { action: "deactivate", userId }
//   { action: "reactivate", userId }
//
// Admins cannot change their own role or deactivate themselves, and the database refuses
// any change that would leave the business without an active admin.
import { requireAdmin } from "../_shared/auth.ts";
import { HttpError, json, optionalString, requireRole, requireString, requireUuid, serve } from "../_shared/http.ts";

// ~100 years: Supabase has no permanent ban, and this blocks token refresh and sign-in.
const BAN_FOREVER = "876000h";

serve(async (req, body) => {
  const caller = await requireAdmin(req);
  const { admin, businessId } = caller;
  const action = requireString(body, "action");
  const targetId = requireUuid(body, "userId");
  const isSelf = targetId === caller.userId;

  const { data: target, error } = await admin
    .from("profiles")
    .select("user_id, business_id, is_active, first_name, last_name")
    .eq("user_id", targetId)
    .eq("business_id", businessId)
    .maybeSingle();
  if (error) throw error;
  if (!target) throw new HttpError(404, "Team member not found");

  switch (action) {
    case "update": {
      const firstName = optionalString(body, "firstName");
      const lastName = optionalString(body, "lastName");
      if (firstName !== undefined || lastName !== undefined) {
        if (firstName === "") throw new HttpError(400, "First name is required");
        const { error: nameError } = await admin
          .from("profiles")
          .update({
            ...(firstName !== undefined ? { first_name: firstName } : {}),
            ...(lastName !== undefined ? { last_name: lastName } : {}),
          })
          .eq("user_id", targetId);
        if (nameError) throw nameError;
      }
      if (body.role !== undefined) {
        const role = requireRole(body.role);
        if (isSelf) throw new HttpError(400, "You can't change your own role");
        const { error: roleError } = await admin
          .from("user_roles")
          .update({ role })
          .eq("user_id", targetId)
          .eq("business_id", businessId);
        if (roleError) throw friendly(roleError);
      }
      break;
    }

    case "deactivate": {
      if (isSelf) throw new HttpError(400, "You can't deactivate your own account");
      if (!target.is_active) break;
      const { error: deactivateError } = await admin.from("profiles").update({ is_active: false }).eq("user_id", targetId);
      if (deactivateError) throw friendly(deactivateError);
      const { error: banError } = await admin.auth.admin.updateUserById(targetId, { ban_duration: BAN_FOREVER });
      if (banError) {
        await admin.from("profiles").update({ is_active: true }).eq("user_id", targetId);
        throw banError;
      }
      break;
    }

    case "reactivate": {
      if (target.is_active) break;
      const { error: unbanError } = await admin.auth.admin.updateUserById(targetId, { ban_duration: "none" });
      if (unbanError) throw unbanError;
      const { error: reactivateError } = await admin.from("profiles").update({ is_active: true }).eq("user_id", targetId);
      if (reactivateError) throw reactivateError;
      break;
    }

    default:
      throw new HttpError(400, "Unknown action");
  }

  const { data: updated } = await admin
    .from("profiles")
    .select("user_id, email, first_name, last_name, is_active, deactivated_at, created_at, user_roles(role)")
    .eq("user_id", targetId)
    .single();
  return json(req, { member: updated });
});

/** Turn database rule violations into messages an admin can act on. */
function friendly(error: { message: string }): Error {
  if (/at least one active admin/i.test(error.message)) {
    return new HttpError(409, "Your business must keep at least one active admin");
  }
  return error as Error;
}
