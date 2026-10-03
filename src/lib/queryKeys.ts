/**
 * Every React Query key in the app, in one place, so reads and invalidations always
 * agree. Keys are hierarchical: invalidating `queryKeys.sales.all` also refreshes
 * `queryKeys.sales.list()` and every `queryKeys.sales.range(…)`.
 */
export const queryKeys = {
  staff: {
    all: ["staff"] as const,
    members: () => [...queryKeys.staff.all, "members"] as const,
    invitations: () => [...queryKeys.staff.all, "invitations"] as const,
    names: () => [...queryKeys.staff.all, "names"] as const,
  },
  approvals: {
    all: ["approvals"] as const,
    list: () => [...queryKeys.approvals.all, "list"] as const,
  },
  sales: {
    all: ["sales"] as const,
    list: () => [...queryKeys.sales.all, "list"] as const,
    range: (from: string, to: string) => [...queryKeys.sales.all, "range", from, to] as const,
    months: () => [...queryKeys.sales.all, "months"] as const,
  },
  products: {
    all: ["products"] as const,
    list: () => [...queryKeys.products.all, "list"] as const,
  },
  credits: {
    all: ["credits"] as const,
    list: () => [...queryKeys.credits.all, "list"] as const,
    payments: (creditId: string) => [...queryKeys.credits.all, "payments", creditId] as const,
    paymentsRange: (from: string, to: string) => [...queryKeys.credits.all, "payments-range", from, to] as const,
  },
  customers: {
    all: ["customers"] as const,
    list: () => [...queryKeys.customers.all, "list"] as const,
    search: (mode: string, term: string) => [...queryKeys.customers.all, "search", mode, term] as const,
  },
  expenses: {
    all: ["expenses"] as const,
    range: (from: string, to: string) => [...queryKeys.expenses.all, "range", from, to] as const,
  },
  activity: {
    all: ["activity"] as const,
    page: (filters: object, page: number, size: number) => [...queryKeys.activity.all, filters, page, size] as const,
  },
  nav: {
    all: ["nav"] as const,
    overdueCredits: () => [...queryKeys.nav.all, "overdue-credits"] as const,
    approvals: (role: string) => [...queryKeys.nav.all, "approvals", role] as const,
  },
} as const;
