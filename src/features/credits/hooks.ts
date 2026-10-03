import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { getErrorMessage } from "@/lib/errors";
import { creditOutstanding, fromCents } from "@/lib/finance";
import { optimisticListUpdate } from "@/lib/optimistic";
import { queryKeys } from "@/lib/queryKeys";
import type { CreditListRow } from "./api";
import { fetchCreditPayments, fetchCredits, fetchPaymentsInRange, recordCreditPayment } from "./api";

export const useCredits = () => useQuery({ queryKey: queryKeys.credits.list(), queryFn: fetchCredits });

export const usePaymentsInRange = (from: string, to: string, timeZone: string) =>
  useQuery({
    queryKey: queryKeys.credits.paymentsRange(from, to),
    queryFn: () => fetchPaymentsInRange(from, to, timeZone),
  });

export const useCreditPayments = (creditId: string | null) =>
  useQuery({
    queryKey: queryKeys.credits.payments(creditId ?? ""),
    queryFn: () => fetchCreditPayments(creditId!),
    enabled: !!creditId,
  });

export function useRecordPayment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: recordCreditPayment,
    onSettled: () =>
      Promise.all(
        [queryKeys.credits.all, queryKeys.sales.all, queryKeys.nav.all].map((queryKey) =>
          queryClient.invalidateQueries({ queryKey }),
        ),
      ),
  });
}

/** One tap: settle the whole balance. The row and tiles update instantly; on failure
 *  they roll back with an error toast; afterwards everything refetches quietly. */
export function useMarkCreditPaid() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (credit: CreditListRow) =>
      recordCreditPayment({ creditId: credit.id, amount: fromCents(creditOutstanding(credit)), method: "cash" }),
    onMutate: async (credit: CreditListRow) => {
      const rollback = await optimisticListUpdate<CreditListRow>(queryClient, queryKeys.credits.list(), (rows) =>
        rows.map((c) => (c.id === credit.id ? { ...c, amount_paid: c.amount_owed, status: "paid" } : c)),
      );
      return { rollback };
    },
    onError: (error, credit, context) => {
      context?.rollback();
      toast.error(`Couldn't mark ${credit.customer_name}'s credit as paid`, { description: getErrorMessage(error) });
    },
    onSettled: () =>
      Promise.all(
        [queryKeys.credits.all, queryKeys.sales.all, queryKeys.nav.all].map((queryKey) =>
          queryClient.invalidateQueries({ queryKey }),
        ),
      ),
  });
}
