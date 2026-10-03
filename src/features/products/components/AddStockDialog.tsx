import React, { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { invalidInputClass } from "@/components/common/form-fields";
import { getErrorMessage } from "@/lib/errors";
import { cn } from "@/lib/utils";
import type { Product } from "../api";
import { useAddStock } from "../hooks";

export function AddStockDialog({ product, onOpenChange }: { product: Product | null; onOpenChange: (open: boolean) => void }) {
  const addStock = useAddStock();
  const [quantity, setQuantity] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (product) {
      setQuantity("");
      setError(null);
    }
  }, [product]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!product) return;
    if (!/^\d+$/.test(quantity.trim()) || Number(quantity) < 1) {
      setError("Enter a whole number, at least 1");
      return;
    }
    try {
      await addStock.mutateAsync({ productId: product.id, quantity: Number(quantity) });
      toast.success("Stock added", { description: `${quantity} × ${product.name}` });
      onOpenChange(false);
    } catch (e) {
      toast.error("Couldn't add stock", { description: getErrorMessage(e) });
    }
  };

  return (
    <Dialog open={product !== null} onOpenChange={(open) => !addStock.isPending && onOpenChange(open)}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Add stock</DialogTitle>
          <DialogDescription>
            {product?.name} · {product?.stock_quantity} in stock now
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4" noValidate>
          <div className="space-y-2">
            <Label htmlFor="stock-quantity" className={cn(error && "text-destructive")}>
              Quantity received
            </Label>
            <Input
              id="stock-quantity"
              type="number"
              inputMode="numeric"
              min={1}
              step={1}
              value={quantity}
              onChange={(e) => {
                setQuantity(e.target.value);
                setError(null);
              }}
              aria-invalid={!!error}
              className={invalidInputClass}
              autoFocus
            />
            {error && <p className="text-sm font-medium text-destructive">{error}</p>}
          </div>
          <DialogFooter className="flex-col gap-2 sm:flex-row-reverse sm:justify-start sm:gap-2">
            <Button type="submit" disabled={addStock.isPending} className="w-full sm:w-auto">
              {addStock.isPending ? "Saving…" : "Add stock"}
            </Button>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={addStock.isPending} className="w-full sm:w-auto">
              Cancel
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
