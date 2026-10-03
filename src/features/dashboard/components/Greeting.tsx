import React, { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { DEFAULT_TIME_ZONE } from "@/lib/dates";
import { greetingFor } from "../analytics";

const TICK_MS = 15_000;

/** "Good morning, Jane. 4 sales came in today." with a live clock in the business time zone. */
export function Greeting({ todayCount, loading }: { todayCount: number; loading: boolean }) {
  const { profile, business } = useAuth();
  const timeZone = business?.timezone ?? DEFAULT_TIME_ZONE;
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), TICK_MS);
    return () => window.clearInterval(timer);
  }, []);

  const parts = new Intl.DateTimeFormat("en-GB", { timeZone, hour: "numeric", hourCycle: "h23" }).formatToParts(now);
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? 9);
  const time = new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit" }).format(now);
  const date = new Intl.DateTimeFormat("en-GB", { timeZone, weekday: "long", day: "numeric", month: "long" }).format(now);

  return (
    <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-bold text-foreground sm:text-3xl">
          {greetingFor(hour)}, {profile?.first_name}.
        </h1>
        <p className="text-muted-foreground" aria-live="polite">
          {loading
            ? "Checking today's sales…"
            : todayCount === 0
              ? "No sales yet today."
              : `${todayCount} ${todayCount === 1 ? "sale" : "sales"} came in today.`}
        </p>
      </div>
      <p className="text-sm text-muted-foreground">
        <time className="text-lg font-semibold tabular-nums text-foreground">{time}</time> · {date}
      </p>
    </div>
  );
}
