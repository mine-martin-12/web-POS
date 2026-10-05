import type { Expense, ExpenseInput, ExpensesApi } from "@/features/expenses/api";
import { asActor, rows } from "../db/engine";

const values = (input: ExpenseInput) => [
  input.category,
  input.description || null,
  input.amount,
  input.expense_date,
  input.payment_method,
];

export const expenses = {
  fetchExpenses(fromKey: string, toKey: string) {
    // Admins only: RLS returns nothing to staff.
    return asActor((tx) =>
      rows<Expense>(
        tx,
        "SELECT * FROM public.expenses WHERE expense_date >= $1 AND expense_date <= $2 ORDER BY expense_date DESC, id DESC",
        [fromKey, toKey],
      ),
    );
  },

  async createExpense(input: ExpenseInput) {
    await asActor((tx) =>
      rows(
        tx,
        "INSERT INTO public.expenses (category, description, amount, expense_date, payment_method) VALUES ($1, $2, $3, $4, $5)",
        values(input),
      ),
    );
  },

  async updateExpense(id: string, input: ExpenseInput) {
    await asActor((tx) =>
      rows(
        tx,
        `UPDATE public.expenses SET category = $2, description = $3, amount = $4, expense_date = $5, payment_method = $6
         WHERE id = $1`,
        [id, ...values(input)],
      ),
    );
  },

  async deleteExpense(id: string) {
    const deleted = await asActor((tx) => rows(tx, "DELETE FROM public.expenses WHERE id = $1 RETURNING id", [id]));
    if (!deleted.length) throw new Error("This expense can't be deleted");
  },
} satisfies ExpensesApi;
