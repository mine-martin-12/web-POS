import type { CreditsApi } from "@/features/credits/api";
import { toCreditListRow, toCreditPayment, type ApiCredit } from "@/features/credits/api.supabase";
import type { PaidMethod } from "@/features/sales/types";
import { addDaysToKey, startOfDayUtc } from "@/lib/dates";
import { asActor, callRpc, rows } from "../db/engine";

type PaymentRow = { id: string; amount: number; payment_method: string; paid_at: string };

export const credits = {
  async fetchCredits() {
    const result = await asActor((tx) =>
      rows<ApiCredit>(
        tx,
        `SELECT c.id, c.sale_id, c.customer_id, c.customer_name, c.amount_owed, c.amount_paid, c.status, c.due_date, c.created_at,
                (SELECT json_build_object('quantity', s.quantity, 'sale_date', s.sale_date,
                          'products', (SELECT json_build_object('name', p.name) FROM public.products p WHERE p.id = s.product_id))
                   FROM public.sales s WHERE s.id = c.sale_id) AS sales
         FROM public.credits c ORDER BY c.due_date, c.id`,
      ),
    );
    return result.map(toCreditListRow);
  },

  async fetchCreditPayments(creditId: string) {
    const result = await asActor((tx) =>
      rows<PaymentRow>(
        tx,
        "SELECT id, amount, payment_method, paid_at FROM public.credit_payments WHERE credit_id = $1 ORDER BY paid_at DESC",
        [creditId],
      ),
    );
    return result.map(toCreditPayment);
  },

  recordCreditPayment(input: { creditId: string; amount: number; method: PaidMethod }) {
    return asActor((tx) =>
      callRpc(
        tx,
        "record_credit_payment",
        { _credit_id: input.creditId, _amount: input.amount, _payment_method: input.method },
        "row",
      ),
    ) as ReturnType<CreditsApi["recordCreditPayment"]>;
  },

  async fetchPaymentsInRange(fromKey: string, toKey: string, timeZone: string) {
    const result = await asActor((tx) =>
      rows<PaymentRow>(
        tx,
        `SELECT id, amount, payment_method, paid_at FROM public.credit_payments
         WHERE paid_at >= $1 AND paid_at < $2 ORDER BY paid_at, id`,
        [startOfDayUtc(fromKey, timeZone), startOfDayUtc(addDaysToKey(toKey, 1), timeZone)],
      ),
    );
    return result.map((p) => ({ ...p, amount: Number(p.amount) }));
  },

  async countOverdueCredits(today: string) {
    const [{ n }] = await asActor((tx) =>
      rows<{ n: number }>(tx, "SELECT count(*)::int AS n FROM public.credits WHERE status <> 'paid' AND due_date < $1", [today]),
    );
    return n;
  },
} satisfies CreditsApi;
