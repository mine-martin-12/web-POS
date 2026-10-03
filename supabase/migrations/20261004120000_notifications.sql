-- =====================================================================================
-- Phase 3: in-app notifications
--
-- * notifications (per user) + notification_preferences
-- * notify_user() / notify_admins() never raise: a failed notification must not block
--   the action that caused it
-- * side effects run once: low-stock and overdue alerts are guarded by *_notified_at
-- =====================================================================================

CREATE TABLE IF NOT EXISTS public.notifications (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id  uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind         text NOT NULL,
  title        text NOT NULL,
  body         text,
  link_table   text,
  link_id      uuid,
  read_at      timestamptz,
  archived_at  timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON public.notifications (user_id, archived_at, created_at DESC);

CREATE TABLE IF NOT EXISTS public.notification_preferences (
  user_id          uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  change_requests  boolean NOT NULL DEFAULT true,
  overdue_credits  boolean NOT NULL DEFAULT true,
  low_stock        boolean NOT NULL DEFAULT true,
  team             boolean NOT NULL DEFAULT true,
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER update_notification_preferences_updated_at
  BEFORE UPDATE ON public.notification_preferences
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.products ADD COLUMN IF NOT EXISTS low_stock_notified_at timestamptz;
ALTER TABLE public.credits ADD COLUMN IF NOT EXISTS overdue_notified_at timestamptz;

-- -------------------------------------------------------------------------------------
-- Helpers (fail silently)
-- -------------------------------------------------------------------------------------
-- _pref is the notification_preferences column that can switch this kind off.
CREATE OR REPLACE FUNCTION public.notify_user(
  _user uuid, _kind text, _pref text, _title text, _body text DEFAULT NULL,
  _link_table text DEFAULT NULL, _link_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _enabled boolean := true;
  _business uuid;
BEGIN
  SELECT business_id INTO _business FROM public.profiles WHERE user_id = _user AND is_active;
  IF _business IS NULL THEN
    RETURN;
  END IF;
  IF _pref IS NOT NULL THEN
    EXECUTE format('SELECT %I FROM public.notification_preferences WHERE user_id = $1', _pref)
      INTO _enabled USING _user;
  END IF;
  IF COALESCE(_enabled, true) THEN
    INSERT INTO public.notifications (business_id, user_id, kind, title, body, link_table, link_id)
    VALUES (_business, _user, _kind, _title, _body, _link_table, _link_id);
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'notify_user failed: %', SQLERRM;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_admins(
  _business uuid, _kind text, _pref text, _title text, _body text DEFAULT NULL,
  _link_table text DEFAULT NULL, _link_id uuid DEFAULT NULL, _except uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE _admin uuid;
BEGIN
  FOR _admin IN
    SELECT ur.user_id FROM public.user_roles ur
    JOIN public.profiles p ON p.user_id = ur.user_id AND p.business_id = ur.business_id
    WHERE ur.business_id = _business AND ur.role = 'admin' AND p.is_active
      AND ur.user_id IS DISTINCT FROM _except
  LOOP
    PERFORM public.notify_user(_admin, _kind, _pref, _title, _body, _link_table, _link_id);
  END LOOP;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'notify_admins failed: %', SQLERRM;
END;
$$;

CREATE OR REPLACE FUNCTION public.member_name(_user uuid)
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE(NULLIF(btrim(first_name || ' ' || last_name), ''), email, 'A team member')
  FROM public.profiles WHERE user_id = _user;
$$;

-- -------------------------------------------------------------------------------------
-- Change requests → admins (new / resubmitted) and requester (decision)
-- -------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.notify_change_request()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'pending' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'pending') THEN
    PERFORM public.notify_admins(
      NEW.business_id, 'change_request', 'change_requests',
      public.member_name(NEW.requested_by) || CASE WHEN TG_OP = 'INSERT' THEN ' requested a change' ELSE ' resubmitted a change' END,
      NEW.reason, 'pending_updates', NEW.id, NEW.requested_by
    );
  ELSIF TG_OP = 'UPDATE' AND OLD.status = 'pending' AND NEW.status <> 'pending' AND NEW.requested_by IS NOT NULL THEN
    PERFORM public.notify_user(
      NEW.requested_by, 'change_' || NEW.status, 'change_requests',
      CASE NEW.status
        WHEN 'approved' THEN 'Your change was approved'
        WHEN 'rejected' THEN 'Your change was rejected'
        ELSE 'Your change was sent back for review'
      END,
      NEW.admin_note, 'pending_updates', NEW.id
    );
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER notify_change_request
  AFTER INSERT OR UPDATE OF status ON public.pending_updates
  FOR EACH ROW EXECUTE FUNCTION public.notify_change_request();

-- -------------------------------------------------------------------------------------
-- Low stock → admins, once per dip below the threshold
-- -------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.notify_low_stock()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE _threshold constant integer := 5;
BEGIN
  IF NEW.stock_quantity < _threshold AND NEW.low_stock_notified_at IS NULL AND NEW.archived_at IS NULL THEN
    PERFORM public.notify_admins(
      NEW.business_id, 'low_stock', 'low_stock',
      CASE WHEN NEW.stock_quantity <= 0 THEN NEW.name || ' is out of stock' ELSE NEW.name || ' is running low' END,
      NEW.stock_quantity || ' left', 'products', NEW.id
    );
    UPDATE public.products SET low_stock_notified_at = now() WHERE id = NEW.id;
  ELSIF NEW.stock_quantity >= _threshold AND NEW.low_stock_notified_at IS NOT NULL THEN
    UPDATE public.products SET low_stock_notified_at = NULL WHERE id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER notify_low_stock
  AFTER INSERT OR UPDATE OF stock_quantity ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.notify_low_stock();

-- -------------------------------------------------------------------------------------
-- Team: an invitee finishing sign-up → admins
-- -------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.notify_member_joined()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NEW.accepted_at IS NOT NULL AND OLD.accepted_at IS NULL AND NEW.user_id IS NOT NULL THEN
    PERFORM public.notify_admins(
      NEW.business_id, 'member_joined', 'team',
      public.member_name(NEW.user_id) || ' joined the team', NULL, 'profiles', NEW.user_id, NEW.user_id
    );
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER notify_member_joined
  AFTER UPDATE OF accepted_at ON public.invitations
  FOR EACH ROW EXECUTE FUNCTION public.notify_member_joined();

-- -------------------------------------------------------------------------------------
-- Overdue credits → admins, once per credit. Called by the app when someone opens it
-- (no scheduler needed); overdue_notified_at makes repeated calls harmless.
-- -------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.notify_overdue_credits()
RETURNS integer
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _business uuid := public.get_user_business(auth.uid());
  _credit record;
  _count integer := 0;
BEGIN
  IF _business IS NULL THEN
    RETURN 0;
  END IF;
  FOR _credit IN
    SELECT c.id, c.customer_name, c.amount_owed - c.amount_paid AS balance
    FROM public.credits c
    WHERE c.business_id = _business AND c.status <> 'paid' AND c.overdue_notified_at IS NULL
      AND c.due_date < (now() AT TIME ZONE public.business_timezone(_business))::date
    FOR UPDATE SKIP LOCKED
  LOOP
    PERFORM public.notify_admins(
      _business, 'credit_overdue', 'overdue_credits',
      _credit.customer_name || '''s credit is overdue', 'Balance ' || _credit.balance, 'credits', _credit.id
    );
    UPDATE public.credits SET overdue_notified_at = now() WHERE id = _credit.id;
    _count := _count + 1;
  END LOOP;
  RETURN _count;
END;
$$;

-- -------------------------------------------------------------------------------------
-- Access: users see and manage only their own notifications and preferences
-- -------------------------------------------------------------------------------------
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read their notifications" ON public.notifications
  FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));
CREATE POLICY "Users mark their notifications" ON public.notifications
  FOR UPDATE TO authenticated USING (user_id = (SELECT auth.uid())) WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY "Users read their preferences" ON public.notification_preferences
  FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));
CREATE POLICY "Users create their preferences" ON public.notification_preferences
  FOR INSERT TO authenticated WITH CHECK (user_id = (SELECT auth.uid()));
CREATE POLICY "Users update their preferences" ON public.notification_preferences
  FOR UPDATE TO authenticated USING (user_id = (SELECT auth.uid())) WITH CHECK (user_id = (SELECT auth.uid()));

REVOKE ALL ON public.notifications, public.notification_preferences FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.notifications FROM authenticated;
GRANT SELECT ON public.notifications TO authenticated;
GRANT UPDATE (read_at, archived_at) ON public.notifications TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.notification_preferences TO authenticated;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
EXCEPTION WHEN undefined_object OR duplicate_object THEN NULL;
END $$;

REVOKE EXECUTE ON FUNCTION
  public.notify_user(uuid, text, text, text, text, text, uuid),
  public.notify_admins(uuid, text, text, text, text, text, uuid, uuid),
  public.member_name(uuid),
  public.notify_change_request(),
  public.notify_low_stock(),
  public.notify_member_joined()
FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_overdue_credits() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.notify_overdue_credits() TO authenticated;

-- Alert bookkeeping isn't a business change: keep it out of the audit log.
CREATE OR REPLACE FUNCTION public.audit_ignored_columns()
RETURNS text[]
LANGUAGE sql IMMUTABLE
SET search_path = public
AS $$
  SELECT ARRAY['updated_at', 'created_at', 'total_buying_price', 'search_text',
               'low_stock_notified_at', 'overdue_notified_at'];
$$;
