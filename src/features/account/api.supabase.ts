import { supabase } from "@/integrations/supabase/client";

export interface BusinessDetailsInput {
  name: string;
  phone?: string;
  email?: string;
  address?: string;
  currency: string;
  timezone: string;
}

/** Users may change only their own name (column grant + RLS). */
export async function updateMyName(userId: string, input: { first_name: string; last_name: string }): Promise<void> {
  const { error } = await supabase
    .from("profiles")
    .update({ first_name: input.first_name, last_name: input.last_name })
    .eq("user_id", userId);
  if (error) throw error;
}

/** Admin only (enforced by update_business_details). */
export async function updateBusinessDetails(input: BusinessDetailsInput): Promise<void> {
  const { error } = await supabase.rpc("update_business_details", {
    _name: input.name,
    _phone: input.phone ?? "",
    _email: input.email ?? "",
    _address: input.address ?? "",
    _currency: input.currency.toUpperCase(),
    _timezone: input.timezone,
  });
  if (error) throw error;
}

/**
 * Re-authenticates with the current password first, so a borrowed, unlocked session can't
 * change it. Resolves "wrong_current_password" instead of throwing for that case.
 */
export async function changePassword(input: {
  email: string;
  currentPassword: string;
  newPassword: string;
}): Promise<"ok" | "wrong_current_password"> {
  const { error: signInError } = await supabase.auth.signInWithPassword({
    email: input.email,
    password: input.currentPassword,
  });
  if (signInError) return "wrong_current_password";
  const { error } = await supabase.auth.updateUser({ password: input.newPassword });
  if (error) throw error;
  return "ok";
}
