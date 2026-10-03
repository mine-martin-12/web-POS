import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { fetchProducts } from "@/features/products/api";
import { recordCreditPayment } from "@/features/credits/api";
import { DEFAULT_TIME_ZONE } from "@/lib/dates";
import { getErrorMessage } from "@/lib/errors";
import { creditOutstanding, fromCents } from "@/lib/finance";
import { optimisticListUpdate } from "@/lib/optimistic";
import { queryKeys } from "@/lib/queryKeys";
import { deleteSale, fetchMonthSummary, fetchSales, fetchSalesInRange, recordSale, updateSale } from "./api";
import type { RecordSaleInput, SaleChanges, SaleRow } from "./types";

export const useSales = () => useQuery({ queryKey: queryKeys.sales.list(), queryFn: fetchSales });

export const useSalesRange = (from: string, to: string, timeZone = DEFAULT_TIME_ZONE) =>
  useQuery({ queryKey: queryKeys.sales.range(from, to), queryFn: () => fetchSalesInRange(from, to, timeZone) });

export const useMonthSummary = () => useQuery({ queryKey: queryKeys.sales.months(), queryFn: fetchMonthSummary });

export const useProducts = () => useQuery({ queryKey: queryKeys.products.list(), queryFn: fetchProducts });

const AFFECTED = [queryKeys.sales.all, queryKeys.products.all, queryKeys.credits.all, queryKeys.customers.all, queryKeys.nav.all];

/** A sale touches stock, credits, customers' recency and the overdue badge. */
function useSaleMutation<TInput, TResult>(fn: (input: TInput) => Promise<TResult>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSettled: () => Promise.all(AFFECTED.map((queryKey) => queryClient.invalidateQueries({ queryKey }))),
  });
}

export const useRecordSale = () => useSaleMutation((input: RecordSaleInput) => recordSale(input));
export const useUpdateSale = () => useSaleMutation((input: { id: string; changes: SaleChanges }) => updateSale(input.id, input.changes));
export const useDeleteSale = () => useSaleMutation(deleteSale);

/** Sale lists in the cache (full list and every date range) — not the month summary. */
const SALE_LISTS = [queryKeys.sales.list(), [...queryKeys.sales.all, "range"]];

function useOptimisticSaleMutation<TInput>(
  mutationFn: (input: TInput) => Promise<unknown>,
  update: (rows: SaleRow[], input: TInput) => SaleRow[],
  failureTitle: string,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onMutate: async (input: TInput) => {
      const rollbacks = await Promise.all(
        SALE_LISTS.map((key) => optimisticListUpdate<SaleRow>(queryClient, key, (rows) => update(rows, input))),
      );
      return { rollback: () => rollbacks.forEach((r) => r()) };
    },
    onError: (error, _input, context) => {
      context?.rollback();
      toast.error(failureTitle, { description: getErrorMessage(error) });
    },
    // Quiet refetch so the server's numbers win.
    onSettled: () => Promise.all(AFFECTED.map((queryKey) => queryClient.invalidateQueries({ queryKey }))),
  });
}

/** One tap: pay the whole balance of a credit sale. The row and totals update instantly. */
export const useMarkSalePaid = () =>
  useOptimisticSaleMutation(
    (sale: SaleRow) =>
      recordCreditPayment({ creditId: sale.credit!.id, amount: fromCents(creditOutstanding(sale.credit!)), method: "cash" }),
    (rows, sale) =>
      rows.map((r) =>
        r.id === sale.id && r.credit ? { ...r, credit: { ...r.credit, amount_paid: r.credit.amount_owed, status: "paid" } } : r,
      ),
    "Couldn't mark the sale as paid",
  );

/** Delete with the row disappearing immediately; it comes back if the server refuses. */
export const useDeleteSaleOptimistic = () =>
  useOptimisticSaleMutation(
    (sale: SaleRow) => deleteSale(sale.id),
    (rows, sale) => rows.filter((r) => r.id !== sale.id),
    "Couldn't delete the sale",
  );
