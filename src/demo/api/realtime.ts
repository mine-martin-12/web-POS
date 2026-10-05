import type { ChangeSubscription, RealtimeApi } from "@/lib/realtime";

/**
 * No live channel in the demo: there is only one visitor, every write already refreshes
 * the queries it affects, and switching role refreshes everything.
 */
export const realtime = {
  subscribeToChanges(_sub: ChangeSubscription, _onChange: () => void) {
    return () => {};
  },
} satisfies RealtimeApi;
