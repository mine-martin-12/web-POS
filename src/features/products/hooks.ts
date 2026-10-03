import { useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import { addStock, archiveProduct, createProduct, updateProduct, type ProductInput } from "./api";

export { useProducts } from "@/features/sales/hooks";

function useProductMutation<TInput, TResult>(fn: (input: TInput) => Promise<TResult>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.products.all }),
  });
}

export const useCreateProduct = () => useProductMutation(createProduct);
export const useUpdateProduct = () =>
  useProductMutation((input: { id: string; product: ProductInput }) => updateProduct(input.id, input.product));
export const useArchiveProduct = () => useProductMutation(archiveProduct);
export const useAddStock = () => useProductMutation(addStock);
