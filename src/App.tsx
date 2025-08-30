import React from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import AuthGuard from "@/components/auth/AuthGuard";
import DashboardLayout from "@/components/layout/DashboardLayout";
import InactivityWrapper from "@/components/layout/InactivityWrapper";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import ResetPassword from "./pages/ResetPassword";
import Dashboard from "./pages/Dashboard";
import Products from "./pages/Products";
import Sales from "./pages/Sales";
import Credits from "./pages/Credits";
import Users from "./pages/Users";
import Settings from "./pages/Settings";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider>
      <AuthProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <Routes>
              <Route path="/" element={<Index />} />
              <Route path="/auth" element={<Auth />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              
              {/* Protected routes */}
              <Route path="/dashboard" element={
                <AuthGuard>
                  <InactivityWrapper timeoutMinutes={6} warningMinutes={3}>
                    <DashboardLayout>
                      <Dashboard />
                    </DashboardLayout>
                  </InactivityWrapper>
                </AuthGuard>
              } />
              <Route path="/products" element={
                <AuthGuard>
                  <InactivityWrapper timeoutMinutes={6} warningMinutes={3}>
                    <DashboardLayout>
                      <Products />
                    </DashboardLayout>
                  </InactivityWrapper>
                </AuthGuard>
              } />
              <Route path="/sales" element={
                <AuthGuard>
                  <InactivityWrapper timeoutMinutes={6} warningMinutes={3}>
                    <DashboardLayout>
                      <Sales />
                    </DashboardLayout>
                  </InactivityWrapper>
                </AuthGuard>
              } />
              <Route path="/credits" element={
                <AuthGuard>
                  <InactivityWrapper timeoutMinutes={6} warningMinutes={3}>
                    <DashboardLayout>
                      <Credits />
                    </DashboardLayout>
                  </InactivityWrapper>
                </AuthGuard>
              } />
              <Route path="/users" element={
                <AuthGuard>
                  <InactivityWrapper timeoutMinutes={6} warningMinutes={3}>
                    <DashboardLayout>
                      <Users />
                    </DashboardLayout>
                  </InactivityWrapper>
                </AuthGuard>
              } />
              <Route path="/settings" element={
                <AuthGuard>
                  <InactivityWrapper timeoutMinutes={6} warningMinutes={3}>
                    <DashboardLayout>
                      <Settings />
                    </DashboardLayout>
                  </InactivityWrapper>
                </AuthGuard>
              } />
              
              {/* Catch-all route */}
              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </TooltipProvider>
      </AuthProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
