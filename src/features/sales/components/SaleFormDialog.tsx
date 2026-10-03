import React, { useEffect, useMemo, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { DateField } from "@/components/common/DateField";
import { Money } from "@/components/common/Money";
import { invalidInputClass } from "@/components/common/form-fields";
import { CustomerPicker } from "@/features/customers/components/CustomerPicker";
import type { CustomerChoice } from "@/features/customers/types";
import type { Product } from "@/features/products/api";
import { addDaysToKey, DEFAULT_TIME_ZONE, dayKey, todayKey } from "@/lib/dates";
import { getErrorMessage } from "@/lib/errors";
import { clampPayment, saleMoney, toCents } from "@/lib/finance";
import { cn } from "@/lib/utils";
import { invalidSummary } from "@/lib/validation";
import { useRequestChange } from "@/features/approvals/useRequestChange";
import { useRecordSale, useUpdateSale } from "../hooks";
import {
  PAYMENT_METHOD_LABELS,
  PAYMENT_TYPE_LABELS,
  type PaidMethod,
  type PaymentType,
  type SaleChanges,
  type SaleRow,
} from "../types";

const DEFAULT_DUE_IN_DAYS = 7;

const schema = z.object({
  productId: z.string().min(1, "Choose a product"),
  quantity: z.string().trim().refine((v) => /^\d+$/.test(v) && Number(v) >= 1, "Enter a whole number, at least 1"),
  sellingPrice: z
    .string()
    .trim()
    .refine((v) => v !== "" && Number.isFinite(Number(v)) && Number(v) >= 0, "Enter the price per item"),
  saleDay: z.string().min(1, "Choose the sale date"),
  paymentType: z.enum(["paid", "partial", "credit"]),
  paymentMethod: z.enum(["cash", "mpesa", "bank_cheque"]),
  deposit: z.string().trim(),
  dueDate: z.string(),
  description: z.string().trim().max(500, "Keep notes under 500 characters"),
});
type FormData = z.infer<typeof schema>;

interface SaleFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  products: Product[];
  /** Edit this sale (admins); omit to record a new one. */
  sale?: SaleRow | null;
  /** Pre-select the business's most common payment method. */
  defaultMethod?: PaidMethod;
  /** Last price charged per product, to pre-fill the price. */
  lastPrices?: Map<string, number>;
  /** Staff: edits become a change request for an admin to approve. */
  requestMode?: boolean;
}

export function SaleFormDialog({
  open,
  onOpenChange,
  products,
  sale,
  defaultMethod = "cash",
  lastPrices,
  requestMode = false,
}: SaleFormDialogProps) {
  const { request, dialog: reasonDialog } = useRequestChange();
  const { business } = useAuth();
  const timeZone = business?.timezone ?? DEFAULT_TIME_ZONE;
  const today = todayKey(timeZone);
  const record = useRecordSale();
  const update = useUpdateSale();
  const busy = record.isPending || update.isPending;
  const editing = !!sale;
  const saleType: PaymentType | null = sale
    ? sale.credit
      ? saleMoney(sale).collected > 0 || sale.payment_method !== "credit"
        ? "partial"
        : "credit"
      : "paid"
    : null;

  const [customer, setCustomer] = useState<CustomerChoice>(null);
  const [customerError, setCustomerError] = useState<string | null>(null);

  const form = useForm<FormData>({
    resolver: zodResolver(schema),
    reValidateMode: "onSubmit",
    defaultValues: emptyValues(today, defaultMethod),
  });
  const { control, register, watch, setValue, setError, clearErrors, formState } = form;
  const errors = formState.errors;

  useEffect(() => {
    if (!open) return;
    setCustomerError(null);
    if (sale) {
      form.reset({
        productId: sale.product_id,
        quantity: String(sale.quantity),
        sellingPrice: String(sale.selling_price),
        saleDay: dayKey(sale.sale_date, timeZone),
        paymentType: saleType ?? "paid",
        paymentMethod: sale.payment_method === "credit" ? defaultMethod : sale.payment_method,
        deposit: "",
        dueDate: sale.credit?.due_date ?? "",
        description: sale.description ?? "",
      });
      setCustomer(
        sale.customer
          ? { kind: "customer", customer: { ...sale.customer, phone: null, notes: null, created_at: "", archived_at: null } }
          : { kind: "walk-in" },
      );
    } else {
      form.reset(emptyValues(today, defaultMethod));
      setCustomer(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, sale]);

  const [productId, quantity, sellingPrice, paymentType, deposit, saleDay] = watch([
    "productId",
    "quantity",
    "sellingPrice",
    "paymentType",
    "deposit",
    "saleDay",
  ]);
  const product = products.find((p) => p.id === productId);
  const totalCents = (Number(quantity) || 0) * toCents(sellingPrice);
  const depositCents = clampPayment(toCents(deposit), totalCents);
  const needsCustomer = paymentType !== "paid";

  // Pre-fill the price with what this product last sold for (new sales only).
  useEffect(() => {
    if (editing || !productId) return;
    const last = lastPrices?.get(productId);
    if (last !== undefined && form.getValues("sellingPrice") === "") setValue("sellingPrice", String(last));
  }, [productId, editing, lastPrices, setValue, form]);

  // Credit and part-payment sales get a due date a week out by default.
  useEffect(() => {
    if (paymentType !== "paid" && !form.getValues("dueDate")) {
      setValue("dueDate", addDaysToKey(saleDay || today, DEFAULT_DUE_IN_DAYS));
    }
  }, [paymentType, saleDay, today, setValue, form]);

  /** Rules that depend on more than one field or on data outside the form. */
  const crossCheck = (data: FormData): boolean => {
    let ok = true;
    const qty = Number(data.quantity);
    const available = (product?.stock_quantity ?? 0) + (sale && sale.product_id === data.productId ? sale.quantity : 0);
    if (product && qty > available) {
      setError("quantity", { message: `Only ${available} in stock` });
      ok = false;
    }
    if (!editing && data.paymentType === "partial") {
      const d = toCents(data.deposit);
      if (!(d > 0 && d < totalCents)) {
        setError("deposit", { message: "Enter an amount above 0 and below the total" });
        ok = false;
      }
    }
    if (data.paymentType !== "paid") {
      if (!data.dueDate) {
        setError("dueDate", { message: "Choose when the balance is due" });
        ok = false;
      } else if (data.dueDate < data.saleDay) {
        setError("dueDate", { message: "The due date can't be before the sale" });
        ok = false;
      }
      if (customer?.kind !== "customer") {
        setCustomerError("Choose who owes the balance (walk-ins can't take credit)");
        ok = false;
      }
    } else if (!customer) {
      setCustomerError("Choose a customer or Walk-in / guest");
      ok = false;
    }
    return ok;
  };

  const onValid = async (data: FormData) => {
    if (!crossCheck(data)) {
      toast.error("Please check the form");
      return;
    }
    const customerId = customer?.kind === "customer" ? customer.customer.id : null;
    try {
      if (sale) {
        const changes = diffSale(sale, data, customerId, timeZone);
        if (requestMode) {
          // Due dates are requested on the credit itself (Credits page).
          const { due_date: _dueDate, ...values } = changes;
          if (Object.keys(values).length === 0) {
            toast.info("Nothing to change");
            return;
          }
          request({ table: "sales", recordId: sale.id, values: { ...values }, onDone: () => onOpenChange(false) });
          return;
        }
        if (Object.keys(changes).length === 0) {
          onOpenChange(false);
          return;
        }
        await update.mutateAsync({ id: sale.id, changes });
        toast.success("Sale updated");
      } else {
        await record.mutateAsync({
          productId: data.productId,
          quantity: Number(data.quantity),
          sellingPrice: Number(data.sellingPrice),
          paymentType: data.paymentType,
          paymentMethod: data.paymentMethod,
          deposit: Number(data.deposit) || 0,
          dueDate: data.paymentType === "paid" ? null : data.dueDate,
          customerId,
          saleDay: data.saleDay === today ? null : data.saleDay,
          description: data.description,
        });
        toast.success("Sale recorded", {
          description:
            data.paymentType === "paid"
              ? `${product?.name ?? "Sale"} · paid in full`
              : `${product?.name ?? "Sale"} · balance added to Credits`,
        });
      }
      onOpenChange(false);
    } catch (error) {
      toast.error(editing ? "Couldn't update the sale" : "Couldn't record the sale", {
        description: getErrorMessage(error),
      });
    }
  };

  const onInvalid = (formErrors: Record<string, unknown>) => {
    crossCheck(form.getValues());
    toast.error(invalidSummary(formErrors).title, { description: invalidSummary(formErrors).description });
  };

  const field = (name: keyof FormData) => ({
    id: `sale-${name}`,
    "aria-invalid": !!errors[name],
    "aria-describedby": errors[name] ? `sale-${name}-error` : undefined,
  });
  const errorText = (name: keyof FormData) =>
    errors[name] ? (
      <p id={`sale-${name}-error`} className="text-sm font-medium text-destructive">
        {errors[name]?.message}
      </p>
    ) : null;
  const labelClass = (name: keyof FormData) => cn(errors[name] && "text-destructive");
  const clearOnChange = (name: keyof FormData) => ({
    onChange: () => clearErrors(name),
  });

  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? (requestMode ? "Request a change" : "Edit sale") : "Record a sale"}</DialogTitle>
          <DialogDescription>
            {editing
              ? `${saleType ? PAYMENT_TYPE_LABELS[saleType] : ""}. Payments on credit are recorded on the Credits page.`
              : "Stock is updated as soon as the sale is saved."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(onValid, onInvalid)} className="space-y-4" noValidate>
          {/* Product */}
          <div className="space-y-2">
            <Label htmlFor="sale-productId" className={labelClass("productId")}>
              Product
            </Label>
            <Controller
              control={control}
              name="productId"
              render={({ field: f }) => (
                <Select
                  value={f.value}
                  onValueChange={(v) => {
                    f.onChange(v);
                    clearErrors(["productId", "quantity"]);
                    if (!editing) setValue("sellingPrice", "");
                  }}
                >
                  <SelectTrigger {...field("productId")} className={invalidInputClass}>
                    <SelectValue placeholder="Choose a product" />
                  </SelectTrigger>
                  <SelectContent>
                    {products.length === 0 && (
                      <div className="px-3 py-2 text-sm text-muted-foreground">Add products first.</div>
                    )}
                    {products.map((p) => {
                      const out = p.stock_quantity <= 0 && p.id !== sale?.product_id;
                      return (
                        <SelectItem key={p.id} value={p.id} disabled={out}>
                          {p.name}
                          {p.size ? ` (${p.size})` : ""} · {out ? "out of stock" : `${p.stock_quantity} in stock`}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              )}
            />
            {errorText("productId")}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="sale-quantity" className={labelClass("quantity")}>
                Quantity
              </Label>
              <Input
                type="number"
                inputMode="numeric"
                min={1}
                step={1}
                {...field("quantity")}
                {...register("quantity", clearOnChange("quantity"))}
                className={invalidInputClass}
              />
              {errorText("quantity")}
            </div>
            <div className="space-y-2">
              <Label htmlFor="sale-sellingPrice" className={labelClass("sellingPrice")}>
                Price each
              </Label>
              <Input
                type="number"
                inputMode="decimal"
                min={0}
                step="0.01"
                {...field("sellingPrice")}
                {...register("sellingPrice", clearOnChange("sellingPrice"))}
                className={invalidInputClass}
              />
              {errorText("sellingPrice")}
            </div>
          </div>
          <p className="flex items-center justify-between rounded-md bg-muted px-3 py-2 text-sm">
            <span className="text-muted-foreground">Total</span>
            <Money cents={totalCents} className="font-semibold" />
          </p>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="sale-saleDay" className={labelClass("saleDay")}>
                Sale date
              </Label>
              <Controller
                control={control}
                name="saleDay"
                render={({ field: f }) => (
                  <DateField id="sale-saleDay" value={f.value} onChange={f.onChange} max={today} invalid={!!errors.saleDay} />
                )}
              />
              {errorText("saleDay")}
            </div>
            <div className="space-y-2">
              <Label htmlFor="sale-customer" className={cn(customerError && "text-destructive")}>
                Customer{needsCustomer ? "" : " (optional)"}
              </Label>
              <CustomerPicker
                id="sale-customer"
                value={customer}
                onChange={(c) => {
                  setCustomer(c);
                  setCustomerError(null);
                }}
                allowWalkIn={!needsCustomer}
                invalid={!!customerError}
              />
              {customerError && <p className="text-sm font-medium text-destructive">{customerError}</p>}
            </div>
          </div>

          {/* Payment */}
          <fieldset className="space-y-2" disabled={editing}>
            <legend className="text-sm font-medium">Payment</legend>
            <Controller
              control={control}
              name="paymentType"
              render={({ field: f }) => (
                <RadioGroup
                  value={f.value}
                  onValueChange={(v) => {
                    f.onChange(v);
                    clearErrors(["deposit", "dueDate"]);
                    setCustomerError(null);
                    if (v !== "paid" && customer?.kind === "walk-in") setCustomer(null);
                  }}
                  className="grid grid-cols-3 gap-2"
                >
                  {(["paid", "partial", "credit"] as const).map((type) => (
                    <Label
                      key={type}
                      htmlFor={`pay-${type}`}
                      className={cn(
                        "flex cursor-pointer items-center justify-center gap-2 rounded-md border px-2 py-2 text-center text-sm font-normal transition-colors",
                        f.value === type ? "border-primary bg-primary/10 text-primary" : "hover:bg-muted",
                        editing && "cursor-not-allowed opacity-70",
                      )}
                    >
                      <RadioGroupItem id={`pay-${type}`} value={type} className="sr-only" />
                      {PAYMENT_TYPE_LABELS[type]}
                    </Label>
                  ))}
                </RadioGroup>
              )}
            />
          </fieldset>

          {paymentType !== "credit" && !(editing && sale?.credit) && (
            <div className="space-y-2">
              <Label htmlFor="sale-paymentMethod">{paymentType === "partial" ? "Deposit paid by" : "Paid by"}</Label>
              <Controller
                control={control}
                name="paymentMethod"
                render={({ field: f }) => (
                  <Select value={f.value} onValueChange={f.onChange}>
                    <SelectTrigger id="sale-paymentMethod">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(["cash", "mpesa", "bank_cheque"] as const).map((m) => (
                        <SelectItem key={m} value={m}>
                          {PAYMENT_METHOD_LABELS[m]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
          )}

          {paymentType === "partial" && !editing && (
            <div className="space-y-2">
              <Label htmlFor="sale-deposit" className={labelClass("deposit")}>
                Deposit paid now
              </Label>
              <Input
                type="number"
                inputMode="decimal"
                min={0}
                step="0.01"
                {...field("deposit")}
                {...register("deposit", clearOnChange("deposit"))}
                className={invalidInputClass}
              />
              {errorText("deposit")}
              {totalCents > 0 && (
                <p className="text-sm text-muted-foreground">
                  Balance on credit: <Money cents={totalCents - depositCents} />
                </p>
              )}
            </div>
          )}

          {paymentType !== "paid" && !(editing && requestMode) && (
            <div className="space-y-2">
              <Label htmlFor="sale-dueDate" className={labelClass("dueDate")}>
                Balance due on
              </Label>
              <Controller
                control={control}
                name="dueDate"
                render={({ field: f }) => (
                  <DateField
                    id="sale-dueDate"
                    value={f.value}
                    onChange={(v) => {
                      f.onChange(v);
                      clearErrors("dueDate");
                    }}
                    min={saleDay || today}
                    invalid={!!errors.dueDate}
                  />
                )}
              />
              {errorText("dueDate")}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="sale-description">Notes (optional)</Label>
            <Textarea id="sale-description" rows={2} {...register("description")} />
            {errorText("description")}
          </div>

          {/* On mobile the primary action comes first and buttons are full width. */}
          <DialogFooter className="flex-col gap-2 sm:flex-row-reverse sm:justify-start sm:gap-2">
            <Button type="submit" disabled={busy} className="w-full sm:w-auto">
              {busy ? "Saving…" : editing ? (requestMode ? "Continue" : "Save changes") : "Record sale"}
            </Button>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy} className="w-full sm:w-auto">
              Cancel
            </Button>
          </DialogFooter>
        </form>
        {reasonDialog}
      </DialogContent>
    </Dialog>
  );
}

function emptyValues(today: string, method: PaidMethod): FormData {
  return {
    productId: "",
    quantity: "1",
    sellingPrice: "",
    saleDay: today,
    paymentType: "paid",
    paymentMethod: method,
    deposit: "",
    dueDate: "",
    description: "",
  };
}

/** Only the fields that changed, in update_sale()'s vocabulary. */
function diffSale(sale: SaleRow, data: FormData, customerId: string | null, timeZone: string): SaleChanges {
  const changes: SaleChanges = {};
  if (data.productId !== sale.product_id) changes.product_id = data.productId;
  if (Number(data.quantity) !== sale.quantity) changes.quantity = Number(data.quantity);
  if (toCents(data.sellingPrice) !== toCents(sale.selling_price)) changes.selling_price = Number(data.sellingPrice);
  if (data.saleDay !== dayKey(sale.sale_date, timeZone)) changes.sale_day = data.saleDay;
  if ((data.description || null) !== (sale.description || null)) changes.description = data.description;
  if (customerId !== (sale.customer?.id ?? null)) changes.customer_id = customerId;
  if (!sale.credit && data.paymentMethod !== sale.payment_method) changes.payment_method = data.paymentMethod;
  if (sale.credit && data.dueDate && data.dueDate !== sale.credit.due_date) changes.due_date = data.dueDate;
  return changes;
}
