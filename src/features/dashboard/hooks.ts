import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchSalesInRange } from "@/features/sales/api";
import { queryKeys } from "@/lib/queryKeys";
import { computeDashboardMetrics, previousRange, type DateRangeKeys } from "./metrics";

/** Sales for the range and the period before it, turned into dashboard metrics. */
export function useDashboardMetrics(range: DateRangeKeys, timeZone: string, enabled: boolean) {
  const prev = previousRange(range);
  const current = useQuery({
    queryKey: queryKeys.sales.range(range.from, range.to),
    queryFn: () => fetchSalesInRange(range.from, range.to, timeZone),
    enabled,
  });
  const previous = useQuery({
    queryKey: queryKeys.sales.range(prev.from, prev.to),
    queryFn: () => fetchSalesInRange(prev.from, prev.to, timeZone),
    enabled,
  });
  const metrics = useMemo(
    () =>
      current.data && previous.data ? computeDashboardMetrics(current.data, previous.data, range, timeZone) : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [current.data, previous.data, range.from, range.to, timeZone],
  );
  return {
    metrics,
    isLoading: current.isLoading || previous.isLoading,
    error: current.error ?? previous.error,
  };
}
