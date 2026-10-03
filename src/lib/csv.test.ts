import { describe, expect, it } from "vitest";
import { csvCell, datedFilename, toCsv } from "./csv";

describe("csvCell", () => {
  it("quotes commas, quotes and newlines", () => {
    expect(csvCell('Sugar, 2kg "bag"')).toBe('"Sugar, 2kg ""bag"""');
    expect(csvCell("line1\nline2")).toBe('"line1\nline2"');
    expect(csvCell("plain")).toBe("plain");
  });

  it("neutralises formula injection in text but keeps numbers", () => {
    expect(csvCell("=HYPERLINK(1)")).toBe("'=HYPERLINK(1)");
    expect(csvCell("+254712")).toBe("'+254712");
    expect(csvCell(-5)).toBe("-5");
  });

  it("renders empty values as empty cells", () => {
    expect(csvCell(null)).toBe("");
    expect(csvCell(NaN)).toBe("");
  });
});

describe("toCsv", () => {
  it("starts with a BOM, includes the preamble and uses CRLF", () => {
    const csv = toCsv([{ a: 1 }], [{ header: "A", value: (r) => r.a }], [["Acme Ltd"]]);
    expect(csv).toBe("\uFEFFAcme Ltd\r\n\r\nA\r\n1\r\n");
  });
});

describe("datedFilename", () => {
  it("stamps the local date", () => {
    expect(datedFilename("sales", "csv", new Date(2026, 9, 3))).toBe("sales-2026-10-03.csv");
  });
});
