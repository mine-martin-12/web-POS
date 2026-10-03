-- =====================================================================================
-- Phase 2: customers
--
-- * customers table (one per person per business) with a canonical phone number
-- * sales.customer_id / credits.customer_id, backfilled from credits.customer_name
-- * phone numbers are masked on the SERVER for non-admins: the phone column is not
--   readable by clients at all; reads go through customers_secure / search_customers,
--   which return the full number to admins and +2547123***90 to everyone else
-- =====================================================================================

-- -------------------------------------------------------------------------------------
-- Phone helpers (mirrors src/lib/phone.ts; both are tested)
-- -------------------------------------------------------------------------------------
-- Canonical form: '+' followed by 8–15 digits. Local Kenyan forms (07…, 01…, 7…, 254…)
-- become +254…. Returns NULL for anything that isn't a plausible phone number.
CREATE OR REPLACE FUNCTION public.normalize_phone(_raw text, _default_country text DEFAULT '254')
RETURNS text
LANGUAGE plpgsql IMMUTABLE
SET search_path = public
AS $$
DECLARE
  _digits text := regexp_replace(COALESCE(_raw, ''), '[^0-9]', '', 'g');
  _plus boolean := btrim(COALESCE(_raw, '')) LIKE '+%';
BEGIN
  IF _digits = '' THEN
    RETURN NULL;
  END IF;
  IF _plus THEN
    NULL; -- already international
  ELSIF _digits LIKE '00%' THEN
    _digits := substr(_digits, 3);
  ELSIF _digits LIKE _default_country || '%' AND length(_digits) >= length(_default_country) + 8 THEN
    NULL; -- 2547…
  ELSIF _digits LIKE '0%' THEN
    _digits := _default_country || substr(_digits, 2);
  ELSIF length(_digits) = 9 THEN
    _digits := _default_country || _digits; -- 712345678
  END IF;
  IF _digits !~ '^[1-9][0-9]{7,14}$' THEN
    RETURN NULL;
  END IF;
  RETURN '+' || _digits;
END;
$$;

-- '+254712345690' -> '+2547123***90'
CREATE OR REPLACE FUNCTION public.mask_phone(_phone text)
RETURNS text
LANGUAGE sql IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN _phone IS NULL THEN NULL
    WHEN length(_phone) <= 6 THEN repeat('*', length(_phone))
    ELSE left(_phone, length(_phone) - 5) || '***' || right(_phone, 2)
  END;
$$;

-- -------------------------------------------------------------------------------------
-- Table
-- -------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.customers (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id  uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  name         text NOT NULL,
  phone        text,
  notes        text,
  created_by   uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  archived_at  timestamptz,
  CONSTRAINT customers_name_not_blank CHECK (length(btrim(name)) > 0),
  CONSTRAINT customers_phone_canonical CHECK (phone IS NULL OR phone ~ '^\+[1-9][0-9]{7,14}$')
);
CREATE UNIQUE INDEX IF NOT EXISTS customers_business_phone_key ON public.customers (business_id, phone) WHERE phone IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_customers_business_name ON public.customers (business_id, lower(name));

CREATE TRIGGER update_customers_updated_at
  BEFORE UPDATE ON public.customers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Canonicalise phones on every write so lookups and the unique index always agree.
CREATE OR REPLACE FUNCTION public.customers_normalize()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.name := btrim(regexp_replace(NEW.name, '\s+', ' ', 'g'));
  IF NEW.phone IS NOT NULL AND btrim(NEW.phone) <> '' THEN
    NEW.phone := COALESCE(public.normalize_phone(NEW.phone), NEW.phone);
  ELSE
    NEW.phone := NULL;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER customers_normalize
  BEFORE INSERT OR UPDATE ON public.customers
  FOR EACH ROW EXECUTE FUNCTION public.customers_normalize();

ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL;
ALTER TABLE public.credits ADD COLUMN IF NOT EXISTS customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_sales_customer_id ON public.sales (customer_id);
CREATE INDEX IF NOT EXISTS idx_credits_customer_id ON public.credits (customer_id);

-- -------------------------------------------------------------------------------------
-- Backfill: one customer per distinct (case-insensitive) credit name per business
-- -------------------------------------------------------------------------------------
INSERT INTO public.customers (business_id, name, created_at, created_by)
SELECT DISTINCT ON (c.business_id, lower(btrim(c.customer_name)))
  c.business_id, btrim(c.customer_name), c.created_at, c.created_by
FROM public.credits c
WHERE length(btrim(c.customer_name)) > 0
ORDER BY c.business_id, lower(btrim(c.customer_name)), c.created_at;

UPDATE public.credits c SET customer_id = cu.id
FROM public.customers cu
WHERE cu.business_id = c.business_id
  AND lower(cu.name) = lower(btrim(regexp_replace(c.customer_name, '\s+', ' ', 'g')))
  AND c.customer_id IS NULL;

UPDATE public.sales s SET customer_id = c.customer_id
FROM public.credits c
WHERE c.sale_id = s.id AND s.customer_id IS NULL AND c.customer_id IS NOT NULL;

-- -------------------------------------------------------------------------------------
-- Tenant scope: customers join the trigger; sales/credits may only reference a customer
-- of the same business; a credit's customer_name follows its customer.
-- -------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_tenant_scope()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _business uuid;
  _customer_name text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF _uid IS NOT NULL THEN
      _business := public.get_user_business(_uid);
      IF _business IS NULL THEN
        RAISE EXCEPTION 'Your account is not an active member of a business' USING ERRCODE = '42501';
      END IF;
      NEW.business_id := _business;
      NEW.created_by := _uid;
    END IF;
  ELSE
    NEW.business_id := OLD.business_id;
    NEW.created_by := OLD.created_by;
  END IF;

  IF TG_TABLE_NAME = 'sales' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.products
      WHERE id = NEW.product_id AND business_id = NEW.business_id
        AND (archived_at IS NULL OR (TG_OP = 'UPDATE' AND NEW.product_id = OLD.product_id))
    ) THEN
      RAISE EXCEPTION 'Product not found' USING ERRCODE = '23503';
    END IF;
    IF NEW.unit_cost IS NULL OR (TG_OP = 'UPDATE' AND NEW.product_id <> OLD.product_id) THEN
      SELECT buying_price INTO NEW.unit_cost FROM public.products WHERE id = NEW.product_id;
    END IF;
  ELSIF TG_TABLE_NAME = 'credits' THEN
    IF NOT EXISTS (SELECT 1 FROM public.sales WHERE id = NEW.sale_id AND business_id = NEW.business_id) THEN
      RAISE EXCEPTION 'Sale not found' USING ERRCODE = '23503';
    END IF;
  END IF;

  -- Nested IF: PL/pgSQL would fail on NEW.customer_id for tables without that column.
  IF TG_TABLE_NAME IN ('sales', 'credits') THEN
    IF NEW.customer_id IS NOT NULL THEN
      SELECT name INTO _customer_name FROM public.customers
      WHERE id = NEW.customer_id AND business_id = NEW.business_id;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Customer not found' USING ERRCODE = '23503';
      END IF;
      IF TG_TABLE_NAME = 'credits' THEN
        NEW.customer_name := _customer_name;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER enforce_tenant_scope BEFORE INSERT OR UPDATE ON public.customers
  FOR EACH ROW EXECUTE FUNCTION public.enforce_tenant_scope();

-- Renaming a customer renames their credits too (credits.customer_name is kept for
-- older clients and exports).
CREATE OR REPLACE FUNCTION public.sync_customer_name()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NEW.name IS DISTINCT FROM OLD.name THEN
    UPDATE public.credits SET customer_name = NEW.name WHERE customer_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER sync_customer_name
  AFTER UPDATE OF name ON public.customers
  FOR EACH ROW EXECUTE FUNCTION public.sync_customer_name();

-- -------------------------------------------------------------------------------------
-- Access: phone is never readable directly by clients
-- -------------------------------------------------------------------------------------
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view customers" ON public.customers
  FOR SELECT TO authenticated
  USING (business_id = (SELECT public.get_user_business(auth.uid())));
CREATE POLICY "Members can add customers" ON public.customers
  FOR INSERT TO authenticated
  WITH CHECK (business_id = (SELECT public.get_user_business(auth.uid())));
CREATE POLICY "Admins can update customers" ON public.customers
  FOR UPDATE TO authenticated
  USING (business_id = (SELECT public.get_user_business(auth.uid())) AND (SELECT public.is_admin()))
  WITH CHECK (business_id = (SELECT public.get_user_business(auth.uid())));
CREATE POLICY "Admins can delete customers" ON public.customers
  FOR DELETE TO authenticated
  USING (business_id = (SELECT public.get_user_business(auth.uid())) AND (SELECT public.is_admin()));

REVOKE ALL ON public.customers FROM anon;
REVOKE SELECT, INSERT, UPDATE ON public.customers FROM authenticated;
GRANT SELECT (id, business_id, name, notes, created_by, created_at, updated_at, archived_at)
  ON public.customers TO authenticated;
GRANT INSERT (name, phone, notes) ON public.customers TO authenticated;
GRANT UPDATE (name, phone, notes, archived_at) ON public.customers TO authenticated;

-- The one place customer rows (with phone) are read. Owned by the migration role, so it
-- bypasses RLS and filters to the caller's business itself; non-admins get masked phones.
CREATE OR REPLACE VIEW public.customers_secure AS
SELECT
  c.id,
  c.business_id,
  c.name,
  CASE WHEN public.is_admin() THEN c.phone ELSE public.mask_phone(c.phone) END AS phone,
  c.notes,
  c.created_by,
  c.created_at,
  c.updated_at,
  c.archived_at
FROM public.customers c
WHERE c.business_id = public.get_user_business(auth.uid());

REVOKE ALL ON public.customers_secure FROM anon;
GRANT SELECT ON public.customers_secure TO authenticated;

-- -------------------------------------------------------------------------------------
-- Search + create with duplicate detection (used by the customer picker)
-- -------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.search_customers(_query text DEFAULT '', _limit integer DEFAULT 20)
RETURNS SETOF public.customers_secure
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
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
      SELECT cs.* FROM public.customers_secure cs
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
      SELECT cs.* FROM public.customers_secure cs
      JOIN public.customers c ON c.id = cs.id
      WHERE c.phone = _phone AND cs.archived_at IS NULL
      LIMIT _n;
    RETURN;
  END IF;

  IF length(_q) < 2 THEN
    RETURN;
  END IF;
  RETURN QUERY
    SELECT cs.* FROM public.customers_secure cs
    WHERE cs.archived_at IS NULL
      AND cs.name ILIKE '%' || replace(replace(replace(_q, '\', '\\'), '%', '\%'), '_', '\_') || '%'
    ORDER BY (lower(cs.name) LIKE lower(_q) || '%') DESC, cs.name, cs.id
    LIMIT _n;
END;
$$;

-- Returns { status: 'created' | 'existing_phone' | 'name_matches', customer?, matches? }.
-- A phone match reuses the existing record; a name match is returned for the user to
-- confirm unless _force (the "No, this is a different person" answer).
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
        'customer', (SELECT to_jsonb(cs) FROM public.customers_secure cs WHERE cs.id = _existing)
      );
    END IF;
  END IF;

  IF NOT _force THEN
    SELECT jsonb_agg(to_jsonb(cs) ORDER BY cs.created_at) INTO _matches
    FROM public.customers_secure cs
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
    'customer', (SELECT to_jsonb(cs) FROM public.customers_secure cs WHERE cs.id = _new_id)
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION
  public.search_customers(text, integer),
  public.create_customer(text, text, text, boolean)
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION
  public.search_customers(text, integer),
  public.create_customer(text, text, text, boolean)
TO authenticated;
GRANT EXECUTE ON FUNCTION public.normalize_phone(text, text), public.mask_phone(text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.customers_normalize(), public.sync_customer_name() FROM PUBLIC, anon, authenticated;
