import type { Tables } from "@/integrations/supabase/types";
import type { SaleAmounts } from "@/lib/finance";

export type PaymentMethod = "cash" | "mpesa" | "bank_cheque" | "credit";

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: "Cash",
  mpesa: "M-Pesa",
  bank_cheque: "Bank/Cheque",
  credit: "Credit",
};

export type CreditRow = Pick<
  Tables<"credits">,
  "id" | "amount_owed" | "amount_paid" | "status" | "due_date" | "customer_name"
>;

/** A sale with its product name and (optional) credit, normalised from the API shape. */
export interface SaleRow extends SaleAmounts {
  id: string;
  product_id: string;
  product_name: string;
  quantity: number;
  selling_price: number;
  total_price: number;
  unit_cost: number | null;
  sale_date: string;
  payment_method: PaymentMethod;
  description: string | null;
  created_at: string;
  created_by: string | null;
  credit: CreditRow | null;
}
