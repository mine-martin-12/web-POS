import React from "react";
import { toast } from "sonner";
import { Bell } from "lucide-react";
import { useSecurity } from "@/hooks/useSecurity";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { getErrorMessage } from "@/lib/errors";
import { DEFAULT_PREFERENCES, type NotificationPreferences } from "../api";
import { usePreferences, useSavePreferences } from "../hooks";

const OPTIONS: Array<{ key: keyof NotificationPreferences; label: string; description: string; adminOnly?: boolean }> = [
  { key: "change_requests", label: "Change requests", description: "New requests to review, and decisions on yours." },
  { key: "overdue_credits", label: "Overdue credits", description: "When a customer's balance passes its due date.", adminOnly: true },
  { key: "low_stock", label: "Low stock", description: "When a product runs low or out.", adminOnly: true },
  { key: "team", label: "Team", description: "When an invited member joins.", adminOnly: true },
];

/** Notification settings that actually save (each switch saves immediately). */
export function NotificationPreferencesCard() {
  const { isAdmin } = useSecurity();
  const prefs = usePreferences();
  const save = useSavePreferences();
  const current = prefs.data ?? DEFAULT_PREFERENCES;

  const toggle = (key: keyof NotificationPreferences, value: boolean) =>
    save.mutate(
      { ...current, [key]: value },
      {
        onSuccess: () => toast.success("Notification settings saved"),
        onError: (error) => toast.error("Couldn't save", { description: getErrorMessage(error) }),
      },
    );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bell className="h-5 w-5" />
          Notifications
        </CardTitle>
        <CardDescription>Choose what shows up under the bell.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {prefs.isLoading ? (
          <Skeleton className="h-32 w-full" />
        ) : (
          OPTIONS.filter((o) => isAdmin || !o.adminOnly).map((o) => (
            <div key={o.key} className="flex items-start justify-between gap-4">
              <div>
                <Label htmlFor={`pref-${o.key}`}>{o.label}</Label>
                <p className="text-sm text-muted-foreground">{o.description}</p>
              </div>
              <Switch id={`pref-${o.key}`} checked={current[o.key]} onCheckedChange={(v) => toggle(o.key, v)} disabled={save.isPending} />
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
