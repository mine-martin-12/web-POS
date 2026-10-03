import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import { archiveCustomer, createCustomer, fetchCustomers, searchCustomers, updateCustomer, type CustomerInput } from "./api";
import type { PickerMode } from "./types";

export const useCustomers = () => useQuery({ queryKey: queryKeys.customers.list(), queryFn: fetchCustomers });

export const useCustomerSearch = (mode: PickerMode, term: string, enabled = true) =>
  useQuery({
    queryKey: queryKeys.customers.search(mode, term),
    queryFn: () => searchCustomers(mode, term),
    enabled: enabled && mode !== "keep-typing",
    staleTime: 15_000,
    placeholderData: (previous) => previous,
  });

function useCustomerMutation<TInput, TResult>(fn: (input: TInput) => Promise<TResult>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.customers.all }),
  });
}

export const useCreateCustomer = () =>
  useCustomerMutation((input: { customer: CustomerInput; force?: boolean }) => createCustomer(input.customer, input.force));
export const useUpdateCustomer = () =>
  useCustomerMutation((input: { id: string; customer: CustomerInput }) => updateCustomer(input.id, input.customer));
export const useArchiveCustomer = () => useCustomerMutation(archiveCustomer);
