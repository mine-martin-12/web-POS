/**
 * Page numbers to show around the current page, with "…" gaps:
 * pageWindow(5, 20) → [0, "…", 3, 4, 5, 6, 7, "…", 19]   (0-based pages)
 */
export function pageWindow(current: number, totalPages: number, radius = 2): Array<number | "…"> {
  if (totalPages <= 1) return [0];
  const pages = new Set<number>([0, totalPages - 1]);
  for (let p = current - radius; p <= current + radius; p++) {
    if (p >= 0 && p < totalPages) pages.add(p);
  }
  const sorted = [...pages].sort((a, b) => a - b);
  const result: Array<number | "…"> = [];
  sorted.forEach((page, i) => {
    if (i > 0 && page - sorted[i - 1] > 1) result.push("…");
    result.push(page);
  });
  return result;
}

/** Clamp a page index into range for the given row count. */
export function clampPage(page: number, rowCount: number, pageSize: number): number {
  const last = Math.max(0, Math.ceil(rowCount / pageSize) - 1);
  return Math.min(Math.max(0, page), last);
}
