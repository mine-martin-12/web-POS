import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { OfficialDocument } from "./OfficialDocument";
import type { AnySheet, ExportMeta } from "./table";

const STYLES = `
  @page { size: A4; margin: 16mm 14mm; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; color: #111; font-size: 11px; }
  .doc { max-width: 190mm; margin: 0 auto; padding: 12px; }
  header { display: flex; justify-content: space-between; gap: 16px; border-bottom: 3px solid #2563eb; padding-bottom: 10px; margin-bottom: 14px; }
  h1 { font-size: 18px; margin: 0 0 4px; } h2 { font-size: 15px; margin: 0 0 4px; color: #2563eb; } h3 { font-size: 13px; margin: 18px 0 6px; }
  p { margin: 0 0 2px; } .muted { color: #555; } .right { text-align: right; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 8px; page-break-inside: auto; }
  th, td { padding: 4px 6px; border-bottom: 1px solid #e5e7eb; text-align: left; vertical-align: top; }
  thead th { background: #f3f4f6; font-weight: 600; }
  tfoot td { font-weight: 700; border-top: 2px solid #111; }
  tr { page-break-inside: avoid; }
  .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  table.summary { width: 60%; } table.summary th { font-weight: 500; background: none; }
  footer { margin-top: 24px; padding-top: 8px; border-top: 1px solid #e5e7eb; color: #555; font-size: 10px; text-align: center; }
`;

/**
 * Opens the branded document in a print window; choose "Save as PDF" to get the PDF.
 * Returns false if the popup was blocked.
 */
export function printOfficialDocument(meta: ExportMeta, sheets: AnySheet[], summary?: Array<[string, string]>): boolean {
  const body = renderToStaticMarkup(createElement(OfficialDocument, { meta, sheets, summary }));
  const win = window.open("", "_blank", "width=900,height=1000");
  if (!win) return false;
  // The title is user data too: escape it for the <title> tag.
  const title = `${meta.title} - ${meta.businessName}`.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
  win.document.write(
    `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title><style>${STYLES}</style></head><body>${body}<script>window.onload=function(){window.print();}</script></body></html>`,
  );
  win.document.close();
  return true;
}
