import { cn } from "@/lib/utils";

interface PaymentStatusDisplayProps {
  paymentMethod: string;
  creditInfo?: {
    amountPaid: number;
    amountOwed: number;
    status: string;
  };
  className?: string;
}

export function PaymentStatusDisplay({ paymentMethod, creditInfo, className }: PaymentStatusDisplayProps) {
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "KES",
    }).format(amount);
  };

  if (paymentMethod === "credit" && creditInfo) {
    const paymentPercentage = creditInfo.amountOwed > 0 ? (creditInfo.amountPaid / creditInfo.amountOwed) * 100 : 0;
    
    return (
      <div className={cn("flex flex-col gap-1", className)}>
        <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
          paymentPercentage >= 100
            ? "bg-success/20 text-success border border-success/30"
            : paymentPercentage > 0
            ? "bg-warning/20 text-warning border border-warning/30"
            : "bg-destructive/20 text-destructive border border-destructive/30"
        }`}>
          {paymentPercentage >= 100 ? "Paid Credit" : paymentPercentage > 0 ? `${paymentPercentage.toFixed(0)}% Paid` : "Unpaid Credit"}
        </span>
        {paymentPercentage < 100 && (
          <span className="text-xs text-muted-foreground">
            {formatCurrency(creditInfo.amountPaid)} / {formatCurrency(creditInfo.amountOwed)}
          </span>
        )}
      </div>
    );
  }

  if (paymentMethod === "credit") {
    return (
      <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-destructive/20 text-destructive border border-destructive/30">
        Credit Sale
      </span>
    );
  }

  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-success/20 text-success border border-success/30">
        Paid
      </span>
      <span className="text-xs text-muted-foreground">
        {paymentMethod === "mpesa" ? "M-Pesa" : paymentMethod === "bank" ? "Bank/Cheque" : "Cash"}
      </span>
    </div>
  );
}