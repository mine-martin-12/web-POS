/**
 * Everything the app asks of its backend, per feature. Each feature's api.ts declares its
 * slice from the Supabase implementation; the demo must provide the same shape (it is
 * declared `satisfies DataApi`), so a new backend call without a demo version fails the
 * typecheck.
 */
export interface DataApi {
  account: import("@/features/account/api").AccountApi;
  activity: import("@/features/activity/api").ActivityApi;
  approvals: import("@/features/approvals/api").ApprovalsApi;
  credits: import("@/features/credits/api").CreditsApi;
  customers: import("@/features/customers/api").CustomersApi;
  expenses: import("@/features/expenses/api").ExpensesApi;
  messaging: import("@/features/messaging/api").MessagingApi;
  notifications: import("@/features/notifications/api").NotificationsApi;
  products: import("@/features/products/api").ProductsApi;
  realtime: import("@/lib/realtime").RealtimeApi;
  sales: import("@/features/sales/api").SalesApi;
  staff: import("@/features/staff/api").StaffApi;
}
