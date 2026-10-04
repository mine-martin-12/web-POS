-- Create notifications table
CREATE TABLE public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL,
  user_id UUID NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  type TEXT NOT NULL,
  reference_id UUID,
  reference_type TEXT,
  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT now(),
  read_at TIMESTAMPTZ
);

-- Create update_requests table
CREATE TABLE public.update_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL,
  requested_by UUID NOT NULL,
  reviewed_by UUID,
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  current_data JSONB NOT NULL,
  requested_data JSONB NOT NULL,
  update_reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  review_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  reviewed_at TIMESTAMPTZ
);

-- Enable RLS
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.update_requests ENABLE ROW LEVEL SECURITY;

-- Notifications RLS policies
CREATE POLICY "Users can view their own notifications"
ON public.notifications FOR SELECT
USING (user_id = auth.uid());

CREATE POLICY "Users can update their own notifications"
ON public.notifications FOR UPDATE
USING (user_id = auth.uid());

CREATE POLICY "Users can delete their own notifications"
ON public.notifications FOR DELETE
USING (user_id = auth.uid());

CREATE POLICY "System can insert notifications"
ON public.notifications FOR INSERT
WITH CHECK (business_id = get_current_user_business_id());

-- Update requests RLS policies
CREATE POLICY "Users can view their own update requests"
ON public.update_requests FOR SELECT
USING (requested_by = auth.uid() OR (get_current_user_role() = 'admin' AND business_id = get_current_user_business_id()));

CREATE POLICY "Users can create update requests"
ON public.update_requests FOR INSERT
WITH CHECK (business_id = get_current_user_business_id() AND requested_by = auth.uid());

CREATE POLICY "Users can update their own pending/sent_back requests"
ON public.update_requests FOR UPDATE
USING (
  (requested_by = auth.uid() AND status IN ('pending', 'sent_back')) 
  OR (get_current_user_role() = 'admin' AND business_id = get_current_user_business_id())
);

CREATE POLICY "Admins can delete update requests"
ON public.update_requests FOR DELETE
USING (get_current_user_role() = 'admin' AND business_id = get_current_user_business_id());

-- Enable realtime for both tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE public.update_requests;

-- Create trigger to update updated_at
CREATE TRIGGER update_requests_updated_at
BEFORE UPDATE ON public.update_requests
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();;