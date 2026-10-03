import React from "react";
import { Navigate } from "react-router-dom";
import { format } from "date-fns";
import { LogOut, Mail, Phone } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { AuthShell } from "@/components/auth/AuthShell";
import { BrandedSpinner } from "@/components/common/BrandedSpinner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { APP_HOME } from "@/config/routes";
import { SUPPORT_CONTACT, subscriptionState } from "@/lib/subscription";

const Expired = () => {
  const { user, business, isLoading, isLoadingRole, signOut } = useAuth();
  if (isLoading || (user && isLoadingRole && !business)) return <BrandedSpinner fullScreen />;
  if (!user) return <Navigate to="/auth" replace />;
  const state = subscriptionState(business);
  if (state.active) return <Navigate to={APP_HOME} replace />;

  const message =
    state.status === "suspended"
      ? "This account has been suspended."
      : state.status === "trial" && state.trialEndsAt
        ? `Your free trial ended on ${format(state.trialEndsAt, "d MMMM yyyy")}.`
        : "Your subscription has ended.";

  return (
    <AuthShell subtitle={business?.name}>
      <Card className="card-elevated">
        <CardHeader>
          <CardTitle>Your account is paused</CardTitle>
          <CardDescription>
            {message} Your data is safe and will be available again as soon as the account is reactivated.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {SUPPORT_CONTACT.email && (
            <Button asChild>
              <a href={`mailto:${SUPPORT_CONTACT.email}?subject=${encodeURIComponent("Reactivate Smart POS account")}`}>
                <Mail className="mr-2 h-4 w-4" />
                Email {SUPPORT_CONTACT.email}
              </a>
            </Button>
          )}
          {SUPPORT_CONTACT.phone && (
            <Button asChild variant={SUPPORT_CONTACT.email ? "outline" : "default"}>
              <a href={`tel:${SUPPORT_CONTACT.phone}`}>
                <Phone className="mr-2 h-4 w-4" />
                Call {SUPPORT_CONTACT.phone}
              </a>
            </Button>
          )}
          {!SUPPORT_CONTACT.email && !SUPPORT_CONTACT.phone && (
            <p className="text-sm text-muted-foreground">Contact your Smart POS provider to reactivate your account.</p>
          )}
          <Button variant="ghost" onClick={() => void signOut()}>
            <LogOut className="mr-2 h-4 w-4" />
            Log out
          </Button>
        </CardContent>
      </Card>
    </AuthShell>
  );
};

export default Expired;
