import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { fetchAll } from "@/lib/fetchAll";

export type Expense = Tables<"expenses">;

export const EXPENSE_CATEGORIES = [
  "Rent",
  "Salaries & wages",
  "Utilities",
  "Transport",
  "Supplies",
  "Repairs",
  "Marketing",
  "Licences & fees",
  "Other",
] as const;

export interface ExpenseInput {
  category: string;
  description: string;
  amount: number;
  expense_date: string;
  payment_method: "cash" | "mpesa" | "bank_cheque";
}

/** Expenses dated fromKey..toKey inclusive (admins only; RLS returns nothing to staff). */
export async function fetchExpenses(fromKey: string, toKey: string): Promise<Expense[]> {
  return fetchAll<Expense>(() =>
    supabase
      .from("expenses")
      .select("*")
      .gte("expense_date", fromKey)
      .lte("expense_date", toKey)
      .order("expense_date", { ascending: false })
      .order("id", { ascending: false }),
  );
}

export async function createExpense(input: ExpenseInput): Promise<void> {
  const { error } = await supabase.from("expenses").insert({ ...input, description: input.description || null });
  if (error) throw error;
}

export async function updateExpense(id: string, input: ExpenseInput): Promise<void> {
  const { error } = await supabase
    .from("expenses")
    .update({ ...input, description: input.description || null })
    .eq("id", id);
  if (error) throw error;
}

export async function deleteExpense(id: string): Promise<void> {
  const { data, error } = await supabase.from("expenses").delete().eq("id", id).select("id");
  if (error) throw error;
  if (!data?.length) throw new Error("This expense can't be deleted");
}
