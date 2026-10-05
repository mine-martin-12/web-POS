import { supabase } from "@/integrations/supabase/client";

export interface ChangeSubscription {
  /** Unique per subscription, e.g. `notifications:<userId>`. */
  channel: string;
  table: string;
  /** PostgREST-style filter, e.g. `user_id=eq.<id>`. */
  filter: string;
}

/** Call onChange whenever a row the user can see changes. Returns an unsubscribe function. */
export function subscribeToChanges(sub: ChangeSubscription, onChange: () => void): () => void {
  const channel = supabase
    .channel(sub.channel)
    .on("postgres_changes", { event: "*", schema: "public", table: sub.table, filter: sub.filter }, onChange)
    .subscribe();
  return () => {
    void supabase.removeChannel(channel);
  };
}
