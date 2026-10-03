import React from "react";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: React.ReactNode;
  action?: { label: string; onClick: () => void };
  /** default: centred block; card: bordered panel; minimal: one quiet line */
  variant?: "default" | "card" | "minimal";
  className?: string;
}

/** Friendly "nothing here yet" with a clear next step. For filtered-out lists use the
 *  table's built-in "no results" state instead. */
export function EmptyState({ icon: Icon, title, description, action, variant = "default", className }: EmptyStateProps) {
  if (variant === "minimal") {
    return (
      <p className={cn("flex items-center gap-2 py-3 text-sm text-muted-foreground", className)}>
        <Icon className="h-4 w-4" aria-hidden />
        {title}
      </p>
    );
  }
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-3 text-center",
        variant === "card" && "rounded-xl border border-dashed p-8",
        variant === "default" && "py-6",
        className,
      )}
    >
      <span className="relative flex h-16 w-16 items-center justify-center">
        <span className="absolute inset-0 rounded-2xl bg-gradient-primary opacity-10" aria-hidden />
        <span className="absolute inset-2 rounded-xl bg-primary/10" aria-hidden />
        <Icon className="relative h-7 w-7 text-primary" aria-hidden />
      </span>
      <div className="max-w-sm space-y-1">
        <p className="font-semibold">{title}</p>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {action && (
        <Button variant="outline" size="sm" onClick={action.onClick}>
          {action.label}
        </Button>
      )}
    </div>
  );
}
