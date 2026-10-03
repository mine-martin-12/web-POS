import React from "react";
import { Link } from "react-router-dom";
import { Building2 } from "lucide-react";

/** Branded frame shared by sign-in, password reset and invitation pages. */
export function AuthShell({ subtitle, children }: { subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-muted p-4">
      <main className="w-full max-w-md animate-fade-in-up">
        <div className="text-center mb-8">
          <Link
            to="/"
            className="inline-flex items-center justify-center w-16 h-16 bg-gradient-primary rounded-2xl mb-4 shadow-glow"
            aria-label="Smart POS home"
          >
            <Building2 className="h-8 w-8 text-white" />
          </Link>
          <h1 className="text-3xl font-bold text-foreground">Smart POS</h1>
          {subtitle && <p className="text-muted-foreground mt-2">{subtitle}</p>}
        </div>
        {children}
      </main>
    </div>
  );
}
