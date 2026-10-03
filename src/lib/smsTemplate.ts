/**
 * SMS templates. Mirrored in supabase/functions/_shared/template.ts (the server renders
 * what is actually sent); a test runs both on the same inputs.
 */
export const SMS_PLACEHOLDERS = ["customer_name", "amount_due", "due_date", "business_name"] as const;
export type SmsPlaceholder = (typeof SMS_PLACEHOLDERS)[number];
export type SmsValues = Partial<Record<SmsPlaceholder, string>>;

/** Hard limit: three SMS segments. */
export const SMS_MAX_LENGTH = 480;
export const SMS_SEGMENT = 160;

/**
 * Fill {placeholders}. Unknown or empty tokens are dropped (never sent literally), then
 * spacing is tidied: no doubled spaces, no space before punctuation, no dangling
 * separators left behind by a dropped value.
 */
export function renderTemplate(template: string, values: SmsValues): string {
  return template
    .replace(/\{(\w+)\}/g, (_m, key: string) => (values as Record<string, string | undefined>)[key]?.trim() ?? "")
    .replace(/[ \t]+/g, " ")
    .replace(/ +([,.!?;:])/g, "$1")
    .replace(/([,;:])(?=[,.!?;:])/g, "")
    .replace(/^[\s,;:]+/, "")
    .replace(/ *\n */g, "\n")
    .trim();
}

export function segmentCount(text: string): number {
  return Math.max(1, Math.ceil(text.length / SMS_SEGMENT));
}
