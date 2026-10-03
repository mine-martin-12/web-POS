-- =====================================================================================
-- Phase 3: month-first browsing
--
-- Per-month totals for the Sales archive grid. SECURITY INVOKER: row-level security
-- applies, so staff summarise only the sales they recorded. Months are cut in the
-- business time zone; outstanding is clamped exactly like src/lib/finance.ts, so
-- billed = collected + outstanding in every row.
-- =====================================================================================
CREATE OR REPLACE FUNCTION public.sales_month_summary()
RETURNS TABLE (month text, sales_count integer, billed numeric, collected numeric, outstanding numeric)
LANGUAGE sql STABLE SECURITY INVOKER
SET search_path = public
AS $$
  WITH rows AS (
    SELECT
      to_char(s.sale_date AT TIME ZONE b.timezone, 'YYYY-MM') AS month,
      s.total_price,
      LEAST(GREATEST(COALESCE(c.amount_owed - c.amount_paid, 0), 0), s.total_price) AS owed
    FROM public.sales s
    JOIN public.businesses b ON b.id = s.business_id
    LEFT JOIN public.credits c ON c.sale_id = s.id
  )
  SELECT month, count(*)::integer, sum(total_price), sum(total_price - owed), sum(owed)
  FROM rows
  GROUP BY month
  ORDER BY month DESC;
$$;

REVOKE EXECUTE ON FUNCTION public.sales_month_summary() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sales_month_summary() TO authenticated;
