-- =====================================================================================
-- Phase 2: audit trail
--
-- activity_logs is written ONLY by the log_activity() trigger (clients can't insert,
-- update or delete). Updates store just the fields that changed. Phone numbers are masked
-- and invitation tokens removed before anything is stored. Only admins can read it.
-- =====================================================================================

CREATE TABLE IF NOT EXISTS public.activity_logs (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id  uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  actor_id     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action       text NOT NULL CHECK (action IN ('create', 'update', 'delete')),
  table_name   text NOT NULL,
  record_id    uuid,
  old_values   jsonb,
  new_values   jsonb,
  reason       text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  -- For the free-text filter on the Activity page.
  search_text  text GENERATED ALWAYS AS (
    lower(COALESCE(reason, '') || ' ' || COALESCE(old_values::text, '') || ' ' || COALESCE(new_values::text, ''))
  ) STORED
);
CREATE INDEX IF NOT EXISTS idx_activity_logs_business_time ON public.activity_logs (business_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_logs_actor ON public.activity_logs (business_id, actor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_logs_record ON public.activity_logs (table_name, record_id);

-- Columns that change on their own and would only add noise.
CREATE OR REPLACE FUNCTION public.audit_ignored_columns()
RETURNS text[]
LANGUAGE sql IMMUTABLE
SET search_path = public
AS $$
  SELECT ARRAY['updated_at', 'created_at', 'total_buying_price', 'search_text'];
$$;

-- Masks sensitive values before they are stored.
CREATE OR REPLACE FUNCTION public.audit_sanitize(_table text, _row jsonb)
RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE
SET search_path = public
AS $$
BEGIN
  IF _row IS NULL THEN
    RETURN NULL;
  END IF;
  _row := _row - public.audit_ignored_columns();
  IF _row ? 'phone' AND _row ->> 'phone' IS NOT NULL THEN
    _row := jsonb_set(_row, '{phone}', to_jsonb(public.mask_phone(_row ->> 'phone')));
  END IF;
  IF _table = 'invitations' THEN
    _row := _row - 'token';
  END IF;
  RETURN _row;
END;
$$;

CREATE OR REPLACE FUNCTION public.log_activity()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _old jsonb := CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN public.audit_sanitize(TG_TABLE_NAME, to_jsonb(OLD)) END;
  _new jsonb := CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN public.audit_sanitize(TG_TABLE_NAME, to_jsonb(NEW)) END;
  _row jsonb := COALESCE(_new, _old);
  _business uuid;
  _key text;
  _old_diff jsonb := '{}'::jsonb;
  _new_diff jsonb := '{}'::jsonb;
BEGIN
  _business := CASE WHEN TG_TABLE_NAME = 'businesses' THEN (_row ->> 'id')::uuid ELSE (_row ->> 'business_id')::uuid END;
  -- The business itself is being deleted: nothing to log against.
  IF _business IS NULL OR NOT EXISTS (SELECT 1 FROM public.businesses WHERE id = _business) THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF TG_OP = 'UPDATE' THEN
    FOR _key IN SELECT jsonb_object_keys(_new) LOOP
      IF (_old -> _key) IS DISTINCT FROM (_new -> _key) THEN
        _old_diff := _old_diff || jsonb_build_object(_key, _old -> _key);
        _new_diff := _new_diff || jsonb_build_object(_key, _new -> _key);
      END IF;
    END LOOP;
    IF _new_diff = '{}'::jsonb THEN
      RETURN NEW; -- only ignored columns changed
    END IF;
    _old := _old_diff;
    _new := _new_diff;
  END IF;

  INSERT INTO public.activity_logs (business_id, actor_id, action, table_name, record_id, old_values, new_values, reason)
  VALUES (
    _business,
    auth.uid(),
    CASE TG_OP WHEN 'INSERT' THEN 'create' WHEN 'UPDATE' THEN 'update' ELSE 'delete' END,
    TG_TABLE_NAME,
    (_row ->> 'id')::uuid,
    _old,
    _new,
    NULLIF(current_setting('app.change_reason', true), '')
  );
  RETURN COALESCE(NEW, OLD);
END;
$$;

DO $$
DECLARE _t text;
BEGIN
  FOREACH _t IN ARRAY ARRAY['businesses', 'profiles', 'user_roles', 'invitations', 'products', 'customers',
                            'sales', 'credits', 'credit_payments', 'pending_updates'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS log_activity ON public.%I', _t);
    EXECUTE format(
      'CREATE TRIGGER log_activity AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.log_activity()',
      _t
    );
  END LOOP;
END $$;

-- Reading is admin-only AT THE DATABASE LEVEL; nothing can be written by clients.
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can read their business's activity" ON public.activity_logs
  FOR SELECT TO authenticated
  USING (business_id = (SELECT public.get_user_business(auth.uid())) AND (SELECT public.is_admin()));

REVOKE ALL ON public.activity_logs FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.activity_logs FROM authenticated;
GRANT SELECT ON public.activity_logs TO authenticated;

REVOKE EXECUTE ON FUNCTION public.log_activity(), public.audit_sanitize(text, jsonb), public.audit_ignored_columns()
FROM PUBLIC, anon, authenticated;

-- Direct admin edits can carry a reason into the log as well.
CREATE OR REPLACE FUNCTION public.update_sale(_sale_id uuid, _changes jsonb, _reason text DEFAULT NULL)
RETURNS public.sales
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() OR NOT EXISTS (
    SELECT 1 FROM public.sales WHERE id = _sale_id AND business_id = public.get_user_business(auth.uid())
  ) THEN
    RAISE EXCEPTION 'Admin privileges required' USING ERRCODE = '42501';
  END IF;
  IF _reason IS NOT NULL THEN
    PERFORM set_config('app.change_reason', _reason, true);
  END IF;
  RETURN public.apply_sale_changes(_sale_id, _changes);
END;
$$;
DROP FUNCTION IF EXISTS public.update_sale(uuid, jsonb);
REVOKE EXECUTE ON FUNCTION public.update_sale(uuid, jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_sale(uuid, jsonb, text) TO authenticated;
