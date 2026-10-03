import type { ExportSheet } from "@/lib/exports/table";
import { PAYMENT_METHOD_LABELS, type PaymentMethod } from "@/features/sales/types";
import type { Expense } from "./api";

/** Expenses export, also the "Expenses" sheet of the tax export. */
export function expensesSheet(rows: Expense[]): ExportSheet<Expense> {
  return {
    name: "Expenses",
    total: true,
    rows,
    columns: [
      { header: "ID", value: (_e, i) => `E${String(i + 1).padStart(4, "0")}` },
      { header: "Date", value: (e) => e.expense_date },
      { header: "Category", value: (e) => e.category, width: 18 },
      { header: "Paid by", value: (e) => PAYMENT_METHOD_LABELS[e.payment_method as PaymentMethod] },
      { header: "Notes", value: (e) => e.description ?? "", width: 28 },
      { header: "Amount", value: (e) => Number(e.amount), money: true },
    ],
  };
}
