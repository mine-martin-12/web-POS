import React from 'react';

interface Sale {
  id: string;
  product_id: string;
  quantity: number;
  selling_price: number;
  payment_method: "cash" | "mpesa" | "bank" | "credit";
  total_price?: number;
  sale_date: string;
  description?: string;
  created_at: string;
  updated_at: string;
  product_name?: string;
  customer_name?: string;
  due_date?: string;
}

interface ReceiptProps {
  sale: Sale;
  businessInfo?: {
    name: string;
    address?: string;
    phone?: string;
  };
}

export const Receipt: React.FC<ReceiptProps> = ({ 
  sale, 
  businessInfo = { name: "Ledger Bloom System" } 
}) => {
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  const receiptNumber = `RCP-${sale.id.slice(-8)}`;
  const saleDate = new Date(sale.created_at).toLocaleDateString();
  const saleTime = new Date(sale.created_at).toLocaleTimeString();

  return (
    <div className="receipt-container font-mono text-sm max-w-xs mx-auto bg-background text-foreground p-4 border border-border">
      {/* Business Header */}
      <div className="text-center border-b border-border pb-2 mb-2">
        <h2 className="font-bold text-base">{businessInfo.name}</h2>
        {businessInfo.address && (
          <p className="text-xs text-muted-foreground">{businessInfo.address}</p>
        )}
        {businessInfo.phone && (
          <p className="text-xs text-muted-foreground">{businessInfo.phone}</p>
        )}
      </div>

      {/* Transaction Info */}
      <div className="border-b border-border pb-2 mb-2">
        <div className="flex justify-between">
          <span>Receipt #:</span>
          <span>{receiptNumber}</span>
        </div>
        <div className="flex justify-between">
          <span>Date:</span>
          <span>{saleDate}</span>
        </div>
        <div className="flex justify-between">
          <span>Time:</span>
          <span>{saleTime}</span>
        </div>
      </div>

      {/* Items */}
      <div className="border-b border-border pb-2 mb-2">
        <div className="flex justify-between font-semibold mb-1">
          <span>Item</span>
          <span>Total</span>
        </div>
        <div className="flex justify-between">
          <div className="flex-1">
            <div>{sale.product_name}</div>
            <div className="text-xs text-muted-foreground">
              {sale.quantity} x {formatCurrency(sale.selling_price)}
            </div>
          </div>
          <div className="text-right">
            {formatCurrency(sale.total_price)}
          </div>
        </div>
      </div>

      {/* Totals */}
      <div className="border-b border-border pb-2 mb-2">
        <div className="flex justify-between font-semibold">
          <span>TOTAL:</span>
          <span>{formatCurrency(sale.total_price)}</span>
        </div>
        <div className="flex justify-between">
          <span>Payment Method:</span>
          <span className="capitalize">{sale.payment_method}</span>
        </div>
      </div>

      {/* Credit Information */}
      {sale.payment_method === 'credit' && (
        <div className="border-b border-border pb-2 mb-2">
          <div className="text-center font-semibold mb-1">CREDIT SALE</div>
          {sale.customer_name && (
            <div className="flex justify-between">
              <span>Customer:</span>
              <span>{sale.customer_name}</span>
            </div>
          )}
          {sale.due_date && (
            <div className="flex justify-between">
              <span>Due Date:</span>
              <span>{new Date(sale.due_date).toLocaleDateString()}</span>
            </div>
          )}
        </div>
      )}

      {/* Footer */}
      <div className="text-center text-xs text-muted-foreground pt-2">
        <p>Thank you for your business!</p>
        <p className="mt-1">Keep this receipt for your records</p>
      </div>
    </div>
  );
};