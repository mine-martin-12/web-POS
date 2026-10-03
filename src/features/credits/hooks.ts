import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import { fetchCreditPayments, fetchCredits, recordCreditPayment } from "./api";

export const useCredits = () => useQuery({ queryKey: queryKeys.credits.list(), queryFn: fetchCredits });

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
