import type { CustomerInput, CustomersApi } from "@/features/customers/api";
import type { CreateCustomerResult, Customer, PickerMode } from "@/features/customers/types";
import { asActor, callRpc, rows } from "../db/engine";

export const customers = {
  async searchCustomers(mode: PickerMode, term: string, limit = 20) {
    if (mode === "keep-typing") return [];
    return asActor((tx) =>
      callRpc<Customer[]>(tx, "search_customers", { _query: mode === "recent" ? "" : term, _limit: limit }, "rows"),
    );
  },

  fetchCustomers() {
    return asActor((tx) =>
      rows<Customer>(
        tx,
        `SELECT id, name, phone, notes, created_at, archived_at FROM public.customers_secure()
         WHERE archived_at IS NULL ORDER BY name, id`,
      ),
    );
  },

  createCustomer(input: CustomerInput, force = false) {
    return asActor((tx) =>
      callRpc<CreateCustomerResult>(
        tx,
        "create_customer",
        { _name: input.name, _phone: input.phone || undefined, _notes: input.notes || undefined, _force: force },
        "value",
      ),
    );
  },

  async updateCustomer(id: string, input: CustomerInput) {
    try {
      await asActor((tx) =>
        rows(tx, "UPDATE public.customers SET name = $2, phone = $3, notes = $4 WHERE id = $1", [
          id,
          input.name,
          input.phone || null,
          input.notes || null,
        ]),
      );
    } catch (error) {
      if ((error as { code?: string }).code === "23505") throw new Error("Another customer already has this phone number");
      throw error;
    }
  },

  async archiveCustomer(id: string) {
    await asActor((tx) => rows(tx, "UPDATE public.customers SET archived_at = now() WHERE id = $1", [id]));
  },
} satisfies CustomersApi;
