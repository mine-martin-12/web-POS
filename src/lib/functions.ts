import { FunctionsHttpError } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

/**
 * Call an edge function and return its JSON body, throwing an Error whose message is
 * the function's user-facing `{ error }` text (not the generic "non-2xx status code").
 */
export async function invokeFunction<T>(name: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke<T>(name, { body });
  if (error) {
    if (error instanceof FunctionsHttpError) {
      const payload = await error.context.json().catch(() => null);
      if (payload && typeof payload.error === "string") throw new Error(payload.error);
    }
    throw error;
  }
  return data as T;
}
