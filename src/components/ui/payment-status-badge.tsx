import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface PaymentStatusBadgeProps {
  paymentMethod: string;
  className?: string;
}

export function PaymentStatusBadge({ paymentMethod, className }: PaymentStatusBadgeProps) {
  const getVariantAndText = (method: string) => {
    const normalizedMethod = method.toLowerCase();
    
    if (normalizedMethod === 'cash') {
      return { variant: 'default' as const, text: 'Cash' };
    }
    if (normalizedMethod === 'm-pesa' || normalizedMethod === 'mpesa') {
      return { variant: 'secondary' as const, text: 'M-Pesa' };
    }
    if (normalizedMethod === 'credit') {
      return { variant: 'outline' as const, text: 'Credit' };
    }
    if (normalizedMethod === 'paid credit' || normalizedMethod === 'paidcredit') {
      return { variant: 'default' as const, text: 'Paid Credit' };
    }
    
    // Fallback for any other payment methods
    return { variant: 'secondary' as const, text: method };
  };

  const { variant, text } = getVariantAndText(paymentMethod);

  return (
    <Badge 
      variant={variant} 
      className={cn(
        "font-medium",
        variant === 'outline' && "border-warning text-warning-foreground bg-warning/10",
        variant === 'default' && paymentMethod.toLowerCase().includes('credit') && "bg-success text-success-foreground",
        className
      )}
    >
      {text}
    </Badge>
  );
}