import type { ProductInput, ProductsApi } from "@/features/products/api";
import type { Product } from "@/features/products/api.supabase";
import { asActor, callRpc, rows } from "../db/engine";

export const products = {
  fetchProducts() {
    return asActor((tx) => rows<Product>(tx, "SELECT * FROM public.products WHERE archived_at IS NULL ORDER BY name, id"));
  },

  async createProduct(input: ProductInput & { stock_quantity: number }) {
    // business_id defaults to (and is forced to) the caller's business, as in production.
    await asActor((tx) =>
      rows(
        tx,
        "INSERT INTO public.products (name, description, size, buying_price, stock_quantity) VALUES ($1, $2, $3, $4, $5)",
        [input.name, input.description, input.size || null, input.buying_price, input.stock_quantity],
      ),
    );
  },

  async updateProduct(id: string, input: ProductInput) {
    const updated = await asActor((tx) =>
      rows(
        tx,
        "UPDATE public.products SET name = $2, description = $3, size = $4, buying_price = $5 WHERE id = $1 RETURNING id",
        [id, input.name, input.description, input.size || null, input.buying_price],
      ),
    );
    if (!updated.length) throw new Error("Only admins can edit products");
  },

  async archiveProduct(id: string) {
    const updated = await asActor((tx) =>
      rows(tx, "UPDATE public.products SET archived_at = now() WHERE id = $1 RETURNING id", [id]),
    );
    if (!updated.length) throw new Error("Only admins can archive products");
  },

  addStock(input: { productId: string; quantity: number }) {
    return asActor((tx) =>
      callRpc(tx, "add_stock", { _product_id: input.productId, _quantity: input.quantity }, "row"),
    ) as ReturnType<ProductsApi["addStock"]>;
  },
} satisfies ProductsApi;
