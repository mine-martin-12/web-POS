/**
 * CSV that opens correctly in Excel: UTF-8 BOM, CRLF line endings, every field quoted
 * when needed, and cells that start with = + - @ (formula injection) neutralised.
 */
export type CsvValue = string | number | null | undefined;

export interface CsvColumn<T> {
  header: string;
  value: (row: T, index: number) => CsvValue;
}

const FORMULA_START = /^[=+\-@\t\r]/;

export function csvCell(value: CsvValue): string {
  if (value === null || value === undefined) return "";
  let text = typeof value === "number" ? (Number.isFinite(value) ? String(value) : "") : String(value);
  // A leading apostrophe stops spreadsheets treating text as a formula. Plain negative
  // numbers are left alone (they arrive as numbers, not strings).
  if (typeof value === "string" && FORMULA_START.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) || text !== text.trim() ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv<T>(rows: T[], columns: CsvColumn<T>[], preamble: CsvValue[][] = []): string {
  const lines = [
    ...preamble.map((line) => line.map(csvCell).join(",")),
    ...(preamble.length ? [""] : []),
    columns.map((c) => csvCell(c.header)).join(","),
    ...rows.map((row, i) => columns.map((c) => csvCell(c.value(row, i))).join(",")),
  ];
  return `\uFEFF${lines.join("\r\n")}\r\n`;
}

/** "sales-2026-10-03.csv" */
export function datedFilename(base: string, extension: string, date = new Date()): string {
  const stamp = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  return `${base}-${stamp}.${extension}`;
}

export function downloadFile(content: BlobPart, filename: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadCsv(csv: string, filename: string) {
  downloadFile(csv, filename, "text/csv;charset=utf-8");
}
