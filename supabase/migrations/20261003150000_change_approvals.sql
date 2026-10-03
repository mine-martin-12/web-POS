-- =====================================================================================
-- Phase 2: change-approval workflow
--
-- Staff can't edit saved sales, credits or products. They submit a change request with a
-- reason; an admin approves (applied atomically against a per-table whitelist), sends it
-- back with feedback, or rejects it.
-- =====================================================================================

DO $$ BEGIN
  CREATE TYPE public.change_status AS ENUM ('pending', 'approved', 'sent_back_for_review', 'rejected');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.pending_updates (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id   uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  table_name    text NOT NULL CHECK (table_name IN ('sales', 'credits', 'products')),
  record_id     uuid NOT NULL,
  old_values    jsonb NOT NULL,
  new_values    jsonb NOT NULL,
  reason        text NOT NULL CHECK (length(btrim(reason)) >= 3),
  status        public.change_status NOT NULL DEFAULT 'pending',
  requested_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  requested_at  timestamptz NOT NULL DEFAULT now(),
  reviewed_by   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at   timestamptz,
  admin_note    text,
  archived_at   timestamptz,
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pending_updates_business_status ON public.pending_updates (business_id, status, requested_at DESC);
CREATE INDEX IF NOT EXISTS idx_pending_updates_requested_by ON public.pending_updates (requested_by);
-- One open request per record per person.
CREATE UNIQUE INDEX IF NOT EXISTS pending_updates_one_open_key
  ON public.pending_updates (table_name, record_id, requested_by)
  WHERE status IN ('pending', 'sent_back_for_review');

CREATE TRIGGER update_pending_updates_updated_at
  BEFORE UPDATE ON public.pending_updates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- -------------------------------------------------------------------------------------
-- Whitelists and snapshots
-- -------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.change_whitelist(_table text)
RETURNS text[]
LANGUAGE sql IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE _table
    WHEN 'sales'    THEN ARRAY['product_id', 'quantity', 'selling_price', 'sale_day', 'description',
                               'customer_id', 'payment_method']
    WHEN 'credits'  THEN ARRAY['due_date', 'customer_id']
    WHEN 'products' THEN ARRAY['name', 'description', 'size', 'buying_price']
    ELSE ARRAY[]::text[]
  END;
$$;

-- Current values of the whitelisted fields, in the same vocabulary as a request.
CREATE OR REPLACE FUNCTION public.change_snapshot(_table text, _record_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _row jsonb;
BEGIN
  IF _table = 'sales' THEN
    SELECT jsonb_build_object(
      'product_id', s.product_id, 'quantity', s.quantity, 'selling_price', s.selling_price,
      'sale_day', (s.sale_date AT TIME ZONE public.business_timezone(s.business_id))::date,
      'description', s.description, 'customer_id', s.customer_id, 'payment_method', s.payment_method)
    INTO _row FROM public.sales s WHERE s.id = _record_id;
  ELSIF _table = 'credits' THEN
    SELECT jsonb_build_object('due_date', c.due_date, 'customer_id', c.customer_id)
    INTO _row FROM public.credits c WHERE c.id = _record_id;
  ELSIF _table = 'products' THEN
    SELECT jsonb_build_object('name', p.name, 'description', p.description, 'size', p.size,
                              'buying_price', p.buying_price)
    INTO _row FROM public.products p WHERE p.id = _record_id AND p.archived_at IS NULL;
  END IF;
  RETURN _row;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_business(_table text, _record_id uuid)
RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE _b uuid;
BEGIN
  EXECUTE format('SELECT business_id FROM public.%I WHERE id = $1', _table) INTO _b USING _record_id;
  RETURN _b;
END;
$$;

-- Validates keys and shapes the request: only fields that actually change are kept.
CREATE OR REPLACE FUNCTION public.normalize_change(_table text, _record_id uuid, _new jsonb)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _current jsonb := public.change_snapshot(_table, _record_id);
  _key text;
  _out jsonb := '{}'::jsonb;
BEGIN
  IF _current IS NULL THEN
    RAISE EXCEPTION 'Record not found' USING ERRCODE = 'P0002';
  END IF;
  IF _new IS NULL OR jsonb_typeof(_new) <> 'object' THEN
    RAISE EXCEPTION 'No changes given' USING ERRCODE = '22023';
  END IF;
  FOR _key IN SELECT jsonb_object_keys(_new) LOOP
    IF NOT (_key = ANY (public.change_whitelist(_table))) THEN
      RAISE EXCEPTION 'The field "%" can''t be changed', _key USING ERRCODE = '22023';
    END IF;
    IF (_current -> _key) IS DISTINCT FROM (_new -> _key)
       AND (_current ->> _key) IS DISTINCT FROM (_new ->> _key) THEN
      _out := _out || jsonb_build_object(_key, _new -> _key);
    END IF;
  END LOOP;
  IF _out = '{}'::jsonb THEN
    RAISE EXCEPTION 'Nothing changed' USING ERRCODE = '22023';
  END IF;
  RETURN _out;
END;
$$;

-- -------------------------------------------------------------------------------------
-- Applying a change (shared by direct admin edits and approvals)
-- -------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.apply_product_changes(_product_id uuid, _changes jsonb)
RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE _key text;
BEGIN
  FOR _key IN SELECT jsonb_object_keys(_changes) LOOP
    IF NOT (_key = ANY (public.change_whitelist('products'))) THEN
      RAISE EXCEPTION 'The field "%" can''t be changed', _key USING ERRCODE = '22023';
    END IF;
  END LOOP;
  UPDATE public.products SET
    name         = COALESCE(NULLIF(btrim(_changes ->> 'name'), ''), name),
    description  = CASE WHEN _changes ? 'description' THEN COALESCE(btrim(_changes ->> 'description'), '') ELSE description END,
    size         = CASE WHEN _changes ? 'size' THEN NULLIF(btrim(_changes ->> 'size'), '') ELSE size END,
    buying_price = COALESCE(round((_changes ->> 'buying_price')::numeric, 2), buying_price)
  WHERE id = _product_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.apply_change(_table text, _record_id uuid, _changes jsonb)
RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF _table = 'sales' THEN
    PERFORM public.apply_sale_changes(_record_id, _changes);
  ELSIF _table = 'credits' THEN
    PERFORM public.apply_sale_changes((SELECT sale_id FROM public.credits WHERE id = _record_id), _changes);
  ELSIF _table = 'products' THEN
    PERFORM public.apply_product_changes(_record_id, _changes);
  ELSE
    RAISE EXCEPTION 'Unknown record type' USING ERRCODE = '22023';
  END IF;
END;
$$;

-- -------------------------------------------------------------------------------------
-- Staff: submit and resubmit
-- -------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.submit_change(_table text, _record_id uuid, _new_values jsonb, _reason text)
RETURNS public.pending_updates
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _business uuid := public.get_user_business(_uid);
  _changes jsonb;
  _row public.pending_updates;
BEGIN
  IF _business IS NULL THEN
    RAISE EXCEPTION 'Your account is not an active member of a business' USING ERRCODE = '42501';
  END IF;
  IF _table NOT IN ('sales', 'credits', 'products') THEN
    RAISE EXCEPTION 'Unknown record type' USING ERRCODE = '22023';
  END IF;
  IF public.record_business(_table, _record_id) IS DISTINCT FROM _business THEN
    RAISE EXCEPTION 'Record not found' USING ERRCODE = 'P0002';
  END IF;
  -- Staff can only ask about sales they recorded (the ones they can see).
  IF _table = 'sales' AND NOT public.is_admin()
     AND NOT EXISTS (SELECT 1 FROM public.sales WHERE id = _record_id AND created_by = _uid) THEN
    RAISE EXCEPTION 'Record not found' USING ERRCODE = 'P0002';
  END IF;
  IF length(btrim(COALESCE(_reason, ''))) < 3 THEN
    RAISE EXCEPTION 'Please give a reason for the change' USING ERRCODE = '22023';
  END IF;

  _changes := public.normalize_change(_table, _record_id, _new_values);

  INSERT INTO public.pending_updates (business_id, table_name, record_id, old_values, new_values, reason, requested_by)
  VALUES (
    _business, _table, _record_id,
    (SELECT jsonb_object_agg(k, public.change_snapshot(_table, _record_id) -> k) FROM jsonb_object_keys(_changes) k),
    _changes, btrim(_reason), _uid
  )
  RETURNING * INTO _row;
  RETURN _row;
EXCEPTION WHEN unique_violation THEN
  RAISE EXCEPTION 'You already have an open request for this record' USING ERRCODE = '23505';
END;
$$;

-- The requester edits a request that was sent back and puts it in the queue again.
CREATE OR REPLACE FUNCTION public.resubmit_change(_id uuid, _new_values jsonb, _reason text)
RETURNS public.pending_updates
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _row public.pending_updates;
  _changes jsonb;
BEGIN
  SELECT * INTO _row FROM public.pending_updates WHERE id = _id FOR UPDATE;
  IF NOT FOUND OR _row.requested_by IS DISTINCT FROM auth.uid()
     OR _row.business_id IS DISTINCT FROM public.get_user_business(auth.uid()) THEN
    RAISE EXCEPTION 'Request not found' USING ERRCODE = 'P0002';
  END IF;
  IF _row.status <> 'sent_back_for_review' THEN
    RAISE EXCEPTION 'Only requests sent back for review can be resubmitted' USING ERRCODE = '22023';
  END IF;
  IF length(btrim(COALESCE(_reason, ''))) < 3 THEN
    RAISE EXCEPTION 'Please give a reason for the change' USING ERRCODE = '22023';
  END IF;
  _changes := public.normalize_change(_row.table_name, _row.record_id, _new_values);

  UPDATE public.pending_updates SET
    new_values   = _changes,
    old_values   = (SELECT jsonb_object_agg(k, public.change_snapshot(_row.table_name, _row.record_id) -> k)
                    FROM jsonb_object_keys(_changes) k),
    reason       = btrim(_reason),
    status       = 'pending',
    requested_at = now(),
    reviewed_by  = NULL,
    reviewed_at  = NULL
  WHERE id = _id
  RETURNING * INTO _row;
  RETURN _row;
END;
$$;

-- -------------------------------------------------------------------------------------
-- Admin: review (atomic) and archive
-- -------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.review_change(_id uuid, _decision text, _note text DEFAULT NULL)
RETURNS public.pending_updates
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _row public.pending_updates;
  _current jsonb;
  _key text;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Admin privileges required' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO _row FROM public.pending_updates
  WHERE id = _id AND business_id = public.get_user_business(auth.uid())
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Request not found' USING ERRCODE = 'P0002';
  END IF;
  IF _row.status <> 'pending' THEN
    RAISE EXCEPTION 'This request has already been reviewed' USING ERRCODE = '22023';
  END IF;
  IF _decision NOT IN ('approve', 'send_back', 'reject') THEN
    RAISE EXCEPTION 'Unknown decision' USING ERRCODE = '22023';
  END IF;
  IF _decision = 'send_back' AND length(btrim(COALESCE(_note, ''))) = 0 THEN
    RAISE EXCEPTION 'Tell the requester what to change' USING ERRCODE = '22023';
  END IF;

  IF _decision = 'approve' THEN
    -- Re-check against the record as it is NOW: it may have changed since the request.
    _current := public.change_snapshot(_row.table_name, _row.record_id);
    IF _current IS NULL THEN
      RAISE EXCEPTION 'The record no longer exists' USING ERRCODE = 'P0002';
    END IF;
    FOR _key IN SELECT jsonb_object_keys(_row.old_values) LOOP
      IF (_current ->> _key) IS DISTINCT FROM (_row.old_values ->> _key) THEN
        RAISE EXCEPTION 'The record has changed since this request was made. Send it back so it can be updated.'
          USING ERRCODE = '40001';
      END IF;
    END LOOP;
    PERFORM set_config('app.change_reason', _row.reason, true);
    PERFORM public.apply_change(_row.table_name, _row.record_id, _row.new_values);
  END IF;

  UPDATE public.pending_updates SET
    status      = CASE _decision WHEN 'approve' THEN 'approved'::public.change_status
                                 WHEN 'send_back' THEN 'sent_back_for_review'::public.change_status
                                 ELSE 'rejected'::public.change_status END,
    reviewed_by = auth.uid(),
    reviewed_at = now(),
    admin_note  = NULLIF(btrim(_note), '')
  WHERE id = _id
  RETURNING * INTO _row;
  RETURN _row;
END;
$$;

CREATE OR REPLACE FUNCTION public.archive_change(_id uuid, _archived boolean DEFAULT true)
RETURNS public.pending_updates
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE _row public.pending_updates;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Admin privileges required' USING ERRCODE = '42501';
  END IF;
  UPDATE public.pending_updates
  SET archived_at = CASE WHEN _archived THEN now() ELSE NULL END
  WHERE id = _id AND business_id = public.get_user_business(auth.uid()) AND status <> 'pending'
  RETURNING * INTO _row;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Only reviewed requests can be archived' USING ERRCODE = '22023';
  END IF;
  RETURN _row;
END;
$$;

-- Direct product edits by admins go through the same function as approvals.
CREATE OR REPLACE FUNCTION public.update_product(_product_id uuid, _changes jsonb)
RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() OR public.record_business('products', _product_id) IS DISTINCT FROM public.get_user_business(auth.uid()) THEN
    RAISE EXCEPTION 'Admin privileges required' USING ERRCODE = '42501';
  END IF;
  PERFORM public.apply_product_changes(_product_id, _changes);
END;
$$;

-- -------------------------------------------------------------------------------------
-- Access
-- -------------------------------------------------------------------------------------
ALTER TABLE public.pending_updates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins see every request; staff see their own" ON public.pending_updates
  FOR SELECT TO authenticated
  USING (
    business_id = (SELECT public.get_user_business(auth.uid()))
    AND ((SELECT public.is_admin()) OR requested_by = (SELECT auth.uid()))
  );

REVOKE ALL ON public.pending_updates FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.pending_updates FROM authenticated;
GRANT SELECT ON public.pending_updates TO authenticated;

-- Live sidebar badge.
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.pending_updates;
EXCEPTION WHEN undefined_object OR duplicate_object THEN NULL;
END $$;

REVOKE EXECUTE ON FUNCTION
  public.submit_change(text, uuid, jsonb, text),
  public.resubmit_change(uuid, jsonb, text),
  public.review_change(uuid, text, text),
  public.archive_change(uuid, boolean),
  public.update_product(uuid, jsonb)
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION
  public.submit_change(text, uuid, jsonb, text),
  public.resubmit_change(uuid, jsonb, text),
  public.review_change(uuid, text, text),
  public.archive_change(uuid, boolean),
  public.update_product(uuid, jsonb)
TO authenticated;
REVOKE EXECUTE ON FUNCTION
  public.change_whitelist(text),
  public.change_snapshot(text, uuid),
  public.record_business(text, uuid),
  public.normalize_change(text, uuid, jsonb),
  public.apply_product_changes(uuid, jsonb),
  public.apply_change(text, uuid, jsonb)
FROM PUBLIC, anon, authenticated;
