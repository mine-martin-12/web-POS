// Mirror of src/lib/smsTemplate.ts (the browser previews; this renders what is sent).
// supabase/tests/sms.test.ts runs both on the same inputs.
export type SmsValues = Partial<Record<"customer_name" | "amount_due" | "due_date" | "business_name", string>>;

export const SMS_MAX_LENGTH = 480;

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
