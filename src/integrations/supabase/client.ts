import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

// Values come from VITE_SUPABASE_* env vars (see .env.example). The fallbacks are the
// project's public URL and anon key, which are safe to ship: RLS is the security boundary.
const SUPABASE_URL =
  import.meta.env.VITE_SUPABASE_URL ?? "https://khmimsqqpjzmysmsdidd.supabase.co";
const SUPABASE_PUBLISHABLE_KEY =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtobWltc3FxcGp6bXlzbXNkaWRkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTU3MjA0NzgsImV4cCI6MjA3MTI5NjQ3OH0.sx_U2v1ZWqXdVhu_daDxYPq0eYOzAeN7pxEhj1U-_-8";

// Import the supabase client like this:
// import { supabase } from "@/integrations/supabase/client";

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storage: localStorage,
    persistSession: true,
    autoRefreshToken: true,
  }
});
