import React, { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form } from "@/components/ui/form";
import { TextField } from "@/components/common/form-fields";
import { getErrorMessage } from "@/lib/errors";
import { invalidSummary, requiredText } from "@/lib/validation";
import type { Product } from "../api";
import { useCreateProduct, useUpdateProduct } from "../hooks";

const money = (label: string) =>
  z
    .string()
    .trim()
    .refine((v) => v !== "" && Number.isFinite(Number(v)) && Number(v) >= 0, `Enter the ${label}`);

const schema = z.object({
  name: requiredText("Name", 120),
  description: z.string().trim().max(500),
  size: z.string().trim().max(50),
  buying_price: money("buying price"),
  stock_quantity: z.string().trim().refine((v) => /^\d+$/.test(v), "Enter a whole number (0 or more)"),
});
type FormData = z.infer<typeof schema>;

interface ProductFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Edit (admins); omit to add. */
  product?: Product | null;
}

export function ProductFormDialog({ open, onOpenChange, product }: ProductFormDialogProps) {
  const create = useCreateProduct();
  const update = useUpdateProduct();
  const busy = create.isPending || update.isPending;
  const form = useForm<FormData>({
    resolver: zodResolver(schema),
    reValidateMode: "onSubmit",
    defaultValues: { name: "", description: "", size: "", buying_price: "", stock_quantity: "0" },
  });

  useEffect(() => {
    if (!open) return;
    form.reset(
      product
        ? {
            name: product.name,
            description: product.description,
            size: product.size ?? "",
            buying_price: String(product.buying_price),
            stock_quantity: String(product.stock_quantity),
          }
        : { name: "", description: "", size: "", buying_price: "", stock_quantity: "0" },
    );
  }, [open, product, form]);

  // Saves the VALIDATED data (the old form saved raw getValues(), so a cleared field
  // reached the database as "").
  const onSubmit = async (data: FormData) => {
    const input = {
      name: data.name,
      description: data.description,
      size: data.size,
      buying_price: Number(data.buying_price),
    };
    try {
      if (product) {
        await update.mutateAsync({ id: product.id, product: input });
        toast.success("Product updated", { description: input.name });
      } else {
        await create.mutateAsync({ ...input, stock_quantity: Number(data.stock_quantity) });
        toast.success("Product added", { description: input.name });
      }
      onOpenChange(false);
    } catch (error) {
      toast.error(product ? "Couldn't update the product" : "Couldn't add the product", {
        description: getErrorMessage(error),
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{product ? "Edit product" : "Add a product"}</DialogTitle>
          <DialogDescription>
            {product ? "To change stock, use Add stock or record a sale." : "You can add more stock later."}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit, (errors) => toast.error(invalidSummary(errors).title, { description: invalidSummary(errors).description }))}
            className="space-y-4"
            noValidate
          >
            <TextField control={form.control} clearErrors={form.clearErrors} name="name" label="Name" autoFocus />
            <TextField control={form.control} clearErrors={form.clearErrors} name="description" label="Description (optional)" />
            <div className="grid grid-cols-2 gap-4">
              <TextField control={form.control} clearErrors={form.clearErrors} name="size" label="Size (optional)" placeholder="e.g. 2kg" />
              <TextField
                control={form.control}
                clearErrors={form.clearErrors}
                name="buying_price"
                label="Buying price"
                type="number"
                inputMode="decimal"
                step="0.01"
                min={0}
              />
            </div>
            {!product && (
              <TextField
                control={form.control}
                clearErrors={form.clearErrors}
                name="stock_quantity"
                label="Opening stock"
                type="number"
                inputMode="numeric"
                min={0}
                step={1}
              />
            )}
            <DialogFooter className="flex-col gap-2 sm:flex-row-reverse sm:justify-start sm:gap-2">
              <Button type="submit" disabled={busy} className="w-full sm:w-auto">
                {busy ? "Saving…" : product ? "Save changes" : "Add product"}
              </Button>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy} className="w-full sm:w-auto">
                Cancel
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
