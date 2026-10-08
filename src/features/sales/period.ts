import { format } from "date-fns";
import { addDaysToKey, daysInMonth, parseDayKey } from "@/lib/dates";

export type PeriodKind = "month" | "today" | "7d" | "30d" | "90d" | "custom";

export interface Period {
  kind: PeriodKind;
  from: string;
  to: string;
  /** "YYYY-MM" when browsing a month. */
  month: string | null;
  label: string;
}

export const PRESETS: Array<{ kind: Exclude<PeriodKind, "month" | "custom">; label: string; days: number }> = [
  { kind: "today", label: "Today", days: 1 },
  { kind: "7d", label: "Last 7 days", days: 7 },
  { kind: "30d", label: "Last 30 days", days: 30 },
  { kind: "90d", label: "Last 90 days", days: 90 },
];

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const MONTH = /^\d{4}-\d{2}$/;

export const monthLabel = (month: string) => format(parseDayKey(`${month}-01`), "MMMM yyyy");

export interface Comparison {
  from: string;
  to: string;
  /** e.g. "vs 1–8 Sep", "vs September", "vs previous 30 days". */
  label: string;
}

/** "1–8 Sep", or "29 Aug – 7 Sep" across months, or "8 Sep" for one day. */
export function rangeLabel(from: string, to: string): string {
  const a = parseDayKey(from);
  const b = parseDayKey(to);
  if (from === to) return format(a, "d MMM");
  if (from.slice(0, 7) === to.slice(0, 7)) return `${format(a, "d")}–${format(b, "d MMM")}`;
  return `${format(a, "d MMM")} – ${format(b, "d MMM")}`;
}

function previousMonth(month: string): string {
  const [year, m] = month.split("-").map(Number);
  return m === 1 ? `${year - 1}-12` : `${year}-${String(m - 1).padStart(2, "0")}`;
}

/**
 * What a period is fairly compared with:
 *  - a month in progress: the same days of the previous month (1–8 Oct vs 1–8 Sep);
 *  - a finished month: the whole previous month;
 *  - "Today": yesterday; the last N days: the N days before them;
 *  - a custom range: the same number of days just before it.
 */
export function comparisonPeriod(period: Period, today: string): Comparison {
  if (period.kind === "month" && period.month) {
    const prev = previousMonth(period.month);
    const inProgress = period.from <= today && today <= period.to;
    if (inProgress) {
      const day = Math.min(Number(today.slice(8, 10)), daysInMonth(prev));
      const to = `${prev}-${String(day).padStart(2, "0")}`;
      return { from: `${prev}-01`, to, label: `vs ${rangeLabel(`${prev}-01`, to)}` };
    }
    return {
      from: `${prev}-01`,
      to: `${prev}-${String(daysInMonth(prev)).padStart(2, "0")}`,
      label: `vs ${format(parseDayKey(`${prev}-01`), prev.slice(0, 4) === period.month.slice(0, 4) ? "MMMM" : "MMMM yyyy")}`,
    };
  }
  const days = Math.round((parseDayKey(period.to).getTime() - parseDayKey(period.from).getTime()) / 86_400_000) + 1;
  const from = addDaysToKey(period.from, -days);
  const to = addDaysToKey(period.from, -1);
  if (period.kind === "today") return { from, to, label: "vs yesterday" };
  if (period.kind === "custom") return { from, to, label: `vs ${rangeLabel(from, to)}` };
  return { from, to, label: `vs previous ${days} days` };
}

/** The period described by the URL (?period=&month=&from=&to=), defaulting to this month. */
export function resolvePeriod(
  params: { period?: string | null; month?: string | null; from?: string | null; to?: string | null },
  today: string,
): Period {
  const preset = PRESETS.find((p) => p.kind === params.period);
  if (preset) {
    return { kind: preset.kind, from: addDaysToKey(today, -(preset.days - 1)), to: today, month: null, label: preset.label };
  }
  if (params.period === "custom" && params.from && params.to && DAY.test(params.from) && DAY.test(params.to)) {
    const [from, to] = params.from <= params.to ? [params.from, params.to] : [params.to, params.from];
    return {
      kind: "custom",
      from,
      to,
      month: null,
      label: `${format(parseDayKey(from), "d MMM")} – ${format(parseDayKey(to), "d MMM yyyy")}`,
    };
  }
  const month = params.month && MONTH.test(params.month) ? params.month : today.slice(0, 7);
  return {
    kind: "month",
    from: `${month}-01`,
    to: `${month}-${String(daysInMonth(month)).padStart(2, "0")}`,
    month,
    label: monthLabel(month),
  };
}
