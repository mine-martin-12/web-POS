import React from "react";
import { Building2 } from "lucide-react";
import { cn } from "@/lib/utils";

/** Full-area loading state with the Smart POS mark, used for route and session loading. */
export function BrandedSpinner({ label = "Loading…", fullScreen = false }: { label?: string; fullScreen?: boolean }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "flex flex-col items-center justify-center gap-4 bg-background",
        fullScreen ? "min-h-screen" : "min-h-[50vh]",
      )}
    >
      <div className="relative flex h-14 w-14 items-center justify-center">
        <span className="absolute inset-0 animate-ping rounded-2xl bg-primary/20 motion-reduce:hidden" />
        <span className="relative flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-primary shadow-glow">
          <Building2 className="h-7 w-7 text-white" aria-hidden />
        </span>
      </div>
      <p className="text-sm text-muted-foreground">{label}</p>
    </div>
  );
}
