import React, { useState } from "react";
import { toast } from "sonner";
import { FileArchive, FileSpreadsheet } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";
import { Money } from "@/components/common/Money";
import { expensesSheet } from "@/features/expenses/lib";
import type { Expense } from "@/features/expenses/api";
import { salesSheet } from "@/features/sales/lib";
import type { SaleRow } from "@/features/sales/types";
import { DEFAULT_CURRENCY } from "@/lib/currency";
import { datedFilename, downloadFile } from "@/lib/csv";
import { getErrorMessage } from "@/lib/errors";
import { buildCsvZip, buildWorkbook } from "@/lib/exports/files";
import type { AnySheet, ExportMeta } from "@/lib/exports/table";
import { fromCents, summarizeSales, toCents } from "@/lib/finance";

interface TaxExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  periodLabel: string;
  sales: SaleRow[];
  expenses: Expense[];
  timeZone: string;
}

/** Accountant-ready export: Summary / Income / Expenses (with TOTAL rows), previewed first. */
export function TaxExportDialog({ open, onOpenChange, periodLabel, sales, expenses, timeZone }: TaxExportDialogProps) {
  const { business } = useAuth();
  const [busy, setBusy] = useState<"xlsx" | "zip" | null>(null);
  const t = summarizeSales(sales);
  const spent = expenses.reduce((s, e) => s + toCents(e.amount), 0);
  const lines: Array<[string, number]> = [
    ["Revenue (billed)", t.billed],
    ["Cost of goods sold", t.cost],
    ["Gross profit", t.profit],
    ["Expenses", spent],
    ["Net profit", t.profit - spent],
    ["Collected", t.collected],
    ["Outstanding", t.outstanding],
  ];

  const meta: ExportMeta = {
    businessName: business?.name ?? "Smart POS",
    businessDetails: [business?.address, business?.phone].filter((x): x is string => !!x),
    title: "Tax & accounting export",
    subtitle: periodLabel,
    currency: business?.currency ?? DEFAULT_CURRENCY,
  };
  const sheets = (): AnySheet[] => [
    {
      name: "Summary",
      rows: lines,
      columns: [
        { header: "Item", value: (l: [string, number]) => l[0], width: 24 },
        { header: "Amount", value: (l: [string, number]) => fromCents(l[1]), money: true },
      ],
    },
    { ...salesSheet(sales, timeZone, true), name: "Income" },
    expensesSheet(expenses),
  ];

  const download = async (kind: "xlsx" | "zip") => {
    setBusy(kind);
    try {
      const stamp = new Date().toISOString().slice(0, 10);
      if (kind === "xlsx") {
        downloadFile(await buildWorkbook(meta, sheets()), datedFilename("tax-export", "xlsx"), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      } else {
        downloadFile(await buildCsvZip(meta, sheets(), stamp), datedFilename("tax-export", "zip"), "application/zip");
      }
      toast.success("Export ready", { description: periodLabel });
    } catch (error) {
      toast.error("Export failed", { description: getErrorMessage(error) });
    } finally {
      setBusy(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Tax &amp; accounting export</DialogTitle>
          <DialogDescription>
            {periodLabel}: {sales.length} sales and {expenses.length} expenses. Check the summary, then download.
          </DialogDescription>
        </DialogHeader>
        <Table>
          <TableBody>
            {lines.map(([label, cents]) => (
              <TableRow key={label}>
                <TableCell className="py-2">{label}</TableCell>
                <TableCell className="py-2 text-right font-medium">
                  <Money cents={cents} className={cents < 0 ? "text-destructive" : undefined} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <p className="text-xs text-muted-foreground">
          The Excel file has Summary, Income and Expenses sheets with TOTAL rows; the ZIP has the same as three CSV files.
        </p>
        <DialogFooter className="flex-col gap-2 sm:flex-row-reverse sm:justify-start sm:gap-2">
          <Button onClick={() => download("xlsx")} disabled={!!busy} className="w-full sm:w-auto">
            <FileSpreadsheet className="mr-2 h-4 w-4" />
            {busy === "xlsx" ? "Exporting…" : "Download Excel"}
          </Button>
          <Button variant="outline" onClick={() => download("zip")} disabled={!!busy} className="w-full sm:w-auto">
            <FileArchive className="mr-2 h-4 w-4" />
            {busy === "zip" ? "Exporting…" : "ZIP of CSVs"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
