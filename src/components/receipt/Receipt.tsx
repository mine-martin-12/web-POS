import React from "react";
import { format } from "date-fns";
import { formatMoney } from "@/lib/currency";
import { dayKey, parseDayKey } from "@/lib/dates";
import { fromCents, saleMoney } from "@/lib/finance";
import { PAYMENT_METHOD_LABELS, type SaleRow } from "@/features/sales/types";

export interface ReceiptBusiness {
  name: string;
  address?: string | null;
  phone?: string | null;
  currency: string;
  timezone: string;
}

/** A printable receipt. Rendered to static HTML (see printReceipt), so it takes plain
 *  props and uses no context. React escapes every user-supplied string. */
export function Receipt({ sale, business }: { sale: SaleRow; business: ReceiptBusiness }) {
  const money = (amount: number) => formatMoney(amount, business.currency);
  const m = saleMoney(sale);
  const day = dayKey(sale.sale_date, business.timezone);
  const time = new Intl.DateTimeFormat("en-GB", {
    timeZone: business.timezone,
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(sale.sale_date));

  return (
    <div className="receipt-container">
      <div className="center section">
        <h2>{business.name}</h2>
        {business.address && <p>{business.address}</p>}
        {business.phone && <p>{business.phone}</p>}
      </div>

      <div className="section">
        <div className="row">
          <span>Receipt #</span>
          <span>RCP-{sale.id.slice(-8).toUpperCase()}</span>
        </div>
        <div className="row">
          <span>Date</span>
          <span>
            {format(parseDayKey(day), "dd MMM yyyy")} {time}
          </span>
        </div>
        {sale.credit?.customer_name && (
          <div className="row">
            <span>Customer</span>
            <span>{sale.credit.customer_name}</span>
          </div>
        )}
      </div>

      <div className="section">
        <div className="row">
          <span>{sale.product_name}</span>
          <span>{money(sale.total_price)}</span>
        </div>
        <div className="muted">
          {sale.quantity} x {money(sale.selling_price)}
        </div>
        {sale.description && <div className="muted">{sale.description}</div>}
      </div>

      <div className="section">
        <div className="row bold">
          <span>TOTAL</span>
          <span>{money(fromCents(m.billed))}</span>
        </div>
        <div className="row">
          <span>Paid</span>
          <span>{money(fromCents(m.collected))}</span>
        </div>
        {m.outstanding > 0 && (
          <div className="row bold">
            <span>BALANCE DUE</span>
            <span>{money(fromCents(m.outstanding))}</span>
          </div>
        )}
        {sale.payment_method !== "credit" && (
          <div className="row">
            <span>Paid by</span>
            <span>{PAYMENT_METHOD_LABELS[sale.payment_method]}</span>
          </div>
        )}
        {m.outstanding > 0 && sale.credit?.due_date && (
          <div className="row">
            <span>Balance due on</span>
            <span>{format(parseDayKey(sale.credit.due_date), "dd MMM yyyy")}</span>
          </div>
        )}
      </div>

      <div className="center muted">
        <p>Thank you for your business!</p>
      </div>
    </div>
  );
}
