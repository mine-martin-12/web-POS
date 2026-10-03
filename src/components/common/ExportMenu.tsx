import React, { useState } from "react";
import { toast } from "sonner";
import { ChevronDown, Download, FileSpreadsheet, FileText, Sheet } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DEFAULT_CURRENCY } from "@/lib/currency";
import { datedFilename, downloadCsv, downloadFile } from "@/lib/csv";
import { getErrorMessage } from "@/lib/errors";
import { buildWorkbook, sheetToCsv } from "@/lib/exports/files";
import { printOfficialDocument } from "@/lib/exports/pdf";
import type { AnySheet, ExportMeta } from "@/lib/exports/table";
import { cn } from "@/lib/utils";

interface ExportMenuProps {
  /** e.g. "sales" → sales-2026-10-03.csv */
  filename: string;
  title: string;
  subtitle?: string;
  /** Built on demand from exactly the rows on screen. */
  sheets: () => AnySheet[];
  summary?: () => Array<[string, string]>;
  disabled?: boolean;
  className?: string;
}

/** One export button for every list: PDF (official) / CSV / XLSX. */
export function ExportMenu({ filename, title, subtitle, sheets, summary, disabled, className }: ExportMenuProps) {
  const { business } = useAuth();
  const [busy, setBusy] = useState(false);

  const meta = (): ExportMeta => ({
    businessName: business?.name ?? "Smart POS",
    businessDetails: [business?.address, business?.phone, business?.email].filter((x): x is string => !!x),
    title,
    subtitle,
    currency: business?.currency ?? DEFAULT_CURRENCY,
  });

  const run = async (kind: "pdf" | "csv" | "xlsx") => {
    setBusy(true);
    try {
      const data = sheets();
      if (kind === "pdf") {
        if (!printOfficialDocument(meta(), data, summary?.())) {
          toast.error("Couldn't open the print window", { description: "Allow pop-ups for this site, then choose Save as PDF." });
        }
      } else if (kind === "csv") {
        downloadCsv(sheetToCsv(meta(), data[0]), datedFilename(filename, "csv"));
        toast.success("CSV ready", { description: `${data[0].rows.length} rows` });
      } else {
        downloadFile(await buildWorkbook(meta(), data), datedFilename(filename, "xlsx"), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        toast.success("Excel file ready");
      }
    } catch (error) {
      toast.error("Export failed", { description: getErrorMessage(error) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" disabled={disabled || busy} className={cn("w-full sm:w-auto", className)}>
          <Download className="mr-2 h-4 w-4" />
          {busy ? "Exporting…" : "Export"}
          <ChevronDown className="ml-2 h-4 w-4 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuLabel className="text-xs text-muted-foreground">Export what's on screen</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => void run("pdf")}>
          <FileText className="mr-2 h-4 w-4" /> PDF (official)
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => void run("csv")}>
          <Sheet className="mr-2 h-4 w-4" /> CSV
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => void run("xlsx")}>
          <FileSpreadsheet className="mr-2 h-4 w-4" /> Excel (XLSX)
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
