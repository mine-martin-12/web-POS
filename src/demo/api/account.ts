import type { AccountApi, BusinessDetailsInput } from "@/features/account/api";
import { asActor, callRpc, rows } from "../db/engine";

export const account = {
  async updateMyName(userId: string, input: { first_name: string; last_name: string }) {
    await asActor((tx) =>
      rows(tx, "UPDATE public.profiles SET first_name = $2, last_name = $3 WHERE user_id = $1", [
        userId,
        input.first_name,
        input.last_name,
      ]),
    );
  },

  async updateBusinessDetails(input: BusinessDetailsInput) {
    // Admin only, enforced by the function itself.
    await asActor((tx) =>
      callRpc(
        tx,
        "update_business_details",
        {
          _name: input.name,
          _phone: input.phone ?? "",
          _email: input.email ?? "",
          _address: input.address ?? "",
          _currency: input.currency.toUpperCase(),
          _timezone: input.timezone,
        },
        "row",
      ),
    );
  },

  /** Demo accounts have no password; any current password is accepted and nothing changes. */
  async changePassword(input: { email: string; currentPassword: string; newPassword: string }) {
    return input.currentPassword ? ("ok" as const) : ("wrong_current_password" as const);
  },
} satisfies AccountApi;
