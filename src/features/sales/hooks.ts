import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchProducts } from "@/features/products/api";
import { queryKeys } from "@/lib/queryKeys";
import { deleteSale, fetchSales, recordSale, updateSale } from "./api";
import type { RecordSaleInput, SaleChanges } from "./types";

export const useSales = () => useQuery({ queryKey: queryKeys.sales.list(), queryFn: fetchSales });

export const useProducts = () => useQuery({ queryKey: queryKeys.products.list(), queryFn: fetchProducts });

/** A sale touches stock, credits, customers' recency and the overdue badge. */
function useSaleMutation<TInput, TResult>(fn: (input: TInput) => Promise<TResult>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSettled: () =>
      Promise.all(
        [queryKeys.sales.all, queryKeys.products.all, queryKeys.credits.all, queryKeys.customers.all, queryKeys.nav.all].map(
          (queryKey) => queryClient.invalidateQueries({ queryKey }),
        ),
      ),
  });
}

export const useRecordSale = () => useSaleMutation((input: RecordSaleInput) => recordSale(input));
export const useUpdateSale = () => useSaleMutation((input: { id: string; changes: SaleChanges }) => updateSale(input.id, input.changes));
export const useDeleteSale = () => useSaleMutation(deleteSale);
