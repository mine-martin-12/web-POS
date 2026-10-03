/**
 * Print a receipt in a popup sized for 58mm thermal printers. `receiptHtml` must be markup
 * produced by React (renderToStaticMarkup), which escapes user text; never pass strings
 * built by hand.
 * Returns false when the popup was blocked.
 */
export const printReceipt = (receiptHtml: string): boolean => {
  const printWindow = window.open("", "_blank", "width=400,height=600");
  if (!printWindow) return false;

  printWindow.document.write(`<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Receipt</title>
    <style>
      body { margin: 0; padding: 16px; font-family: 'Courier New', monospace; font-size: 12px; line-height: 1.35; color: #000; }
      .receipt-container { max-width: 300px; margin: 0 auto; }
      h2 { font-size: 15px; margin: 0 0 4px; }
      p { margin: 0; }
      .center { text-align: center; }
      .section { border-bottom: 1px dashed #000; padding: 6px 0; }
      .row { display: flex; justify-content: space-between; gap: 8px; }
      .bold { font-weight: bold; }
      .muted { color: #444; font-size: 11px; }
      @media print {
        body { padding: 0; }
        .receipt-container { width: 58mm; max-width: none; margin: 0; padding: 4mm; }
        @page { size: 58mm auto; margin: 0; }
      }
    </style>
  </head>
  <body>
    ${receiptHtml}
    <script>
      window.onload = function () { window.print(); window.onafterprint = function () { window.close(); }; };
    </script>
  </body>
</html>`);
  printWindow.document.close();
  return true;
};
