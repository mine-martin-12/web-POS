import type { Tables } from "@/integrations/supabase/types";
import type { SaleAmounts } from "@/lib/finance";

export type PaymentMethod = "cash" | "mpesa" | "bank_cheque" | "credit";
export type PaidMethod = Exclude<PaymentMethod, "credit">;
export type PaymentType = "paid" | "partial" | "credit";

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: "Cash",
  mpesa: "M-Pesa",
  bank_cheque: "Bank/Cheque",
  credit: "Credit",
};

export const PAYMENT_TYPE_LABELS: Record<PaymentType, string> = {
  paid: "Paid in full",
  partial: "Part payment",
  credit: "On credit",
};

export type CreditRow = Pick<
  Tables<"credits">,
  "id" | "amount_owed" | "amount_paid" | "status" | "due_date" | "customer_name"
>;

/** A sale with its product, customer and (optional) credit, normalised from the API shape. */
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
  customer: { id: string; name: string } | null;
  credit: CreditRow | null;
}

export interface RecordSaleInput {
  productId: string;
  quantity: number;
  sellingPrice: number;
  paymentType: PaymentType;
  paymentMethod: PaidMethod;
  deposit: number;
  dueDate: string | null;
  customerId: string | null;
  saleDay: string | null;
  description: string;
}

/** Fields update_sale() accepts (its server-side whitelist). */
export interface SaleChanges {
  product_id?: string;
  quantity?: number;
  selling_price?: number;
  sale_day?: string;
  description?: string;
  customer_id?: string | null;
  payment_method?: PaidMethod;
  due_date?: string;
}
