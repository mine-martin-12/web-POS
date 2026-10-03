import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { getErrorMessage } from "@/lib/errors";
import { optimisticListUpdate } from "@/lib/optimistic";
import { queryKeys } from "@/lib/queryKeys";
import { createExpense, deleteExpense, fetchExpenses, updateExpense, type Expense, type ExpenseInput } from "./api";

export const useExpenses = (from: string, to: string, enabled = true) =>
  useQuery({ queryKey: queryKeys.expenses.range(from, to), queryFn: () => fetchExpenses(from, to), enabled });

function useExpenseMutation<TInput>(fn: (input: TInput) => Promise<void>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.expenses.all }),
  });
}

export const useCreateExpense = () => useExpenseMutation(createExpense);
export const useUpdateExpense = () =>
  useExpenseMutation((input: { id: string; expense: ExpenseInput }) => updateExpense(input.id, input.expense));

export function useDeleteExpense() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (expense: Expense) => deleteExpense(expense.id),
    onMutate: async (expense: Expense) => ({
      rollback: await optimisticListUpdate<Expense>(queryClient, queryKeys.expenses.all, (rows) =>
        rows.filter((e) => e.id !== expense.id),
      ),
    }),
    onError: (error, _expense, context) => {
      context?.rollback();
      toast.error("Couldn't delete the expense", { description: getErrorMessage(error) });
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.expenses.all }),
  });
}
