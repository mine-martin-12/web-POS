/** PostgREST stops at `max_rows` (1000) without any error, so any query whose total matters
 *  must page. */
export const PAGE_SIZE = 1000;

interface RangeableQuery<T> {
  range(from: number, to: number): PromiseLike<{ data: T[] | null; error: unknown }>;
}

/**
 * Fetch every row by paging until a short page comes back.
 *
 * `makeQuery` must build a fresh query with a STABLE, unique ordering (e.g.
 * `.order("sale_date").order("id")`), otherwise rows can repeat or go missing between pages.
 */
export async function fetchAll<T>(makeQuery: () => RangeableQuery<T>, pageSize = PAGE_SIZE): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await makeQuery().range(from, from + pageSize - 1);
    if (error) throw error;
    const page = data ?? [];
    rows.push(...page);
    if (page.length < pageSize) return rows;
  }
}
