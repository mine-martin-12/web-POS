import type { SalesApi } from "@/features/sales/api";
import { normalizeSale, toMonthSummary, type ApiSale } from "@/features/sales/api.supabase";
import type { RecordSaleInput, SaleChanges } from "@/features/sales/types";
import { addDaysToKey, DEFAULT_TIME_ZONE, startOfDayUtc } from "@/lib/dates";
import { asActor, callRpc, rows } from "../db/engine";

/** SALE_SELECT as SQL: the same columns and embeds, each embed limited by RLS like PostgREST's. */
const SALE_SQL = `
  SELECT s.id, s.product_id, s.quantity, s.selling_price, s.total_price, s.unit_cost, s.sale_date,
         s.payment_method, s.description, s.created_at, s.created_by,
         (SELECT json_build_object('name', p.name) FROM public.products p WHERE p.id = s.product_id) AS products,
         (SELECT json_build_object('id', c.id, 'name', c.name) FROM public.customers c WHERE c.id = s.customer_id) AS customers,
         (SELECT COALESCE(json_agg(json_build_object(
                   'id', cr.id, 'amount_owed', cr.amount_owed, 'amount_paid', cr.amount_paid,
                   'status', cr.status, 'due_date', cr.due_date, 'customer_name', cr.customer_name)), '[]'::json)
            FROM public.credits cr WHERE cr.sale_id = s.id) AS credits
  FROM public.sales s`;

export const sales = {
  async fetchSales() {
    const result = await asActor((tx) => rows<ApiSale>(tx, `${SALE_SQL} ORDER BY s.sale_date DESC, s.id DESC`));
    return result.map(normalizeSale);
  },

  async fetchSalesInRange(fromKey: string, toKey: string, timeZone = DEFAULT_TIME_ZONE) {
    const start = startOfDayUtc(fromKey, timeZone);
    const end = startOfDayUtc(addDaysToKey(toKey, 1), timeZone);
    const result = await asActor((tx) =>
      rows<ApiSale>(tx, `${SALE_SQL} WHERE s.sale_date >= $1 AND s.sale_date < $2 ORDER BY s.sale_date, s.id`, [start, end]),
    );
    return result.map(normalizeSale);
  },

  recordSale(input: RecordSaleInput) {
    return asActor((tx) =>
      callRpc(
        tx,
        "record_sale",
        {
          _product_id: input.productId,
          _quantity: input.quantity,
          _selling_price: input.sellingPrice,
          _payment_type: input.paymentType,
          _payment_method: input.paymentMethod,
          _deposit: input.paymentType === "partial" ? input.deposit : 0,
          _due_date: input.paymentType === "paid" ? undefined : (input.dueDate ?? undefined),
          _customer_id: input.customerId ?? undefined,
          _sale_day: input.saleDay ?? undefined,
          _description: input.description || undefined,
        },
        "row",
      ),
    ) as ReturnType<SalesApi["recordSale"]>;
  },

  updateSale(id: string, changes: SaleChanges) {
    return asActor((tx) => callRpc(tx, "update_sale", { _sale_id: id, _changes: changes }, "row")) as ReturnType<
      SalesApi["updateSale"]
    >;
  },

  async fetchMonthSummary() {
    const result = await asActor((tx) => callRpc<Parameters<typeof toMonthSummary>[0][]>(tx, "sales_month_summary", {}, "rows"));
    return result.map(toMonthSummary);
  },

  async deleteSale(id: string) {
    const deleted = await asActor((tx) => rows(tx, "DELETE FROM public.sales WHERE id = $1 RETURNING id", [id]));
    // RLS filters instead of erroring: no row back means it wasn't allowed.
    if (!deleted.length) throw new Error("This sale can't be deleted (admins only)");
  },
} satisfies SalesApi;
