/**
 * Phone numbers are stored and compared in one canonical form: "+" and 8–15 digits.
 * Mirrors public.normalize_phone() in the database; supabase/tests/customers.test.ts
 * runs both on the same inputs so they can't drift apart.
 */
export const DEFAULT_COUNTRY_CODE = "254"; // Kenya

export function normalizePhone(raw: string | null | undefined, defaultCountry = DEFAULT_COUNTRY_CODE): string | null {
  const input = (raw ?? "").trim();
  let digits = input.replace(/\D/g, "");
  if (!digits) return null;

  if (input.startsWith("+")) {
    // already international
  } else if (digits.startsWith("00")) {
    digits = digits.slice(2);
  } else if (digits.startsWith(defaultCountry) && digits.length >= defaultCountry.length + 8) {
    // 2547…
  } else if (digits.startsWith("0")) {
    digits = defaultCountry + digits.slice(1);
  } else if (digits.length === 9) {
    digits = defaultCountry + digits; // 712345678
  }

  return /^[1-9]\d{7,14}$/.test(digits) ? `+${digits}` : null;
}

/** "+254712345690" → "+2547123***90". Display only: the server already masks for non-admins. */
export function maskPhone(phone: string | null | undefined): string {
  if (!phone) return "";
  if (phone.includes("*")) return phone; // already masked by the server
  if (phone.length <= 6) return "*".repeat(phone.length);
  return `${phone.slice(0, -5)}***${phone.slice(-2)}`;
}

/** Does this look like someone typing a phone number (digits, spaces, +, -, brackets)? */
export function looksLikePhone(query: string): boolean {
  return /^[+\d\s()-]+$/.test(query.trim()) && /\d/.test(query);
}

/** "+254712345678" → "+254 712 345 678" for readability. */
export function formatPhone(phone: string | null | undefined): string {
  if (!phone) return "";
  if (phone.includes("*")) return phone;
  const m = /^\+254(\d{3})(\d{3})(\d{3})$/.exec(phone);
  return m ? `+254 ${m[1]} ${m[2]} ${m[3]}` : phone;
}
