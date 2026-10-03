import React, { useRef } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { renderTemplate, segmentCount, SMS_MAX_LENGTH, SMS_PLACEHOLDERS, type SmsValues } from "@/lib/smsTemplate";
import { cn } from "@/lib/utils";
import type { SmsTemplate } from "../api";

const WARN_AT = 0.9;

interface Props {
  value: string;
  onChange: (value: string) => void;
  templates: SmsTemplate[];
  sample: SmsValues;
  id?: string;
}

/** Message box with template picker, placeholder chips, a counter that turns red at 90%
 *  of the limit, and a preview with a sample customer. */
export function MessageComposer({ value, onChange, templates, sample, id = "sms-message" }: Props) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const preview = renderTemplate(value, sample);
  const near = value.length >= SMS_MAX_LENGTH * WARN_AT;

  const insert = (token: string) => {
    const el = ref.current;
    const text = `{${token}}`;
    if (!el) return onChange(value + text);
    const start = el.selectionStart ?? value.length;
    const end = el.selectionEnd ?? value.length;
    onChange(value.slice(0, start) + text + value.slice(end));
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + text.length, start + text.length);
    });
  };

  return (
    <div className="space-y-3">
      {templates.length > 0 && (
        <Select onValueChange={(tid) => onChange(templates.find((t) => t.id === tid)?.body ?? value)}>
          <SelectTrigger className="w-full sm:w-64" aria-label="Use a template">
            <SelectValue placeholder="Start from a template…" />
          </SelectTrigger>
          <SelectContent>
            {templates.map((t) => (
              <SelectItem key={t.id} value={t.id}>
                {t.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label htmlFor={id}>Message</Label>
          <span className={cn("text-xs tabular-nums", near ? "font-semibold text-destructive" : "text-muted-foreground")} aria-live="polite">
            {value.length}/{SMS_MAX_LENGTH} · {segmentCount(preview)} SMS
          </span>
        </div>
        <Textarea
          ref={ref}
          id={id}
          rows={4}
          maxLength={SMS_MAX_LENGTH}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Hi {customer_name}, …"
          className={cn(near && "border-destructive")}
        />
        <div className="flex flex-wrap gap-1.5">
          {SMS_PLACEHOLDERS.map((p) => (
            <Button key={p} type="button" variant="outline" size="sm" className="h-7 font-mono text-xs" onClick={() => insert(p)}>
              {`{${p}}`}
            </Button>
          ))}
        </div>
      </div>
      {value.trim() && (
        <div className="rounded-lg border bg-muted/40 p-3 text-sm">
          <Badge variant="secondary" className="mb-1.5">
            Preview
          </Badge>
          <p className="whitespace-pre-wrap">{preview || <span className="text-muted-foreground">(empty)</span>}</p>
        </div>
      )}
    </div>
  );
}
