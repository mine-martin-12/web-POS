import React from "react";
import { Link, useLocation } from "react-router-dom";
import { Compass } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { APP_HOME } from "@/config/routes";

const NotFound = () => {
  const { pathname } = useLocation();
  const { user } = useAuth();
  const insideApp = pathname.startsWith("/app");

  return (
    <div
      className={
        insideApp
          ? "flex min-h-[60vh] items-center justify-center"
          : "flex min-h-screen items-center justify-center bg-background p-4"
      }
    >
      <div className="max-w-sm text-center">
        <Compass className="mx-auto mb-4 h-12 w-12 text-muted-foreground" aria-hidden />
        <h1 className="text-3xl font-bold">Page not found</h1>
        <p className="mt-2 text-muted-foreground">
          <code className="rounded bg-muted px-1 text-sm">{pathname}</code> doesn't exist or has moved.
        </p>
        <Button asChild className="mt-6">
          <Link to={user ? APP_HOME : "/"}>{user ? "Back to dashboard" : "Return home"}</Link>
        </Button>
      </div>
    </div>
  );
};

export default NotFound;
