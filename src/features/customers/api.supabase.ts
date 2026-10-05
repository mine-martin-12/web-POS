import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { fetchAll } from "@/lib/fetchAll";
import type { CreateCustomerResult, Customer, PickerMode } from "./types";

const COLUMNS = "id, name, phone, notes, created_at, archived_at";

export async function searchCustomers(mode: PickerMode, term: string, limit = 20): Promise<Customer[]> {
  if (mode === "keep-typing") return [];
  const { data, error } = await supabase.rpc("search_customers", { _query: mode === "recent" ? "" : term, _limit: limit });
  if (error) throw error;
  return (data ?? []) as Customer[];
}

type SecureRow = Pick<Database["public"]["Functions"]["customers_secure"]["Returns"][number], keyof Customer>;

export async function fetchCustomers(): Promise<Customer[]> {
  // customers_secure() is the only way to read customers with their (masked) phone.
  const rows = await fetchAll<SecureRow>(() =>
    supabase
      .rpc("customers_secure")
      .is("archived_at", null)
      .select(COLUMNS)
      .order("name", { ascending: true })
      .order("id", { ascending: true }),
  );
  return rows as Customer[];
}

export interface CustomerInput {
  name: string;
  phone?: string;
  notes?: string;
}

/** Create with duplicate detection; `force` = "No, this is a different person". */
export async function createCustomer(input: CustomerInput, force = false): Promise<CreateCustomerResult> {
  const { data, error } = await supabase.rpc("create_customer", {
    _name: input.name,
    _phone: input.phone || undefined,
    _notes: input.notes || undefined,
    _force: force,
  });
  if (error) throw error;
  return data as unknown as CreateCustomerResult;
}

/** Admin-only (enforced by RLS). */
export async function updateCustomer(id: string, input: CustomerInput): Promise<void> {
  const { error } = await supabase
    .from("customers")
    .update({ name: input.name, phone: input.phone || null, notes: input.notes || null })
    .eq("id", id);
  if (error) {
    if (error.code === "23505") throw new Error("Another customer already has this phone number");
    throw error;
  }
}

export async function archiveCustomer(id: string): Promise<void> {
  const { error } = await supabase.from("customers").update({ archived_at: new Date().toISOString() }).eq("id", id);
  if (error) throw error;
}
