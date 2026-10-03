-- Month summary also returns cost of goods (quantity × unit cost at the time of sale),
-- so profit and net per month can be shown without loading every sale.
DROP FUNCTION IF EXISTS public.sales_month_summary();
CREATE FUNCTION public.sales_month_summary()
RETURNS TABLE (month text, sales_count integer, billed numeric, collected numeric, outstanding numeric, cost numeric)
LANGUAGE sql STABLE SECURITY INVOKER
SET search_path = public
AS $$
  WITH rows AS (
    SELECT
      to_char(s.sale_date AT TIME ZONE b.timezone, 'YYYY-MM') AS month,
      s.total_price,
      s.quantity * COALESCE(s.unit_cost, 0) AS cost,
      LEAST(GREATEST(COALESCE(c.amount_owed - c.amount_paid, 0), 0), s.total_price) AS owed
    FROM public.sales s
    JOIN public.businesses b ON b.id = s.business_id
    LEFT JOIN public.credits c ON c.sale_id = s.id
  )
  SELECT month, count(*)::integer, sum(total_price), sum(total_price - owed), sum(owed), sum(cost)
  FROM rows
  GROUP BY month
  ORDER BY month DESC;
$$;
REVOKE EXECUTE ON FUNCTION public.sales_month_summary() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sales_month_summary() TO authenticated;
