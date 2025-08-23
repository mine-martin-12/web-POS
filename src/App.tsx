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
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import Products from "./pages/Products";
import Sales from "./pages/Sales";
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
              
              {/* Protected routes */}
              <Route path="/dashboard" element={
                <AuthGuard>
                  <DashboardLayout>
                    <Dashboard />
                  </DashboardLayout>
                </AuthGuard>
              } />
              <Route path="/products" element={
                <AuthGuard>
                  <DashboardLayout>
                    <Products />
                  </DashboardLayout>
                </AuthGuard>
              } />
              <Route path="/sales" element={
                <AuthGuard>
                  <DashboardLayout>
                    <Sales />
                  </DashboardLayout>
                </AuthGuard>
              } />
              <Route path="/users" element={
                <AuthGuard>
                  <DashboardLayout>
                    <Users />
                  </DashboardLayout>
                </AuthGuard>
              } />
              <Route path="/settings" element={
                <AuthGuard>
                  <DashboardLayout>
                    <Settings />
                  </DashboardLayout>
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
