import { toCsv } from "@/lib/csv";
import { columnTotals, type AnySheet, type ExportMeta, type ExportSheet } from "./table";

/** CSV for one sheet: business header block, then the rows, then a TOTAL row if asked. */
export function sheetToCsv<T>(meta: ExportMeta, sheet: ExportSheet<T>): string {
  const totals = sheet.total ? columnTotals(sheet) : null;
  const rows: Array<{ kind: "row"; row: T; i: number } | { kind: "total" }> = sheet.rows.map((row, i) => ({ kind: "row" as const, row, i }));
  if (totals) rows.push({ kind: "total" });
  return toCsv(
    rows,
    sheet.columns.map((c, ci) => ({
      header: c.header,
      value: (r) => {
        if (r.kind === "total") return ci === 0 ? "TOTAL" : totals!.has(ci) ? (totals!.get(ci)! / 100).toFixed(2) : "";
        const v = c.value(r.row, r.i);
        return c.money && v !== null && v !== "" ? Number(v).toFixed(2) : v;
      },
    })),
    [[meta.businessName], [meta.title, meta.subtitle ?? ""], ["Currency", meta.currency]],
  );
}

/** Multi-sheet workbook. exceljs is loaded only when someone exports. */
export async function buildWorkbook(meta: ExportMeta, sheets: AnySheet[]): Promise<Blob> {
  const ExcelJS = (await import("exceljs")).default;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Smart POS";
  workbook.created = new Date();
  const moneyFormat = `#,##0.00`;

  for (const sheet of sheets) {
    const ws = workbook.addWorksheet(sheet.name.slice(0, 31));
    ws.addRow([meta.businessName]).font = { bold: true, size: 14 };
    ws.addRow([meta.title, meta.subtitle ?? ""]);
    ws.addRow([`Amounts in ${meta.currency}`]).font = { italic: true, color: { argb: "FF666666" } };
    ws.addRow([]);
    const header = ws.addRow(sheet.columns.map((c) => c.header));
    header.font = { bold: true };
    header.eachCell((cell) => {
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE5EDFB" } };
    });
    const firstDataRow = ws.rowCount + 1;
    sheet.rows.forEach((row, r) => {
      ws.addRow(
        sheet.columns.map((c) => {
          const v = c.value(row, r);
          return c.money && v !== null && v !== "" ? Number(v) : v;
        }),
      );
    });
    const lastDataRow = ws.rowCount;
    if (sheet.total) {
      const totals = columnTotals(sheet);
      const totalRow = ws.addRow(
        sheet.columns.map((c, i) => (i === 0 ? "TOTAL" : totals.has(i) ? totals.get(i)! / 100 : null)),
      );
      totalRow.font = { bold: true };
      // Keep live SUM formulas so edits in Excel stay consistent; the cached result is ours.
      sheet.columns.forEach((c, i) => {
        if (!c.money || c.noTotal || sheet.rows.length === 0) return;
        const col = ws.getColumn(i + 1).letter;
        totalRow.getCell(i + 1).value = {
          formula: `SUM(${col}${firstDataRow}:${col}${lastDataRow})`,
          result: totals.get(i)! / 100,
        };
      });
    }
    sheet.columns.forEach((c, i) => {
      const column = ws.getColumn(i + 1);
      column.width = c.width ?? Math.max(12, c.header.length + 2);
      if (c.money) column.numFmt = moneyFormat;
    });
    ws.views = [{ state: "frozen", ySplit: header.number }];
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

/** ZIP of one CSV per sheet. jszip is loaded only when someone exports. */
export async function buildCsvZip(meta: ExportMeta, sheets: AnySheet[], stamp: string): Promise<Blob> {
  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();
  for (const sheet of sheets) {
    const name = sheet.name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    zip.file(`${name}-${stamp}.csv`, sheetToCsv(meta, sheet));
  }
  return zip.generateAsync({ type: "blob" });
}
