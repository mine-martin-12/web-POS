import React, { lazy, Suspense } from "react";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import AuthGuard from "@/components/auth/AuthGuard";
import { PublicOnly } from "@/components/auth/PublicOnly";
import { RoleBasedAccess } from "@/components/auth/RoleBasedAccess";
import { BrandedSpinner } from "@/components/common/BrandedSpinner";
import { AppLayout } from "@/components/layout/AppLayout";
import { InactivityManager } from "@/components/session/InactivityManager";
import { PrivacyModeProvider } from "@/contexts/PrivacyModeContext";
import { LEGACY_REDIRECTS } from "@/config/routes";

// Every page is code-split; the shell shows a branded spinner while one loads.
const Index = lazy(() => import("./pages/Index"));
const Auth = lazy(() => import("./pages/Auth"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const AcceptInvite = lazy(() => import("./pages/AcceptInvite"));
const NotFound = lazy(() => import("./pages/NotFound"));
const Expired = lazy(() => import("./pages/Expired"));
const Dashboard = lazy(() => import("./features/dashboard/pages/DashboardPage"));
const Sales = lazy(() => import("./features/sales/pages/SalesPage"));
const Credits = lazy(() => import("./features/credits/pages/CreditsPage"));
const Products = lazy(() => import("./features/products/pages/ProductsPage"));
const CustomersPage = lazy(() => import("./features/customers/pages/CustomersPage"));
const Settings = lazy(() => import("./pages/Settings"));
const StaffPage = lazy(() => import("./features/staff/pages/StaffPage"));
const ApprovalsPage = lazy(() => import("./features/approvals/pages/ApprovalsPage"));
const ActivityPage = lazy(() => import("./features/activity/pages/ActivityPage"));
const ExpensesPage = lazy(() => import("./features/expenses/pages/ExpensesPage"));
const ReportsPage = lazy(() => import("./features/reports/pages/ReportsPage"));
const MessagingPage = lazy(() => import("./features/messaging/pages/MessagingPage"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: true,
      retry: 1,
    },
  },
});

/** /sales?new=1 → /app/sales?new=1 and so on: old links and bookmarks keep working. */
function LegacyRedirect({ to }: { to: string }) {
  const { search, hash } = useLocation();
  return <Navigate to={`${to}${search}${hash}`} replace />;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem storageKey="theme" disableTransitionOnChange>
      <AuthProvider>
        <PrivacyModeProvider>
          <TooltipProvider delayDuration={300}>
            <Sonner richColors closeButton />
            <InactivityManager />
            <BrowserRouter>
              <Suspense fallback={<BrandedSpinner fullScreen />}>
                <Routes>
                  {/* Public */}
                  <Route
                    path="/"
                    element={
                      <PublicOnly>
                        <Index />
                      </PublicOnly>
                    }
                  />
                  <Route path="/auth" element={<Auth />} />
                  <Route path="/reset-password" element={<ResetPassword />} />
                  <Route path="/accept-invite" element={<AcceptInvite />} />
                  <Route path="/expired" element={<Expired />} />

                  {/* Signed-in app */}
                  <Route
                    path="/app"
                    element={
                      <AuthGuard>
                        <AppLayout />
                      </AuthGuard>
                    }
                  >
                    <Route index element={<Dashboard />} />
                    <Route path="sales" element={<Sales />} />
                    <Route path="credits" element={<Credits />} />
                    <Route path="products" element={<Products />} />
                    <Route path="customers" element={<CustomersPage />} />
                    <Route
                      path="staff"
                      element={
                        <RoleBasedAccess adminOnly>
                          <StaffPage />
                        </RoleBasedAccess>
                      }
                    />
                    <Route path="approvals" element={<ApprovalsPage />} />
                    <Route
                      path="messages"
                      element={
                        <RoleBasedAccess capability="canSendMessages">
                          <MessagingPage />
                        </RoleBasedAccess>
                      }
                    />
                    <Route
                      path="reports"
                      element={
                        <RoleBasedAccess capability="canViewFinancialData">
                          <ReportsPage />
                        </RoleBasedAccess>
                      }
                    />
                    <Route
                      path="expenses"
                      element={
                        <RoleBasedAccess capability="canManageExpenses">
                          <ExpensesPage />
                        </RoleBasedAccess>
                      }
                    />
                    <Route
                      path="activity"
                      element={
                        <RoleBasedAccess capability="canViewAuditLog">
                          <ActivityPage />
                        </RoleBasedAccess>
                      }
                    />
                    <Route path="settings" element={<Settings />} />
                    <Route path="*" element={<NotFound />} />
                  </Route>

                  {Object.entries(LEGACY_REDIRECTS).map(([from, to]) => (
                    <Route key={from} path={from} element={<LegacyRedirect to={to} />} />
                  ))}

                  <Route path="*" element={<NotFound />} />
                </Routes>
              </Suspense>
            </BrowserRouter>
          </TooltipProvider>
        </PrivacyModeProvider>
      </AuthProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
