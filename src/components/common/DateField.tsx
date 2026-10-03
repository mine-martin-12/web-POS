import React, { useState } from "react";
import { format } from "date-fns";
import { CalendarIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatLocalDayKey, parseDayKey } from "@/lib/dates";
import { cn } from "@/lib/utils";

interface DateFieldProps {
  /** "YYYY-MM-DD" or "" */
  value: string;
  onChange: (value: string) => void;
  min?: string;
  max?: string;
  placeholder?: string;
  invalid?: boolean;
  id?: string;
}

/** A calendar date picker that works in day keys, so no UTC conversion can shift the day. */
export function DateField({ value, onChange, min, max, placeholder = "Pick a date", invalid, id }: DateFieldProps) {
  const [open, setOpen] = useState(false);
  const selected = value ? parseDayKey(value) : undefined;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          aria-invalid={invalid}
          className={cn(
            "w-full justify-start text-left font-normal",
            !value && "text-muted-foreground",
            invalid && "border-destructive",
          )}
        >
          <CalendarIcon className="mr-2 h-5 w-5" aria-hidden />
          {selected ? format(selected, "EEE, d MMM yyyy") : placeholder}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={selected}
          defaultMonth={selected}
          onSelect={(date) => {
            if (!date) return;
            onChange(formatLocalDayKey(date));
            setOpen(false);
          }}
          disabled={(date) => {
            const key = formatLocalDayKey(date);
            return (!!min && key < min) || (!!max && key > max);
          }}
          initialFocus
        />
      </PopoverContent>
    </Popover>
  );
}
