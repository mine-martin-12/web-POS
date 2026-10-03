/**
 * Every React Query key in the app, in one place, so reads and invalidations always
 * agree. Keys are hierarchical: invalidating `queryKeys.staff.all` also refreshes
 * `queryKeys.staff.members()` and `queryKeys.staff.invitations()`.
 */
export const queryKeys = {
  staff: {
    all: ["staff"] as const,
    members: () => [...queryKeys.staff.all, "members"] as const,
    invitations: () => [...queryKeys.staff.all, "invitations"] as const,
  },
  nav: {
    all: ["nav"] as const,
    overdueCredits: () => [...queryKeys.nav.all, "overdue-credits"] as const,
  },
} as const;
