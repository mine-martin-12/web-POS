/** Default currency until the business has loaded. */
export const DEFAULT_CURRENCY = "KES";

const formatters = new Map<string, Intl.NumberFormat>();

function formatter(currency: string, compact: boolean): Intl.NumberFormat {
  const key = `${currency}:${compact}`;
  let f = formatters.get(key);
  if (!f) {
    f = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      ...(compact ? { notation: "compact", maximumFractionDigits: 1 } : {}),
    });
    formatters.set(key, f);
  }
  return f;
}

/** The single money formatter: "KES 1,250.00" (or "KES 1.3K" when compact). */
export function formatMoney(amount: number, currency = DEFAULT_CURRENCY, options: { compact?: boolean } = {}): string {
  const value = Number.isFinite(amount) ? amount : 0;
  try {
    return formatter(currency, !!options.compact).format(value);
  } catch {
    // Unknown currency code: fall back rather than crash the page.
    return formatter(DEFAULT_CURRENCY, !!options.compact).format(value);
  }
}
