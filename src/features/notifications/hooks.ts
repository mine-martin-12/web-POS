import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { getErrorMessage } from "@/lib/errors";
import { queryKeys } from "@/lib/queryKeys";
import {
  archiveNotification,
  checkOverdueCredits,
  fetchNotifications,
  fetchPreferences,
  markRead,
  savePreferences,
  type Notification,
  type NotificationPreferences,
} from "./api";

/** The signed-in user's notifications, kept live by a realtime subscription. */
export function useNotifications() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const userId = user?.id;

  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`notifications:${userId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` }, () => {
        void queryClient.invalidateQueries({ queryKey: queryKeys.notifications.list() });
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId, queryClient]);

  return useQuery({ queryKey: queryKeys.notifications.list(), queryFn: fetchNotifications, enabled: !!userId });
}

/** Optimistic list update with rollback + a quiet refetch afterwards. */
function useNotificationMutation<TInput>(
  fn: (input: TInput) => Promise<void>,
  update: (list: Notification[], input: TInput) => Notification[],
  failure: string,
) {
  const queryClient = useQueryClient();
  const key = queryKeys.notifications.list();
  return useMutation({
    mutationFn: fn,
    onMutate: async (input: TInput) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<Notification[]>(key);
      queryClient.setQueryData<Notification[]>(key, (list) => (list ? update(list, input) : list));
      return { previous };
    },
    onError: (error, _input, context) => {
      queryClient.setQueryData(key, context?.previous);
      toast.error(failure, { description: getErrorMessage(error) });
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: key }),
  });
}

const now = () => new Date().toISOString();

export const useMarkRead = () =>
  useNotificationMutation(
    (ids: string[]) => markRead(ids),
    (list, ids) => list.map((n) => (ids.includes(n.id) && !n.read_at ? { ...n, read_at: now() } : n)),
    "Couldn't mark as read",
  );

export const useArchiveNotification = () =>
  useNotificationMutation(
    (id: string) => archiveNotification(id),
    (list, id) => list.filter((n) => n.id !== id),
    "Couldn't dismiss",
  );

export function usePreferences() {
  const { user } = useAuth();
  return useQuery({
    queryKey: queryKeys.notifications.preferences(),
    queryFn: () => fetchPreferences(user!.id),
    enabled: !!user,
  });
}

export function useSavePreferences() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (prefs: NotificationPreferences) => savePreferences(user!.id, prefs),
    onSuccess: (_d, prefs) => queryClient.setQueryData(queryKeys.notifications.preferences(), prefs),
  });
}

const OVERDUE_CHECK_KEY = "smartpos:overdue-check";

/** Once per day per browser, ask the server to raise newly overdue credits. */
export function useOverdueCheck() {
  const { business } = useAuth();
  const businessId = business?.id;
  useEffect(() => {
    if (!businessId) return;
    const stamp = `${businessId}:${new Date().toDateString()}`;
    try {
      if (localStorage.getItem(OVERDUE_CHECK_KEY) === stamp) return;
      localStorage.setItem(OVERDUE_CHECK_KEY, stamp);
    } catch {
      // storage unavailable: the server-side guard still prevents duplicates
    }
    void checkOverdueCredits().catch(() => undefined); // non-critical
  }, [businessId]);
}
