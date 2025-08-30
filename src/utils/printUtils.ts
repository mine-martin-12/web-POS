export const printReceipt = (receiptHtml: string) => {
  // Create a new window for printing
  const printWindow = window.open('', '_blank', 'width=400,height=600');
  
  if (!printWindow) {
    alert('Please allow popups to print receipts');
    return;
  }

  // Create the print document
  printWindow.document.write(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>Receipt</title>
        <style>
          body {
            margin: 0;
            padding: 20px;
            font-family: 'Courier New', monospace;
            font-size: 12px;
            line-height: 1.2;
          }
          
          .receipt-container {
            width: 100%;
            max-width: 300px;
            margin: 0 auto;
          }
          
          @media print {
            body {
              padding: 0;
            }
            
            .receipt-container {
              width: 58mm; /* Standard thermal printer width */
              max-width: none;
              margin: 0;
              padding: 5mm;
            }
            
            /* Hide browser print elements */
            @page {
              margin: 0;
              size: 58mm auto;
            }
          }
          
          /* Copy styles from the design system */
          .border-b { border-bottom: 1px solid #e5e7eb; }
          .pb-2 { padding-bottom: 0.5rem; }
          .mb-2 { margin-bottom: 0.5rem; }
          .mb-1 { margin-bottom: 0.25rem; }
          .mt-1 { margin-top: 0.25rem; }
          .p-4 { padding: 1rem; }
          .text-center { text-align: center; }
          .text-right { text-align: right; }
          .text-xs { font-size: 0.75rem; }
          .text-sm { font-size: 0.875rem; }
          .text-base { font-size: 1rem; }
          .font-bold { font-weight: bold; }
          .font-semibold { font-weight: 600; }
          .font-mono { font-family: 'Courier New', monospace; }
          .flex { display: flex; }
          .justify-between { justify-content: space-between; }
          .flex-1 { flex: 1; }
          .capitalize { text-transform: capitalize; }
        </style>
      </head>
      <body>
        ${receiptHtml}
        <script>
          window.onload = function() {
            window.print();
            window.onafterprint = function() {
              window.close();
            };
          };
        </script>
      </body>
    </html>
  `);
  
  printWindow.document.close();
};

export const generateReceiptHtml = (saleData: any, businessInfo?: any) => {
  // This function would generate the receipt HTML
  // For now, we'll use the React component's rendered output
  return '';
};