import type { QueryClient, QueryKey } from "@tanstack/react-query";

/**
 * Apply `update` to every cached list under `key` right away and return a rollback.
 * Usage in a mutation: onMutate → snapshot = optimisticListUpdate(...);
 * onError → snapshot(); onSettled → invalidate (quiet refetch).
 */
export async function optimisticListUpdate<T>(
  queryClient: QueryClient,
  key: QueryKey,
  update: (rows: T[]) => T[],
): Promise<() => void> {
  await queryClient.cancelQueries({ queryKey: key });
  const snapshot = queryClient.getQueriesData<T[]>({ queryKey: key });
  queryClient.setQueriesData<T[]>({ queryKey: key }, (old) => (Array.isArray(old) ? update(old) : old));
  return () => {
    for (const [k, data] of snapshot) queryClient.setQueryData(k, data);
  };
}
