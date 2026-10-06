import React, { useState } from "react";
import { FlaskConical, LogOut, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { MEMBERS } from "../seed/catalog";
import type { DemoRole } from "../session";
import { useDemo } from "./DemoAuthProvider";

/** On every page in demo mode: what this is, whose eyes you're seeing through, and the way out. */
export function DemoBanner() {
  const { role, switchRole, reset, exit } = useDemo();
  const [confirmReset, setConfirmReset] = useState(false);
  const [busy, setBusy] = useState<"reset" | "exit" | null>(null);

  return (
    <div
      role="region"
      aria-label="Demo mode"
      className="sticky top-0 z-30 mx-2 mt-2 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm"
    >
      <span className="flex items-center gap-2 font-medium">
        <FlaskConical className="h-4 w-4 text-warning" aria-hidden />
        Demo mode – changes aren't saved
      </span>

      <div className="flex items-center gap-2">
        <span className="text-muted-foreground" id="demo-role-label">
          View as
        </span>
        <ToggleGroup
          type="single"
          size="sm"
          variant="outline"
          value={role}
          aria-labelledby="demo-role-label"
          onValueChange={(value) => value && void switchRole(value as DemoRole)}
        >
          <ToggleGroupItem value="admin" aria-label={`Admin (${MEMBERS.admin.first_name})`}>
            Admin · {MEMBERS.admin.first_name}
          </ToggleGroupItem>
          <ToggleGroupItem value="staff" aria-label={`Staff (${MEMBERS.staff.first_name})`}>
            Staff · {MEMBERS.staff.first_name}
          </ToggleGroupItem>
        </ToggleGroup>
      </div>

      <div className="flex flex-1 flex-wrap items-center justify-end gap-2">
        <Button variant="outline" size="sm" onClick={() => setConfirmReset(true)} disabled={busy !== null}>
          <RotateCcw className="mr-1.5 h-3.5 w-3.5" aria-hidden />
          Reset
        </Button>
        <Button
          size="sm"
          onClick={() => {
            setBusy("exit");
            void exit("/auth?tab=signup");
          }}
          disabled={busy !== null}
        >
          <LogOut className="mr-1.5 h-3.5 w-3.5" aria-hidden />
          {busy === "exit" ? "Leaving…" : "Exit demo / Sign up"}
        </Button>
      </div>

      <ConfirmDialog
        open={confirmReset}
        onOpenChange={setConfirmReset}
        title="Reset the demo?"
        description="Everything you've added or changed is thrown away and Demo Shop starts again with fresh sample data."
        confirmLabel="Reset demo"
        busyLabel="Resetting…"
        busy={busy === "reset"}
        destructive
        onConfirm={() => {
          setBusy("reset");
          void reset();
        }}
      />
    </div>
  );
}
