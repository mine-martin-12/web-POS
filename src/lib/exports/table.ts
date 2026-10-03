/**
 * One description of tabular data, rendered three ways (PDF, CSV, XLSX), so every
 * export of a view contains exactly the same rows and totals as the screen.
 */
export type CellValue = string | number | null;

export interface ExportColumn<T> {
  header: string;
  value: (row: T, index: number) => CellValue;
  /** Money columns are right-aligned, formatted with 2 decimals and summed in TOTAL rows. */
  money?: boolean;
  /** Money column that shouldn't be summed (e.g. a unit price). */
  noTotal?: boolean;
  width?: number;
}

export interface ExportSheet<T = unknown> {
  name: string;
  columns: ExportColumn<T>[];
  rows: T[];
  /** Add a TOTAL row summing every money column. */
  total?: boolean;
}

/** A sheet of any row type, for lists that mix sheets (row types differ per sheet). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnySheet = ExportSheet<any>;

export interface ExportMeta {
  businessName: string;
  businessDetails?: string[];
  title: string;
  subtitle?: string;
  currency: string;
}

/** Column totals in cents (exact), keyed by column index; only money columns. */
export function columnTotals<T>(sheet: ExportSheet<T>): Map<number, number> {
  const totals = new Map<number, number>();
  sheet.columns.forEach((column, i) => {
    if (!column.money || column.noTotal) return;
    totals.set(
      i,
      sheet.rows.reduce((sum, row, r) => sum + Math.round(Number(column.value(row, r) ?? 0) * 100), 0),
    );
  });
  return totals;
}
