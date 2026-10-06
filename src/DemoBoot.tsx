import React, { useEffect, useState } from "react";
import { Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { setDemoMode } from "@/data/mode";
import { getErrorMessage } from "@/lib/errors";

/**
 * Builds (or reopens) the demo database before the app renders, with progress. The demo
 * code is fetched only here, so normal visitors never download it.
 */
export function DemoBoot({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<{ fraction: number; label: string; error?: string; ready?: boolean }>({
    fraction: 0,
    label: "Loading the demo…",
  });

  useEffect(() => {
    let cancelled = false;
    import("@/demo")
      .then((demo) =>
        demo.startDemo((fraction, label) => {
          if (!cancelled) setState({ fraction, label });
        }),
      )
      .then(() => !cancelled && setState({ fraction: 1, label: "Ready", ready: true }))
      .catch((error) => !cancelled && setState({ fraction: 0, label: "", error: getErrorMessage(error) }));
    return () => {
      cancelled = true;
    };
  }, []);

  if (state.ready) return <>{children}</>;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-5 bg-background px-4 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-primary shadow-glow">
        <Building2 className="h-7 w-7 text-white" aria-hidden />
      </span>
      {state.error ? (
        <div role="alert" className="max-w-sm space-y-3">
          <p className="font-medium text-foreground">The demo couldn't start</p>
          <p className="text-sm text-muted-foreground">{state.error}</p>
          <Button
            onClick={() => {
              setDemoMode(false);
              window.location.assign("/auth");
            }}
          >
            Back to sign in
          </Button>
        </div>
      ) : (
        <div className="w-full max-w-xs space-y-2" role="status" aria-live="polite">
          <p className="font-medium text-foreground">Opening the Smart POS demo</p>
          <Progress value={Math.round(state.fraction * 100)} aria-label="Demo loading progress" />
          <p className="text-sm text-muted-foreground">{state.label}</p>
        </div>
      )}
    </div>
  );
}
