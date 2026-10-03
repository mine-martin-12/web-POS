// @vitest-environment node
import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import JSZip from "jszip";
import { buildCsvZip, buildWorkbook, sheetToCsv } from "./files";
import type { ExportMeta, ExportSheet } from "./table";

const meta: ExportMeta = { businessName: "Acme", title: "Tax export", subtitle: "Oct 2026", currency: "KES" };
const income: ExportSheet<{ name: string; amount: number }> = {
  name: "Income",
  total: true,
  columns: [
    { header: "Item", value: (r) => r.name },
    { header: "Amount", value: (r) => r.amount, money: true },
  ],
  rows: [
    { name: "Sugar, 2kg", amount: 100.1 },
    { name: "=evil()", amount: 0.2 },
  ],
};

describe("exports", () => {
  it("CSV has the header block, escaped rows and an exact TOTAL", () => {
    const csv = sheetToCsv(meta, income);
    expect(csv).toContain("Acme\r\nTax export,Oct 2026\r\nCurrency,KES");
    expect(csv).toContain('"Sugar, 2kg",100.10');
    expect(csv).toContain("'=evil(),0.20");
    expect(csv).toContain("TOTAL,100.30");
  });

  it("XLSX has one sheet per section with a SUM total matching the rows", async () => {
    const blob = await buildWorkbook(meta, [income, { ...income, name: "Expenses", rows: [] }]);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(Buffer.from(await blob.arrayBuffer()));
    expect(wb.worksheets.map((w) => w.name)).toEqual(["Income", "Expenses"]);
    const ws = wb.getWorksheet("Income")!;
    const totalRow = ws.getRow(ws.rowCount);
    expect(totalRow.getCell(1).value).toBe("TOTAL");
    const total = totalRow.getCell(2).value as { formula: string; result: number };
    expect(total.formula).toBe("SUM(B6:B7)");
    expect(total.result).toBeCloseTo(100.3, 2);
  });

  it("ZIP holds a dated CSV per sheet", async () => {
    const blob = await buildCsvZip(meta, [income], "2026-10-03");
    const zip = await JSZip.loadAsync(Buffer.from(await blob.arrayBuffer()));
    expect(Object.keys(zip.files)).toEqual(["income-2026-10-03.csv"]);
  });
});
