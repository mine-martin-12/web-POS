-- =====================================================================================
-- Phase 1.2: tenancy, roles and security hardening
--
-- Fixes (see ARCHITECTURE.md > Security model):
--   * Users could make themselves admin / switch business by updating profiles.role /
--     profiles.business_id (UPDATE policy had no WITH CHECK and no column limits).
--   * Sign-up trusted client metadata (role, business_id), so anyone could join any
--     business as admin.
--   * Sales could reference another business's product (cross-tenant stock tampering).
--   * No CHECK constraints on quantities / prices / amounts.
--   * Deleting a product cascaded and erased its sales history.
--
-- Supabase runs each migration file in a single transaction: it applies fully or not at all.
-- =====================================================================================

-- -------------------------------------------------------------------------------------
-- 1. Businesses (the tenant)
-- -------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.businesses (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  phone       text,
  email       text,
  address     text,
  currency    text NOT NULL DEFAULT 'KES',
  timezone    text NOT NULL DEFAULT 'Africa/Nairobi',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT businesses_name_not_blank CHECK (length(btrim(name)) > 0),
  CONSTRAINT businesses_currency_format CHECK (currency ~ '^[A-Z]{3}$')
);

-- Backfill one business per distinct business_id found anywhere. The name comes from the
-- earliest admin's copy of business_name; duplicate names get a numeric suffix so the
-- unique index below can be created.
WITH ids AS (
  SELECT business_id FROM public.profiles
  UNION SELECT business_id FROM public.products
  UNION SELECT business_id FROM public.sales
  UNION SELECT business_id FROM public.credits
),
named AS (
  SELECT
    i.business_id AS id,
    COALESCE(
      (SELECT NULLIF(btrim(p.business_name), '') FROM public.profiles p
        WHERE p.business_id = i.business_id
        ORDER BY (p.role = 'admin') DESC, p.created_at
        LIMIT 1),
      'Business'
    ) AS name,
    COALESCE((SELECT min(p.created_at) FROM public.profiles p WHERE p.business_id = i.business_id), now()) AS created_at
  FROM ids i
),
ranked AS (
  SELECT id, name, created_at,
         row_number() OVER (PARTITION BY lower(name) ORDER BY created_at, id) AS rn
  FROM named
)
INSERT INTO public.businesses (id, name, created_at)
SELECT id, CASE WHEN rn = 1 THEN name ELSE name || ' (' || rn || ')' END, created_at
FROM ranked
ON CONFLICT (id) DO NOTHING;

CREATE UNIQUE INDEX IF NOT EXISTS businesses_name_ci_key ON public.businesses (lower(btrim(name)));

CREATE TRIGGER update_businesses_updated_at
  BEFORE UPDATE ON public.businesses
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.businesses(id) ON DELETE CASCADE;
ALTER TABLE public.products
  ADD CONSTRAINT products_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.businesses(id) ON DELETE CASCADE;
ALTER TABLE public.sales
  ADD CONSTRAINT sales_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.businesses(id) ON DELETE CASCADE;
ALTER TABLE public.credits
  ADD CONSTRAINT credits_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.businesses(id) ON DELETE CASCADE;

-- -------------------------------------------------------------------------------------
-- 2. Profiles: drop the editable role / business_name copies, add soft deactivation
-- -------------------------------------------------------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS deactivated_at timestamptz,
  ADD CONSTRAINT profiles_user_business_key UNIQUE (user_id, business_id);

-- -------------------------------------------------------------------------------------
-- 3. Roles live in their own table, never on the profile
-- -------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_roles (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL,
  business_id  uuid NOT NULL,
  role         public.app_role NOT NULL DEFAULT 'user',
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_roles_user_business_key UNIQUE (user_id, business_id),
  -- A role row can only exist for the business the profile belongs to. This is also the
  -- relationship PostgREST uses to embed roles: profiles?select=*,user_roles(role).
  CONSTRAINT user_roles_profile_fkey FOREIGN KEY (user_id, business_id)
    REFERENCES public.profiles (user_id, business_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_user_roles_business_id ON public.user_roles (business_id);

INSERT INTO public.user_roles (user_id, business_id, role)
SELECT user_id, business_id, role FROM public.profiles
ON CONFLICT (user_id, business_id) DO NOTHING;

-- Every business must keep at least one admin. Businesses created while the sign-up
-- default was 'user' may have none: promote their earliest member.
INSERT INTO public.user_roles (user_id, business_id, role)
SELECT DISTINCT ON (p.business_id) p.user_id, p.business_id, 'admin'::public.app_role
FROM public.profiles p
WHERE NOT EXISTS (
  SELECT 1 FROM public.user_roles ur WHERE ur.business_id = p.business_id AND ur.role = 'admin'
)
ORDER BY p.business_id, p.created_at
ON CONFLICT (user_id, business_id) DO UPDATE SET role = 'admin';

CREATE TRIGGER update_user_roles_updated_at
  BEFORE UPDATE ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- -------------------------------------------------------------------------------------
-- 4. Security helpers (SECURITY DEFINER so RLS policies can call them without recursion)
-- -------------------------------------------------------------------------------------
-- The business of an ACTIVE member. Deactivated users get NULL and therefore see nothing.
CREATE OR REPLACE FUNCTION public.get_user_business(_user_id uuid)
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT business_id FROM public.profiles WHERE user_id = _user_id AND is_active;
$$;

-- Role check scoped to the user's current business.
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.profiles p ON p.user_id = ur.user_id AND p.business_id = ur.business_id
    WHERE ur.user_id = _user_id AND ur.role = _role AND p.is_active
  );
$$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT public.has_role(auth.uid(), 'admin');
$$;

-- Kept for backwards compatibility with older clients; now read from the new tables.
CREATE OR REPLACE FUNCTION public.get_current_user_business_id()
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT public.get_user_business(auth.uid());
$$;

CREATE OR REPLACE FUNCTION public.get_current_user_role()
RETURNS public.app_role
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT ur.role
  FROM public.user_roles ur
  JOIN public.profiles p ON p.user_id = ur.user_id AND p.business_id = ur.business_id
  WHERE ur.user_id = auth.uid() AND p.is_active;
$$;

ALTER TABLE public.profiles DROP COLUMN IF EXISTS role;
ALTER TABLE public.profiles DROP COLUMN IF EXISTS business_name;

-- Never leave a business without an active admin (defence in depth; the manage-staff
-- edge function checks this too).
CREATE OR REPLACE FUNCTION public.ensure_business_keeps_admin()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _business uuid := OLD.business_id;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.role = 'admin' THEN
    RETURN NEW;
  END IF;
  IF OLD.role = 'admin' AND NOT EXISTS (
    SELECT 1 FROM public.user_roles ur
    JOIN public.profiles p ON p.user_id = ur.user_id AND p.business_id = ur.business_id
    WHERE ur.business_id = _business AND ur.role = 'admin' AND ur.user_id <> OLD.user_id AND p.is_active
  ) AND EXISTS (SELECT 1 FROM public.businesses WHERE id = _business) THEN
    -- Allow the cascade when the whole profile/business is being deleted.
    IF TG_OP = 'DELETE' AND NOT EXISTS (SELECT 1 FROM public.profiles WHERE user_id = OLD.user_id) THEN
      RETURN OLD;
    END IF;
    RAISE EXCEPTION 'A business must keep at least one active admin' USING ERRCODE = 'P0001';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER ensure_business_keeps_admin
  BEFORE UPDATE OR DELETE ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION public.ensure_business_keeps_admin();

-- Same rule when deactivating a profile.
CREATE OR REPLACE FUNCTION public.ensure_active_admin_remains()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF OLD.is_active AND NOT NEW.is_active
     AND public.has_role(OLD.user_id, 'admin')
     AND NOT EXISTS (
       SELECT 1 FROM public.user_roles ur
       JOIN public.profiles p ON p.user_id = ur.user_id AND p.business_id = ur.business_id
       WHERE ur.business_id = OLD.business_id AND ur.role = 'admin'
         AND ur.user_id <> OLD.user_id AND p.is_active
     ) THEN
    RAISE EXCEPTION 'A business must keep at least one active admin' USING ERRCODE = 'P0001';
  END IF;
  NEW.deactivated_at := CASE WHEN NEW.is_active THEN NULL ELSE COALESCE(NEW.deactivated_at, now()) END;
  RETURN NEW;
END;
$$;

CREATE TRIGGER ensure_active_admin_remains
  BEFORE UPDATE OF is_active ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.ensure_active_admin_remains();

-- -------------------------------------------------------------------------------------
-- 5. Invitations: the only way for staff to join a business
-- -------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.invitations (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id  uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  email        text NOT NULL,
  first_name   text,
  last_name    text,
  role         public.app_role NOT NULL DEFAULT 'user',
  -- 256 bits of randomness from two v4 UUIDs (gen_random_uuid uses a CSPRNG).
  token        text NOT NULL UNIQUE
               DEFAULT replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  invited_by   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  user_id      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  expires_at   timestamptz NOT NULL DEFAULT now() + interval '7 days',
  accepted_at  timestamptz,
  revoked_at   timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT invitations_email_format CHECK (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$')
);
CREATE INDEX IF NOT EXISTS idx_invitations_business_id ON public.invitations (business_id);
-- At most one open invitation per email address.
CREATE UNIQUE INDEX IF NOT EXISTS invitations_open_email_key
  ON public.invitations (lower(email)) WHERE accepted_at IS NULL AND revoked_at IS NULL;

-- -------------------------------------------------------------------------------------
-- 6. Sign-up: never trust client-supplied role or business_id
-- -------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _meta          jsonb := COALESCE(NEW.raw_user_meta_data, '{}'::jsonb);
  _token         text  := NULLIF(btrim(_meta ->> 'invite_token'), '');
  _business_name text  := NULLIF(btrim(_meta ->> 'business_name'), '');
  _first_name    text  := NULLIF(btrim(_meta ->> 'first_name'), '');
  _last_name     text  := NULLIF(btrim(_meta ->> 'last_name'), '');
  _invitation    public.invitations%ROWTYPE;
  _business_id   uuid;
  _role          public.app_role;
BEGIN
  IF _token IS NOT NULL THEN
    -- Staff joining through an admin invitation. Role and business come from the
    -- invitation row, never from the client.
    SELECT * INTO _invitation FROM public.invitations WHERE token = _token FOR UPDATE;
    IF NOT FOUND
       OR _invitation.revoked_at IS NOT NULL
       OR _invitation.user_id IS NOT NULL
       OR _invitation.accepted_at IS NOT NULL
       OR _invitation.expires_at < now() THEN
      RAISE EXCEPTION 'This invitation is invalid or has expired' USING ERRCODE = 'P0001';
    END IF;
    IF lower(_invitation.email) <> lower(NEW.email) THEN
      RAISE EXCEPTION 'This invitation was sent to a different email address' USING ERRCODE = 'P0001';
    END IF;

    _business_id := _invitation.business_id;
    _role        := _invitation.role;
    _first_name  := COALESCE(_first_name, _invitation.first_name);
    _last_name   := COALESCE(_last_name, _invitation.last_name);
    -- accepted_at is set when the invitee sets their password (complete_invitation()).
    UPDATE public.invitations SET user_id = NEW.id WHERE id = _invitation.id;

  ELSIF _business_name IS NOT NULL THEN
    -- Self-service sign-up always creates a NEW business with the signer as its admin.
    IF EXISTS (SELECT 1 FROM public.businesses WHERE lower(btrim(name)) = lower(_business_name)) THEN
      RAISE EXCEPTION 'A business with this name already exists' USING ERRCODE = '23505';
    END IF;
    INSERT INTO public.businesses (name) VALUES (_business_name) RETURNING id INTO _business_id;
    _role := 'admin';

  ELSE
    RAISE EXCEPTION 'Sign-up requires a business name or an invitation' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.profiles (user_id, email, first_name, last_name, business_id)
  VALUES (
    NEW.id,
    lower(btrim(NEW.email)),
    COALESCE(_first_name, split_part(NEW.email, '@', 1)),
    COALESCE(_last_name, ''),
    _business_id
  );
  INSERT INTO public.user_roles (user_id, business_id, role) VALUES (NEW.id, _business_id, _role);

  RETURN NEW;
END;
$$;

-- Supabase hides trigger errors behind "Database error saving new user", so the sign-up
-- form checks name availability first for a friendly message. Callable before sign-in.
CREATE OR REPLACE FUNCTION public.is_business_name_available(_name text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT length(btrim(COALESCE(_name, ''))) > 0
     AND NOT EXISTS (SELECT 1 FROM public.businesses WHERE lower(btrim(name)) = lower(btrim(_name)));
$$;

-- Called by the invitee after setting their password.
CREATE OR REPLACE FUNCTION public.complete_invitation()
RETURNS void
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
  UPDATE public.invitations
  SET accepted_at = now()
  WHERE user_id = auth.uid() AND accepted_at IS NULL AND revoked_at IS NULL;
$$;

-- -------------------------------------------------------------------------------------
-- 7. Data integrity on business tables
-- -------------------------------------------------------------------------------------
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;
ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  ADD COLUMN IF NOT EXISTS unit_cost numeric(12,2);
ALTER TABLE public.credits
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid();

CREATE INDEX IF NOT EXISTS idx_sales_created_by ON public.sales (created_by);
CREATE INDEX IF NOT EXISTS idx_products_archived_at ON public.products (archived_at);

-- Profit must use the cost at the time of sale, not today's buying price.
UPDATE public.sales s SET unit_cost = p.buying_price
FROM public.products p WHERE p.id = s.product_id AND s.unit_cost IS NULL;

-- Products are archived, never deleted out from under their sales history.
DO $$
DECLARE _con text;
BEGIN
  SELECT conname INTO _con FROM pg_constraint
  WHERE conrelid = 'public.sales'::regclass AND contype = 'f'
    AND confrelid = 'public.products'::regclass;
  IF _con IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.sales DROP CONSTRAINT %I', _con);
  END IF;
END $$;
ALTER TABLE public.sales
  ADD CONSTRAINT sales_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE RESTRICT;

-- Due dates are calendar dates. Existing values were stored as local (Nairobi) midnight.
ALTER TABLE public.credits
  ALTER COLUMN due_date TYPE date USING (due_date AT TIME ZONE 'Africa/Nairobi')::date;

-- CHECK constraints are added NOT VALID so legacy rows can't block the migration; they
-- are enforced for every new write and validated below when the existing data allows.
ALTER TABLE public.products
  ADD CONSTRAINT products_stock_nonnegative CHECK (stock_quantity >= 0) NOT VALID,
  ADD CONSTRAINT products_buying_price_nonnegative CHECK (buying_price >= 0) NOT VALID,
  ADD CONSTRAINT products_name_not_blank CHECK (length(btrim(name)) > 0) NOT VALID;
ALTER TABLE public.sales
  ADD CONSTRAINT sales_quantity_positive CHECK (quantity > 0) NOT VALID,
  ADD CONSTRAINT sales_selling_price_nonnegative CHECK (selling_price >= 0) NOT VALID,
  ADD CONSTRAINT sales_unit_cost_nonnegative CHECK (unit_cost IS NULL OR unit_cost >= 0) NOT VALID;
ALTER TABLE public.credits
  ADD CONSTRAINT credits_amount_owed_nonnegative CHECK (amount_owed >= 0) NOT VALID,
  ADD CONSTRAINT credits_amount_paid_range CHECK (amount_paid >= 0 AND amount_paid <= amount_owed) NOT VALID;

DO $$
DECLARE
  _checks text[][] := ARRAY[
    ['products', 'products_stock_nonnegative'],
    ['products', 'products_buying_price_nonnegative'],
    ['products', 'products_name_not_blank'],
    ['sales',    'sales_quantity_positive'],
    ['sales',    'sales_selling_price_nonnegative'],
    ['sales',    'sales_unit_cost_nonnegative'],
    ['credits',  'credits_amount_owed_nonnegative'],
    ['credits',  'credits_amount_paid_range']
  ];
  _i int;
BEGIN
  FOR _i IN 1 .. array_length(_checks, 1) LOOP
    BEGIN
      EXECUTE format('ALTER TABLE public.%I VALIDATE CONSTRAINT %I', _checks[_i][1], _checks[_i][2]);
    EXCEPTION WHEN check_violation THEN
      RAISE NOTICE 'Constraint % left NOT VALID: legacy rows violate it', _checks[_i][2];
    END;
  END LOOP;
END $$;

-- total_price is a GENERATED column; the extra trigger was redundant.
DROP TRIGGER IF EXISTS update_sale_total_price ON public.sales;
DROP FUNCTION IF EXISTS public.calculate_sale_total_price();

-- Plain bookkeeping triggers don't need elevated privileges.
ALTER FUNCTION public.update_updated_at_column() SECURITY INVOKER;
ALTER FUNCTION public.calculate_total_buying_price() SECURITY INVOKER;
ALTER FUNCTION public.update_credit_status() SECURITY INVOKER;

-- Credit status must also be right on INSERT (e.g. a deposit paid up front).
DROP TRIGGER IF EXISTS update_credit_status_trigger ON public.credits;
CREATE TRIGGER update_credit_status_trigger
  BEFORE INSERT OR UPDATE ON public.credits
  FOR EACH ROW EXECUTE FUNCTION public.update_credit_status();

-- Tenant scope: business_id and created_by are set by the server, never the client, and
-- linked rows must belong to the same business.
CREATE OR REPLACE FUNCTION public.enforce_tenant_scope()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _business uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- auth.uid() is NULL for service-role / migration writes, which are trusted.
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

  RETURN NEW;
END;
$$;

CREATE TRIGGER enforce_tenant_scope BEFORE INSERT OR UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.enforce_tenant_scope();
CREATE TRIGGER enforce_tenant_scope BEFORE INSERT OR UPDATE ON public.sales
  FOR EACH ROW EXECUTE FUNCTION public.enforce_tenant_scope();
CREATE TRIGGER enforce_tenant_scope BEFORE INSERT OR UPDATE ON public.credits
  FOR EACH ROW EXECUTE FUNCTION public.enforce_tenant_scope();

-- Stock moves atomically with a friendly error instead of a constraint violation.
CREATE OR REPLACE FUNCTION public.update_product_stock_on_sale()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _name text;
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    UPDATE public.products SET stock_quantity = stock_quantity + OLD.quantity WHERE id = OLD.product_id;
  END IF;

  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    UPDATE public.products
    SET stock_quantity = stock_quantity - NEW.quantity
    WHERE id = NEW.product_id AND stock_quantity >= NEW.quantity;
    IF NOT FOUND THEN
      SELECT name INTO _name FROM public.products WHERE id = NEW.product_id;
      RAISE EXCEPTION 'Insufficient stock for "%"', COALESCE(_name, 'product') USING ERRCODE = 'P0001';
    END IF;
    RETURN NEW;
  END IF;

  RETURN OLD;
END;
$$;

-- -------------------------------------------------------------------------------------
-- 8. Credit payments history + atomic RPCs (no read-modify-write from the browser)
-- -------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.credit_payments (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id     uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  credit_id       uuid NOT NULL REFERENCES public.credits(id) ON DELETE CASCADE,
  amount          numeric(12,2) NOT NULL CHECK (amount > 0),
  payment_method  text NOT NULL DEFAULT 'cash'
                  CHECK (payment_method IN ('cash', 'mpesa', 'bank_cheque')),
  paid_at         timestamptz NOT NULL DEFAULT now(),
  recorded_by     uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_credit_payments_credit_id ON public.credit_payments (credit_id);
CREATE INDEX IF NOT EXISTS idx_credit_payments_business_paid_at ON public.credit_payments (business_id, paid_at);

CREATE OR REPLACE FUNCTION public.record_credit_payment(
  _credit_id uuid,
  _amount numeric,
  _payment_method text DEFAULT 'cash'
)
RETURNS public.credits
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _business uuid := public.get_user_business(auth.uid());
  _credit public.credits;
  _outstanding numeric;
BEGIN
  IF _business IS NULL THEN
    RAISE EXCEPTION 'Your account is not an active member of a business' USING ERRCODE = '42501';
  END IF;
  IF _amount IS NULL OR _amount <= 0 THEN
    RAISE EXCEPTION 'Payment amount must be greater than zero' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO _credit FROM public.credits
  WHERE id = _credit_id AND business_id = _business
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Credit not found' USING ERRCODE = 'P0002';
  END IF;

  _outstanding := _credit.amount_owed - _credit.amount_paid;
  IF round(_amount, 2) > round(_outstanding, 2) THEN
    RAISE EXCEPTION 'Payment exceeds the outstanding balance of %', round(_outstanding, 2) USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.credit_payments (business_id, credit_id, amount, payment_method)
  VALUES (_business, _credit_id, round(_amount, 2), _payment_method);

  UPDATE public.credits SET amount_paid = amount_paid + round(_amount, 2)
  WHERE id = _credit_id
  RETURNING * INTO _credit;

  RETURN _credit;
END;
$$;

CREATE OR REPLACE FUNCTION public.add_stock(_product_id uuid, _quantity integer)
RETURNS public.products
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _business uuid := public.get_user_business(auth.uid());
  _product public.products;
BEGIN
  IF _business IS NULL THEN
    RAISE EXCEPTION 'Your account is not an active member of a business' USING ERRCODE = '42501';
  END IF;
  IF _quantity IS NULL OR _quantity <= 0 THEN
    RAISE EXCEPTION 'Quantity must be greater than zero' USING ERRCODE = '22023';
  END IF;

  UPDATE public.products SET stock_quantity = stock_quantity + _quantity
  WHERE id = _product_id AND business_id = _business AND archived_at IS NULL
  RETURNING * INTO _product;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Product not found' USING ERRCODE = 'P0002';
  END IF;
  RETURN _product;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_business_details(
  _name text,
  _phone text DEFAULT NULL,
  _email text DEFAULT NULL,
  _address text DEFAULT NULL,
  _currency text DEFAULT NULL,
  _timezone text DEFAULT NULL
)
RETURNS public.businesses
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _business uuid := public.get_user_business(auth.uid());
  _row public.businesses;
BEGIN
  IF _business IS NULL OR NOT public.is_admin() THEN
    RAISE EXCEPTION 'Admin privileges required' USING ERRCODE = '42501';
  END IF;
  IF length(btrim(COALESCE(_name, ''))) = 0 THEN
    RAISE EXCEPTION 'Business name is required' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM public.businesses WHERE lower(btrim(name)) = lower(btrim(_name)) AND id <> _business) THEN
    RAISE EXCEPTION 'A business with this name already exists' USING ERRCODE = '23505';
  END IF;
  IF _timezone IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_timezone_names WHERE name = _timezone) THEN
    RAISE EXCEPTION 'Unknown time zone %', _timezone USING ERRCODE = '22023';
  END IF;

  UPDATE public.businesses SET
    name     = btrim(_name),
    phone    = NULLIF(btrim(_phone), ''),
    email    = NULLIF(lower(btrim(_email)), ''),
    address  = NULLIF(btrim(_address), ''),
    currency = COALESCE(upper(NULLIF(btrim(_currency), '')), currency),
    timezone = COALESCE(NULLIF(btrim(_timezone), ''), timezone)
  WHERE id = _business
  RETURNING * INTO _row;
  RETURN _row;
END;
$$;

-- -------------------------------------------------------------------------------------
-- 9. Row-level security: rebuild every policy from scratch
-- -------------------------------------------------------------------------------------
DO $$
DECLARE _p record;
BEGIN
  FOR _p IN
    SELECT policyname, tablename FROM pg_policies
    WHERE schemaname = 'public' AND tablename IN ('profiles', 'products', 'sales', 'credits')
  LOOP
    EXECUTE format('DROP POLICY %I ON public.%I', _p.policyname, _p.tablename);
  END LOOP;
END $$;

ALTER TABLE public.businesses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_payments ENABLE ROW LEVEL SECURITY;

-- (SELECT fn()) makes Postgres evaluate the helper once per statement, not once per row.

-- businesses: members read their own business; changes go through update_business_details()
CREATE POLICY "Members can view their business" ON public.businesses
  FOR SELECT TO authenticated
  USING (id = (SELECT public.get_user_business(auth.uid())));

-- profiles
CREATE POLICY "Members can view profiles in their business" ON public.profiles
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()) OR business_id = (SELECT public.get_user_business(auth.uid())));
CREATE POLICY "Users can update their own name" ON public.profiles
  FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

-- user_roles: read-only for clients (changes go through the manage-staff edge function)
CREATE POLICY "Users can view their own role" ON public.user_roles
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));
CREATE POLICY "Admins can view roles in their business" ON public.user_roles
  FOR SELECT TO authenticated
  USING (business_id = (SELECT public.get_user_business(auth.uid())) AND (SELECT public.is_admin()));

-- invitations: admins only; written by the invite-staff edge function
CREATE POLICY "Admins can view invitations" ON public.invitations
  FOR SELECT TO authenticated
  USING (business_id = (SELECT public.get_user_business(auth.uid())) AND (SELECT public.is_admin()));

-- products
CREATE POLICY "Members can view products" ON public.products
  FOR SELECT TO authenticated
  USING (business_id = (SELECT public.get_user_business(auth.uid())));
CREATE POLICY "Members can add products" ON public.products
  FOR INSERT TO authenticated
  WITH CHECK (business_id = (SELECT public.get_user_business(auth.uid())));
CREATE POLICY "Members can update products" ON public.products
  FOR UPDATE TO authenticated
  USING (business_id = (SELECT public.get_user_business(auth.uid())))
  WITH CHECK (business_id = (SELECT public.get_user_business(auth.uid())));
CREATE POLICY "Admins can delete products" ON public.products
  FOR DELETE TO authenticated
  USING (business_id = (SELECT public.get_user_business(auth.uid())) AND (SELECT public.is_admin()));

-- sales: staff see and edit only the sales they recorded; admins see everything
CREATE POLICY "Members can view sales" ON public.sales
  FOR SELECT TO authenticated
  USING (
    business_id = (SELECT public.get_user_business(auth.uid()))
    AND ((SELECT public.is_admin()) OR created_by = (SELECT auth.uid()))
  );
CREATE POLICY "Members can record sales" ON public.sales
  FOR INSERT TO authenticated
  WITH CHECK (business_id = (SELECT public.get_user_business(auth.uid())));
CREATE POLICY "Members can update their sales" ON public.sales
  FOR UPDATE TO authenticated
  USING (
    business_id = (SELECT public.get_user_business(auth.uid()))
    AND ((SELECT public.is_admin()) OR created_by = (SELECT auth.uid()))
  )
  WITH CHECK (business_id = (SELECT public.get_user_business(auth.uid())));
CREATE POLICY "Admins can delete sales" ON public.sales
  FOR DELETE TO authenticated
  USING (business_id = (SELECT public.get_user_business(auth.uid())) AND (SELECT public.is_admin()));

-- credits: visible to the whole business (whoever is at the till collects debts)
CREATE POLICY "Members can view credits" ON public.credits
  FOR SELECT TO authenticated
  USING (business_id = (SELECT public.get_user_business(auth.uid())));
CREATE POLICY "Members can add credits" ON public.credits
  FOR INSERT TO authenticated
  WITH CHECK (business_id = (SELECT public.get_user_business(auth.uid())));
CREATE POLICY "Members can update credits" ON public.credits
  FOR UPDATE TO authenticated
  USING (business_id = (SELECT public.get_user_business(auth.uid())))
  WITH CHECK (business_id = (SELECT public.get_user_business(auth.uid())));
CREATE POLICY "Admins can delete credits" ON public.credits
  FOR DELETE TO authenticated
  USING (business_id = (SELECT public.get_user_business(auth.uid())) AND (SELECT public.is_admin()));

-- credit_payments: read by members, written only by record_credit_payment()
CREATE POLICY "Members can view credit payments" ON public.credit_payments
  FOR SELECT TO authenticated
  USING (business_id = (SELECT public.get_user_business(auth.uid())));

-- -------------------------------------------------------------------------------------
-- 10. Table and column privileges (RLS filters rows; grants limit what can be written)
-- -------------------------------------------------------------------------------------
REVOKE ALL ON public.businesses, public.user_roles, public.invitations, public.credit_payments FROM anon;
REVOKE ALL ON public.profiles, public.products, public.sales, public.credits FROM anon;

REVOKE INSERT, UPDATE, DELETE ON public.businesses FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.user_roles FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.invitations FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.credit_payments FROM authenticated;
GRANT SELECT ON public.businesses, public.user_roles, public.invitations, public.credit_payments TO authenticated;

-- Profiles are created by the sign-up trigger and removed by cascade. Users may only
-- change their own name.
REVOKE INSERT, UPDATE, DELETE ON public.profiles FROM authenticated;
GRANT UPDATE (first_name, last_name) ON public.profiles TO authenticated;

-- Functions: nothing callable anonymously except the sign-up name check.
REVOKE EXECUTE ON FUNCTION
  public.get_user_business(uuid),
  public.has_role(uuid, public.app_role),
  public.is_admin(),
  public.get_current_user_business_id(),
  public.get_current_user_role(),
  public.complete_invitation(),
  public.record_credit_payment(uuid, numeric, text),
  public.add_stock(uuid, integer),
  public.update_business_details(text, text, text, text, text, text)
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION
  public.get_user_business(uuid),
  public.has_role(uuid, public.app_role),
  public.is_admin(),
  public.get_current_user_business_id(),
  public.get_current_user_role(),
  public.complete_invitation(),
  public.record_credit_payment(uuid, numeric, text),
  public.add_stock(uuid, integer),
  public.update_business_details(text, text, text, text, text, text)
TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_business_name_available(text) TO anon, authenticated;

REVOKE EXECUTE ON FUNCTION
  public.handle_new_user(),
  public.enforce_tenant_scope(),
  public.update_product_stock_on_sale(),
  public.ensure_business_keeps_admin(),
  public.ensure_active_admin_remains()
FROM PUBLIC, anon, authenticated;
