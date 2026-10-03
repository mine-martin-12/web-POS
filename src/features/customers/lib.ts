import { looksLikePhone, normalizePhone } from "@/lib/phone";
import type { PickerMode } from "./types";

/**
 * How the customer picker interprets what's been typed:
 * - nothing → the 20 most recent customers
 * - digits that form a valid number → exact phone lookup
 * - 2+ characters with letters → name search
 * - anything else → "Keep typing…"
 */
export function pickerMode(query: string): { mode: PickerMode; term: string } {
  const q = query.trim();
  if (!q) return { mode: "recent", term: "" };
  if (looksLikePhone(q)) {
    const phone = normalizePhone(q);
    return phone ? { mode: "phone", term: phone } : { mode: "keep-typing", term: q };
  }
  if (q.length >= 2 && /\p{L}/u.test(q)) return { mode: "name", term: q };
  return { mode: "keep-typing", term: q };
}

export const PICKER_MODE_LABELS: Record<PickerMode, string> = {
  recent: "Recent customers",
  phone: "Phone lookup",
  name: "Name search",
  "keep-typing": "Keep typing…",
};
