-- =====================================================================================
-- Phase 2: atomic sales
--
-- record_sale() creates the sale, its credit and any deposit in ONE transaction (the old
-- UI inserted the sale and then the credit from the browser; if the second call failed
-- the sale existed without its debt). Sales and credits are no longer writable directly
-- by clients: every write goes through these functions, which enforce the money rules.
-- =====================================================================================

-- Credit amounts were unconstrained numeric; money is always 2 decimal places.
DROP TRIGGER IF EXISTS update_sale_transaction_status_trigger ON public.credits;

ALTER TABLE public.credits
  ALTER COLUMN amount_owed TYPE numeric(12,2),
  ALTER COLUMN amount_paid TYPE numeric(12,2);



-- Products are inserted directly by clients: default the tenant from the session so the
-- client never has to send (and can't choose) a business_id.
ALTER TABLE public.products ALTER COLUMN business_id SET DEFAULT public.get_user_business(auth.uid());

-- Business-local helpers ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.business_timezone(_business uuid)
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE((SELECT timezone FROM public.businesses WHERE id = _business), 'Africa/Nairobi');
$$;

-- A calendar day → the timestamp recorded for a sale on that day: "now" for today,
-- local noon for an earlier day (so the day never shifts in any time zone).
CREATE OR REPLACE FUNCTION public.sale_timestamp(_day date, _tz text)
RETURNS timestamptz
LANGUAGE sql STABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN _day IS NULL OR _day = (now() AT TIME ZONE _tz)::date THEN now()
    ELSE (_day + time '12:00') AT TIME ZONE _tz
  END;
$$;

-- -------------------------------------------------------------------------------------
-- record_sale
-- -------------------------------------------------------------------------------------
-- _payment_type: 'paid' (in full now), 'partial' (deposit now, rest on credit) or
-- 'credit' (nothing now). _payment_method is how today's money was paid.
CREATE OR REPLACE FUNCTION public.record_sale(
  _product_id uuid,
  _quantity integer,
  _selling_price numeric,
  _payment_type text DEFAULT 'paid',
  _payment_method text DEFAULT 'cash',
  _deposit numeric DEFAULT 0,
  _due_date date DEFAULT NULL,
  _customer_id uuid DEFAULT NULL,
  _sale_day date DEFAULT NULL,
  _description text DEFAULT NULL
)
RETURNS public.sales
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _business uuid := public.get_user_business(auth.uid());
  _tz text;
  _today date;
  _total numeric(12,2);
  _deposit_amount numeric(12,2) := round(COALESCE(_deposit, 0), 2);
  _sale public.sales;
  _credit_id uuid;
BEGIN
  IF _business IS NULL THEN
    RAISE EXCEPTION 'Your account is not an active member of a business' USING ERRCODE = '42501';
  END IF;
  _tz := public.business_timezone(_business);
  _today := (now() AT TIME ZONE _tz)::date;

  IF _quantity IS NULL OR _quantity <= 0 THEN
    RAISE EXCEPTION 'Quantity must be at least 1' USING ERRCODE = '22023';
  END IF;
  IF _selling_price IS NULL OR _selling_price < 0 THEN
    RAISE EXCEPTION 'Selling price can''t be negative' USING ERRCODE = '22023';
  END IF;
  IF _sale_day IS NOT NULL AND _sale_day > _today THEN
    RAISE EXCEPTION 'The sale date can''t be in the future' USING ERRCODE = '22023';
  END IF;
  IF _payment_type NOT IN ('paid', 'partial', 'credit') THEN
    RAISE EXCEPTION 'Unknown payment type %', _payment_type USING ERRCODE = '22023';
  END IF;
  IF _payment_type <> 'credit' AND _payment_method NOT IN ('cash', 'mpesa', 'bank_cheque') THEN
    RAISE EXCEPTION 'Choose how the customer paid' USING ERRCODE = '22023';
  END IF;

  _total := round(_quantity * _selling_price, 2);

  IF _payment_type IN ('partial', 'credit') THEN
    IF _customer_id IS NULL THEN
      RAISE EXCEPTION 'Choose the customer who owes the balance' USING ERRCODE = '22023';
    END IF;
    IF _due_date IS NULL THEN
      RAISE EXCEPTION 'Choose when the balance is due' USING ERRCODE = '22023';
    END IF;
    IF _due_date < COALESCE(_sale_day, _today) THEN
      RAISE EXCEPTION 'The due date can''t be before the sale' USING ERRCODE = '22023';
    END IF;
  END IF;
  IF _payment_type = 'partial' AND (_deposit_amount <= 0 OR _deposit_amount >= _total) THEN
    RAISE EXCEPTION 'The deposit must be more than 0 and less than the total' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.sales (
    business_id, product_id, quantity, selling_price, sale_date, description, payment_method, customer_id
  ) VALUES (
    _business, _product_id, _quantity, round(_selling_price, 2),
    public.sale_timestamp(_sale_day, _tz),
    NULLIF(btrim(_description), ''),
    CASE WHEN _payment_type = 'credit' THEN 'credit' ELSE _payment_method END,
    _customer_id
  )
  RETURNING * INTO _sale;

  IF _payment_type IN ('partial', 'credit') THEN
    INSERT INTO public.credits (business_id, sale_id, customer_id, customer_name, amount_owed, amount_paid, due_date)
    VALUES (
      _business, _sale.id, _customer_id,
      (SELECT name FROM public.customers WHERE id = _customer_id),
      _total,
      CASE WHEN _payment_type = 'partial' THEN _deposit_amount ELSE 0 END,
      _due_date
    )
    RETURNING id INTO _credit_id;

    IF _payment_type = 'partial' THEN
      INSERT INTO public.credit_payments (business_id, credit_id, amount, payment_method, paid_at)
      VALUES (_business, _credit_id, _deposit_amount, _payment_method, _sale.sale_date);
    END IF;
  END IF;

  RETURN _sale;
END;
$$;

-- -------------------------------------------------------------------------------------
-- Editing a sale: a per-column whitelist, applied atomically together with its credit.
-- apply_sale_changes() is internal (no client grant); update_sale() is the admin entry
-- point; the approval workflow (next migration) calls apply_sale_changes() too.
-- -------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.apply_sale_changes(_sale_id uuid, _changes jsonb)
RETURNS public.sales
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _allowed text[] := ARRAY['product_id', 'quantity', 'selling_price', 'sale_day', 'description',
                           'customer_id', 'payment_method', 'due_date'];
  _key text;
  _sale public.sales;
  _credit public.credits;
  _tz text;
  _new_total numeric(12,2);
BEGIN
  FOR _key IN SELECT jsonb_object_keys(_changes) LOOP
    IF NOT (_key = ANY (_allowed)) THEN
      RAISE EXCEPTION 'The field "%" can''t be changed', _key USING ERRCODE = '22023';
    END IF;
  END LOOP;

  SELECT * INTO _sale FROM public.sales WHERE id = _sale_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sale not found' USING ERRCODE = 'P0002';
  END IF;
  SELECT * INTO _credit FROM public.credits WHERE sale_id = _sale_id FOR UPDATE;
  _tz := public.business_timezone(_sale.business_id);

  IF _changes ? 'payment_method' THEN
    IF _credit.id IS NOT NULL THEN
      RAISE EXCEPTION 'This sale has a credit balance; record payments on the Credits page instead'
        USING ERRCODE = '22023';
    END IF;
    IF _changes ->> 'payment_method' NOT IN ('cash', 'mpesa', 'bank_cheque') THEN
      RAISE EXCEPTION 'Choose cash, M-Pesa or bank/cheque' USING ERRCODE = '22023';
    END IF;
  END IF;
  IF (_changes ? 'due_date') AND _credit.id IS NULL THEN
    RAISE EXCEPTION 'Only credit sales have a due date' USING ERRCODE = '22023';
  END IF;
  IF (_changes ? 'customer_id') AND _changes ->> 'customer_id' IS NULL AND _credit.id IS NOT NULL THEN
    RAISE EXCEPTION 'A credit sale needs a customer' USING ERRCODE = '22023';
  END IF;
  IF (_changes ? 'sale_day') AND (_changes ->> 'sale_day')::date > (now() AT TIME ZONE _tz)::date THEN
    RAISE EXCEPTION 'The sale date can''t be in the future' USING ERRCODE = '22023';
  END IF;

  UPDATE public.sales SET
    product_id     = COALESCE((_changes ->> 'product_id')::uuid, product_id),
    quantity       = COALESCE((_changes ->> 'quantity')::integer, quantity),
    selling_price  = COALESCE(round((_changes ->> 'selling_price')::numeric, 2), selling_price),
    sale_date      = CASE WHEN _changes ? 'sale_day'
                          THEN public.sale_timestamp((_changes ->> 'sale_day')::date, _tz) ELSE sale_date END,
    description    = CASE WHEN _changes ? 'description'
                          THEN NULLIF(btrim(_changes ->> 'description'), '') ELSE description END,
    customer_id    = CASE WHEN _changes ? 'customer_id'
                          THEN (_changes ->> 'customer_id')::uuid ELSE customer_id END,
    payment_method = COALESCE(_changes ->> 'payment_method', payment_method)
  WHERE id = _sale_id
  RETURNING * INTO _sale;

  IF _credit.id IS NOT NULL THEN
    _new_total := _sale.total_price;
    IF _new_total < _credit.amount_paid THEN
      RAISE EXCEPTION 'The customer has already paid % which is more than the new total of %',
        _credit.amount_paid, _new_total USING ERRCODE = '22023';
    END IF;
    UPDATE public.credits SET
      amount_owed = _new_total,
      customer_id = _sale.customer_id,
      due_date    = COALESCE((_changes ->> 'due_date')::date, due_date)
    WHERE id = _credit.id;
  END IF;

  RETURN _sale;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_sale(_sale_id uuid, _changes jsonb)
RETURNS public.sales
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() OR NOT EXISTS (
    SELECT 1 FROM public.sales WHERE id = _sale_id AND business_id = public.get_user_business(auth.uid())
  ) THEN
    RAISE EXCEPTION 'Admin privileges required' USING ERRCODE = '42501';
  END IF;
  RETURN public.apply_sale_changes(_sale_id, _changes);
END;
$$;

-- -------------------------------------------------------------------------------------
-- Privileges: sales and credits are written only through the functions above (plus
-- record_credit_payment). Admins may still delete a sale (its credit and payments go
-- with it and stock is returned). Products: admins edit/archive; staff add and restock.
-- -------------------------------------------------------------------------------------
REVOKE INSERT, UPDATE ON public.sales FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.credits FROM authenticated;

DROP POLICY IF EXISTS "Members can record sales" ON public.sales;
DROP POLICY IF EXISTS "Members can update their sales" ON public.sales;
DROP POLICY IF EXISTS "Members can add credits" ON public.credits;
DROP POLICY IF EXISTS "Members can update credits" ON public.credits;
DROP POLICY IF EXISTS "Admins can delete credits" ON public.credits;

DROP POLICY IF EXISTS "Members can update products" ON public.products;
CREATE POLICY "Admins can update products" ON public.products
  FOR UPDATE TO authenticated
  USING (business_id = (SELECT public.get_user_business(auth.uid())) AND (SELECT public.is_admin()))
  WITH CHECK (business_id = (SELECT public.get_user_business(auth.uid())));

REVOKE EXECUTE ON FUNCTION
  public.record_sale(uuid, integer, numeric, text, text, numeric, date, uuid, date, text),
  public.update_sale(uuid, jsonb),
  public.business_timezone(uuid)
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION
  public.record_sale(uuid, integer, numeric, text, text, numeric, date, uuid, date, text),
  public.update_sale(uuid, jsonb)
TO authenticated;
REVOKE EXECUTE ON FUNCTION public.apply_sale_changes(uuid, jsonb), public.business_timezone(uuid)
FROM PUBLIC, anon, authenticated;
