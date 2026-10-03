-- =====================================================================================
-- Phase 3: customer SMS (Africa's Talking)
--
-- Messages are written only by the send-sms edge function (service role), which checks
-- the admin role and only ever sends to phone numbers of the business's own customers.
-- Admins read history and manage templates.
-- =====================================================================================

CREATE TABLE IF NOT EXISTS public.sms_templates (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id  uuid NOT NULL DEFAULT public.get_user_business(auth.uid())
               REFERENCES public.businesses(id) ON DELETE CASCADE,
  name         text NOT NULL CHECK (length(btrim(name)) > 0),
  body         text NOT NULL CHECK (length(btrim(body)) > 0 AND length(body) <= 480),
  created_by   uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER update_sms_templates_updated_at BEFORE UPDATE ON public.sms_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER enforce_tenant_scope BEFORE INSERT OR UPDATE ON public.sms_templates
  FOR EACH ROW EXECUTE FUNCTION public.enforce_tenant_scope();

CREATE TABLE IF NOT EXISTS public.sms_messages (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id          uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  customer_id          uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  phone                text NOT NULL,
  body                 text NOT NULL,
  status               text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed')),
  error                text,
  provider_message_id  text,
  broadcast_id         uuid,
  kind                 text NOT NULL DEFAULT 'manual' CHECK (kind IN ('manual', 'broadcast', 'reminder')),
  sent_by              uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sms_messages_business_time ON public.sms_messages (business_id, created_at DESC);
CREATE TRIGGER update_sms_messages_updated_at BEFORE UPDATE ON public.sms_messages
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Overdue reminders are sent once per credit.
ALTER TABLE public.credits ADD COLUMN IF NOT EXISTS reminder_sent_at timestamptz;

ALTER TABLE public.sms_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sms_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage SMS templates" ON public.sms_templates
  FOR ALL TO authenticated
  USING (business_id = (SELECT public.get_user_business(auth.uid())) AND (SELECT public.is_admin()))
  WITH CHECK (business_id = (SELECT public.get_user_business(auth.uid())) AND (SELECT public.is_admin()));
CREATE POLICY "Admins read SMS history" ON public.sms_messages
  FOR SELECT TO authenticated
  USING (business_id = (SELECT public.get_user_business(auth.uid())) AND (SELECT public.is_admin()));

REVOKE ALL ON public.sms_templates, public.sms_messages FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sms_templates TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.sms_messages FROM authenticated;
GRANT SELECT ON public.sms_messages TO authenticated;

-- Message phones are stored masked in the audit log like everywhere else.
CREATE TRIGGER log_activity AFTER INSERT OR UPDATE OR DELETE ON public.sms_templates
  FOR EACH ROW EXECUTE FUNCTION public.log_activity();

-- Audience counts for the Broadcast tab (admins). Phone numbers never leave the server.
CREATE OR REPLACE FUNCTION public.sms_audience(_audience text)
RETURNS TABLE (customer_id uuid, name text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE _business uuid := public.get_user_business(auth.uid());
BEGIN
  IF _business IS NULL OR NOT public.is_admin() THEN
    RAISE EXCEPTION 'Admin privileges required' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
    SELECT c.id, c.name FROM public.customers c
    WHERE c.business_id = _business AND c.archived_at IS NULL AND c.phone IS NOT NULL
      AND (
        _audience = 'all'
        OR (_audience = 'owing' AND EXISTS (
          SELECT 1 FROM public.credits cr WHERE cr.customer_id = c.id AND cr.status <> 'paid'))
        OR (_audience = 'overdue' AND EXISTS (
          SELECT 1 FROM public.credits cr WHERE cr.customer_id = c.id AND cr.status <> 'paid'
            AND cr.due_date < (now() AT TIME ZONE public.business_timezone(_business))::date))
      )
    ORDER BY c.name;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.sms_audience(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sms_audience(text) TO authenticated;
