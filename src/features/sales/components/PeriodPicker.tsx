import React from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DateField } from "@/components/common/DateField";
import { PRESETS, type Period } from "../period";

interface PeriodPickerProps {
  period: Period;
  today: string;
  onChange: (updates: Record<string, string | null>) => void;
}

/** Date presets (Today, Last 7/30/90 days), the browsed month, or a custom range. */
export function PeriodPicker({ period, today, onChange }: PeriodPickerProps) {
  const value = period.kind === "month" ? "month" : period.kind;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select
        value={value}
        onValueChange={(v) => {
          if (v === "month") onChange({ period: null, from: null, to: null });
          else if (v === "custom") onChange({ period: "custom", month: null, from: period.from, to: period.to });
          else onChange({ period: v, month: null, from: null, to: null });
        }}
      >
        <SelectTrigger className="h-9 w-[11rem]" aria-label="Date range">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="month">{period.kind === "month" ? period.label : "By month"}</SelectItem>
          {PRESETS.map((p) => (
            <SelectItem key={p.kind} value={p.kind}>
              {p.label}
            </SelectItem>
          ))}
          <SelectItem value="custom">Custom range…</SelectItem>
        </SelectContent>
      </Select>
      {period.kind === "custom" && (
        <div className="flex items-center gap-2">
          <div className="w-40">
            <DateField value={period.from} max={period.to} onChange={(v) => onChange({ period: "custom", from: v, to: period.to })} />
          </div>
          <span className="text-muted-foreground">to</span>
          <div className="w-40">
            <DateField value={period.to} min={period.from} max={today} onChange={(v) => onChange({ period: "custom", from: period.from, to: v })} />
          </div>
        </div>
      )}
    </div>
  );
}
