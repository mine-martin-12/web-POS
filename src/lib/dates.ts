/**
 * Calendar helpers that never let a UTC conversion shift a sale onto the wrong day.
 *
 * Day and month keys are always built from a date STRING in the business time zone
 * ("2026-10-03"), never from `new Date(...).getMonth()` in whatever zone the browser is in.
 */

export const DEFAULT_TIME_ZONE = "Africa/Nairobi";

const dayFormatters = new Map<string, Intl.DateTimeFormat>();

function dayFormatter(timeZone: string): Intl.DateTimeFormat {
  let f = dayFormatters.get(timeZone);
  if (!f) {
    // en-CA formats as YYYY-MM-DD.
    f = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" });
    dayFormatters.set(timeZone, f);
  }
  return f;
}

/** "YYYY-MM-DD" for a timestamp as seen in the business time zone. Plain date strings
 *  ("2026-10-05", e.g. credits.due_date) are returned unchanged. */
export function dayKey(value: string | Date, timeZone = DEFAULT_TIME_ZONE): string {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = typeof value === "string" ? new Date(value) : value;
  try {
    return dayFormatter(timeZone).format(date);
  } catch {
    return dayFormatter(DEFAULT_TIME_ZONE).format(date);
  }
}

/** "YYYY-MM" for a timestamp or date string, in the business time zone. */
export function monthKey(value: string | Date, timeZone = DEFAULT_TIME_ZONE): string {
  return dayKey(value, timeZone).slice(0, 7);
}

/** Today's "YYYY-MM-DD" in the business time zone. */
export function todayKey(timeZone = DEFAULT_TIME_ZONE, now = new Date()): string {
  return dayKey(now, timeZone);
}

/** Parse "YYYY-MM-DD" as a LOCAL calendar date (no UTC shift), for display with date-fns. */
export function parseDayKey(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

/** Add whole days to a "YYYY-MM-DD" key. */
export function addDaysToKey(key: string, days: number): string {
  const date = parseDayKey(key);
  date.setDate(date.getDate() + days);
  return formatLocalDayKey(date);
}

/** "YYYY-MM-DD" for a local Date (from a date picker). Never use toISOString() for this. */
export function formatLocalDayKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Inclusive number of days between two day keys ("2026-10-01".."2026-10-07" = 7). */
export function daysInclusive(fromKey: string, toKey: string): number {
  const ms = parseDayKey(toKey).getTime() - parseDayKey(fromKey).getTime();
  return Math.round(ms / 86_400_000) + 1;
}

/** Every day key from `fromKey` to `toKey`, inclusive. */
export function eachDayKey(fromKey: string, toKey: string): string[] {
  const days: string[] = [];
  for (let key = fromKey; key <= toKey; key = addDaysToKey(key, 1)) days.push(key);
  return days;
}

/** Number of days in the month of a "YYYY-MM" key. */
export function daysInMonth(month: string): number {
  const [y, m] = month.split("-").map(Number);
  return new Date(y, m, 0).getDate();
}

/** UTC instant at which a business-local calendar day starts. Used to filter timestamptz
 *  columns: `sale_date >= startOfDayUtc(from)` and `< startOfDayUtc(to + 1 day)`. */
export function startOfDayUtc(key: string, timeZone = DEFAULT_TIME_ZONE): string {
  // Find the zone's offset at local midnight by comparing the wall-clock reading of the
  // naive UTC instant with the intended wall-clock time; repeat once to settle DST edges.
  const [y, m, d] = key.split("-").map(Number);
  let guess = Date.UTC(y, m - 1, d);
  for (let i = 0; i < 2; i++) {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }).formatToParts(new Date(guess));
    const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
    const wall = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
    guess += Date.UTC(y, m - 1, d) - wall;
  }
  return new Date(guess).toISOString();
}
