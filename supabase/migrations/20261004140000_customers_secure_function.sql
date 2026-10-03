-- =====================================================================================
-- Replace the customers_secure view with a SECURITY DEFINER function
--
-- The view had to bypass RLS (clients have no SELECT on customers.phone), which the
-- Supabase linter flags as a "security definer view". Making it security_invoker would
-- break it: the caller can't read phone, so every read would fail. A SECURITY DEFINER
-- function with a fixed search_path is the supported way to do the same thing, and it
-- keeps the exact same columns, business filter and phone masking.
-- =====================================================================================

-- search_customers returns the view's row type, so it has to go before the view.
DROP FUNCTION IF EXISTS public.search_customers(text, integer);
DROP VIEW IF EXISTS public.customers_secure;

-- -------------------------------------------------------------------------------------
-- The one place customer rows (with phone) are read. Runs as the owner so it can read
-- phone, filters to the caller's business itself (inactive members and expired businesses
-- get nothing, via get_user_business) and masks phones for non-admins.
-- -------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.customers_secure()
RETURNS TABLE (
  id          uuid,
  business_id uuid,
  name        text,
  phone       text,
  notes       text,
  created_by  uuid,
  created_at  timestamptz,
  updated_at  timestamptz,
  archived_at timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    c.id,
    c.business_id,
    c.name,
    CASE WHEN (SELECT public.is_admin()) THEN c.phone ELSE public.mask_phone(c.phone) END,
    c.notes,
    c.created_by,
    c.created_at,
    c.updated_at,
    c.archived_at
  FROM public.customers c
  WHERE c.business_id = (SELECT public.get_user_business(auth.uid()));
$$;

-- -------------------------------------------------------------------------------------
-- Search (customer picker): same behaviour as before, now reading customers_secure().
-- -------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.search_customers(_query text DEFAULT '', _limit integer DEFAULT 20)
RETURNS TABLE (
  id          uuid,
  business_id uuid,
  name        text,
  phone       text,
  notes       text,
  created_by  uuid,
  created_at  timestamptz,
  updated_at  timestamptz,
  archived_at timestamptz
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  _business uuid := public.get_user_business(auth.uid());
  _q text := btrim(COALESCE(_query, ''));
  _phone text;
  _n integer := LEAST(GREATEST(COALESCE(_limit, 20), 1), 50);
BEGIN
  IF _business IS NULL THEN
    RETURN;
  END IF;

  IF _q = '' THEN
    -- Most recently active customers first.
    RETURN QUERY
      SELECT cs.* FROM public.customers_secure() cs
      LEFT JOIN LATERAL (
        SELECT max(s.sale_date) AS last_sale FROM public.sales s WHERE s.customer_id = cs.id
      ) recent ON true
      WHERE cs.archived_at IS NULL
      ORDER BY COALESCE(recent.last_sale, cs.created_at) DESC, cs.id
      LIMIT _n;
    RETURN;
  END IF;

  IF _q ~ '^[+0-9 ()-]+$' THEN
    -- Digits: exact lookup on the canonical number (works for staff without revealing it).
    _phone := public.normalize_phone(_q);
    IF _phone IS NULL THEN
      RETURN;
    END IF;
    RETURN QUERY
      SELECT cs.* FROM public.customers_secure() cs
      JOIN public.customers c ON c.id = cs.id
      WHERE c.phone = _phone AND cs.archived_at IS NULL
      LIMIT _n;
    RETURN;
  END IF;

  IF length(_q) < 2 THEN
    RETURN;
  END IF;
  RETURN QUERY
    SELECT cs.* FROM public.customers_secure() cs
    WHERE cs.archived_at IS NULL
      AND cs.name ILIKE '%' || replace(replace(replace(_q, '\', '\\'), '%', '\%'), '_', '\_') || '%'
    ORDER BY (lower(cs.name) LIKE lower(_q) || '%') DESC, cs.name, cs.id
    LIMIT _n;
END;
$$;

-- -------------------------------------------------------------------------------------
-- Create with duplicate detection: unchanged apart from reading customers_secure().
-- Returns { status: 'created' | 'existing_phone' | 'name_matches', customer?, matches? }.
-- -------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_customer(
  _name text,
  _phone text DEFAULT NULL,
  _notes text DEFAULT NULL,
  _force boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _business uuid := public.get_user_business(auth.uid());
  _clean_name text := btrim(regexp_replace(COALESCE(_name, ''), '\s+', ' ', 'g'));
  _canonical text;
  _existing uuid;
  _matches jsonb;
  _new_id uuid;
BEGIN
  IF _business IS NULL THEN
    RAISE EXCEPTION 'Your account is not an active member of a business' USING ERRCODE = '42501';
  END IF;
  IF _clean_name = '' THEN
    RAISE EXCEPTION 'Customer name is required' USING ERRCODE = '22023';
  END IF;
  IF _phone IS NOT NULL AND btrim(_phone) <> '' THEN
    _canonical := public.normalize_phone(_phone);
    IF _canonical IS NULL THEN
      RAISE EXCEPTION 'Enter a valid phone number' USING ERRCODE = '22023';
    END IF;
    SELECT id INTO _existing FROM public.customers WHERE business_id = _business AND phone = _canonical;
    IF FOUND THEN
      RETURN jsonb_build_object(
        'status', 'existing_phone',
        'customer', (SELECT to_jsonb(cs) FROM public.customers_secure() cs WHERE cs.id = _existing)
      );
    END IF;
  END IF;

  IF NOT _force THEN
    SELECT jsonb_agg(to_jsonb(cs) ORDER BY cs.created_at) INTO _matches
    FROM public.customers_secure() cs
    WHERE lower(cs.name) = lower(_clean_name) AND cs.archived_at IS NULL;
    IF _matches IS NOT NULL THEN
      RETURN jsonb_build_object('status', 'name_matches', 'matches', _matches);
    END IF;
  END IF;

  INSERT INTO public.customers (business_id, name, phone, notes)
  VALUES (_business, _clean_name, _canonical, NULLIF(btrim(_notes), ''))
  RETURNING id INTO _new_id;

  RETURN jsonb_build_object(
    'status', 'created',
    'customer', (SELECT to_jsonb(cs) FROM public.customers_secure() cs WHERE cs.id = _new_id)
  );
END;
$$;

-- Signed-in members only; anon gets nothing.
REVOKE EXECUTE ON FUNCTION
  public.customers_secure(),
  public.search_customers(text, integer),
  public.create_customer(text, text, text, boolean)
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION
  public.customers_secure(),
  public.search_customers(text, integer),
  public.create_customer(text, text, text, boolean)
TO authenticated;
