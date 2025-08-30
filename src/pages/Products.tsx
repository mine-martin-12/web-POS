import React, { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Search, Plus, Edit, Trash2, Download, Package } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import * as z from "zod";

const productSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().min(1, "Description is required"),
  size: z.string().optional(),
  stock_quantity: z.number().min(0, "Stock quantity must be non-negative"),
  buying_price: z.number().min(0, "Price per unit must be non-negative"),
});

const stockSchema = z.object({
  additional_stock: z.number().min(1, "Must add at least 1 item"),
});

type ProductFormData = z.infer<typeof productSchema>;
type StockFormData = z.infer<typeof stockSchema>;

interface Product {
  id: string;
  name: string;
  description: string;
  size?: string;
  stock_quantity: number;
  buying_price: number;
  total_buying_price?: number;
  created_at: string;
  updated_at: string;
}

const Products: React.FC = () => {
  const { profile } = useAuth();
  const { toast } = useToast();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isStockDialogOpen, setIsStockDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [stockProduct, setStockProduct] = useState<Product | null>(null);
  const [isUpdateConfirmOpen, setIsUpdateConfirmOpen] = useState(false);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [productToDelete, setProductToDelete] = useState<string | null>(null);

  const form = useForm<ProductFormData>({
    resolver: zodResolver(productSchema),
    defaultValues: {
      name: "",
      description: "",
      size: "",
      stock_quantity: 0,
      buying_price: 0,
    },
  });

  const stockForm = useForm<StockFormData>({
    resolver: zodResolver(stockSchema),
    defaultValues: {
      additional_stock: 1,
    },
  });

  const fetchProducts = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("products")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setProducts(data || []);
    } catch (error: any) {
      toast({
        title: "Error",
        description: "Failed to load products",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProducts();
  }, []);

  const onSubmit = async (data: ProductFormData) => {
    setIsUpdateConfirmOpen(true);
  };

  const confirmSubmit = async () => {
    try {
      const data = form.getValues();
      const productData = {
        name: data.name,
        description: data.description,
        size: data.size || null,
        stock_quantity: data.stock_quantity,
        buying_price: data.buying_price,
        business_id: profile?.business_id,
        // total_buying_price will be calculated by trigger
      };

      if (editingProduct) {
        const { error } = await supabase
          .from("products")
          .update(productData)
          .eq("id", editingProduct.id);

        if (error) throw error;
        toast({
          title: "Success",
          description: "Product updated successfully",
        });
      } else {
        const { error } = await supabase.from("products").insert(productData);

        if (error) throw error;
        toast({
          title: "Success",
          description: "Product created successfully",
        });
      }

      setIsDialogOpen(false);
      setIsUpdateConfirmOpen(false);
      setEditingProduct(null);
      form.reset();
      fetchProducts();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to save product",
        variant: "destructive",
      });
    }
  };

  const handleStockSubmit = async (data: StockFormData) => {
    if (!stockProduct) return;

    try {
      const { error } = await supabase
        .from("products")
        .update({
          stock_quantity: stockProduct.stock_quantity + data.additional_stock,
        })
        .eq("id", stockProduct.id);

      if (error) throw error;

      toast({
        title: "Success",
        description: `Added ${data.additional_stock} items to ${stockProduct.name}`,
      });

      setIsStockDialogOpen(false);
      setStockProduct(null);
      stockForm.reset();
      fetchProducts();
    } catch (error: any) {
      toast({
        title: "Error",
        description: "Failed to update stock",
        variant: "destructive",
      });
    }
  };

  const handleEdit = (product: Product) => {
    setEditingProduct(product);
    form.reset({
      name: product.name,
      description: product.description,
      size: product.size || "",
      stock_quantity: product.stock_quantity,
      buying_price: product.buying_price,
    });
    setIsDialogOpen(true);
  };

  const handleDeleteClick = (id: string) => {
    if (profile?.role !== "admin") {
      toast({
        title: "Access Denied",
        description: "Only admins can delete products",
        variant: "destructive",
      });
      return;
    }
    setProductToDelete(id);
    setIsDeleteConfirmOpen(true);
  };

  const confirmDelete = async () => {
    if (!productToDelete) return;

    try {
      const { error } = await supabase
        .from("products")
        .delete()
        .eq("id", productToDelete);

      if (error) throw error;
      toast({ title: "Success", description: "Product deleted successfully" });
      fetchProducts();
    } catch (error: any) {
      toast({
        title: "Error",
        description: "Failed to delete product",
        variant: "destructive",
      });
    } finally {
      setIsDeleteConfirmOpen(false);
      setProductToDelete(null);
    }
  };

  const exportToCSV = () => {
    const headers = [
      "Name",
      "Description",
      "Size",
      "Stock Quantity",
      "Buying Price",
      "Total Buying Price",
      "Created At",
    ];
    const csvContent = [
      headers.join(","),
      ...filteredProducts.map((product) =>
        [
          product.name,
          product.description,
          product.size || "",
          product.stock_quantity,
          product.buying_price,
          product.total_buying_price ||
            product.buying_price * product.stock_quantity,
          new Date(product.created_at).toLocaleDateString(),
        ].join(",")
      ),
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "products.csv";
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const filteredProducts = products.filter(
    (product) =>
      product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      product.description.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const openAddDialog = () => {
    setEditingProduct(null);
    form.reset({
      name: "",
      description: "",
      size: "",
      stock_quantity: 0,
      buying_price: 0,
    });
    setIsDialogOpen(true);
  };

  const openStockDialog = (product: Product) => {
    setStockProduct(product);
    stockForm.reset({ additional_stock: 1 });
    setIsStockDialogOpen(true);
  };

  const getStockStatus = (quantity: number) => {
    if (quantity < 5) {
      return { label: "Low Stock", color: "destructive" as const };
    }
    return { label: "In Stock", color: "default" as const };
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "KES",
    }).format(amount);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Products</h1>
          <p className="text-muted-foreground">
            Manage your inventory and product catalog
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          <Button
            onClick={exportToCSV}
            variant="outline"
            className="flex items-center gap-2"
          >
            <Download className="h-4 w-4" />
            Export CSV
          </Button>
          <Button onClick={openAddDialog} className="flex items-center gap-2">
            <Plus className="h-4 w-4" />
            Add Product
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <CardTitle>Product Inventory</CardTitle>
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search products..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-8"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8">Loading products...</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Size</TableHead>
                    <TableHead>Stock Status</TableHead>
                    <TableHead>Remaining Stock</TableHead>
                    <TableHead>Price per Unit</TableHead>
                    <TableHead>Total Value</TableHead>
                    <TableHead>Added On</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredProducts.map((product) => {
                    const stockStatus = getStockStatus(product.stock_quantity);
                    return (
                      <TableRow key={product.id}>
                        <TableCell className="font-medium">
                          {product.name}
                        </TableCell>
                        <TableCell>{product.description}</TableCell>
                        <TableCell>{product.size || "-"}</TableCell>
                        <TableCell>
                          <Badge variant={stockStatus.color}>
                            {stockStatus.label}
                          </Badge>
                        </TableCell>
                        <TableCell>{product.stock_quantity}</TableCell>
                        <TableCell>
                          {formatCurrency(product.buying_price)}
                        </TableCell>
                        <TableCell>
                          {formatCurrency(
                            product.buying_price * product.stock_quantity
                          )}
                        </TableCell>
                        <TableCell>
                          {new Date(product.created_at).toLocaleDateString()}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleEdit(product)}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => openStockDialog(product)}
                            >
                              <Package className="h-4 w-4" />
                            </Button>
                            {profile?.role === "admin" && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleDeleteClick(product.id)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingProduct ? "Edit Product" : "Add New Product"}
            </DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description</FormLabel>
                    <FormControl>
                      <Textarea {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="size"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Size (Optional)</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="stock_quantity"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Stock Quantity</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        {...field}
                        onChange={(e) =>
                          field.onChange(parseInt(e.target.value) || 0)
                        }
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="buying_price"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Price per Unit</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="0.01"
                        {...field}
                        onChange={(e) =>
                          field.onChange(parseFloat(e.target.value) || 0)
                        }
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="flex justify-end space-x-2 background-red-500">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsDialogOpen(false)}
                >
                  Cancel
                </Button>
                <Button type="submit">
                  {editingProduct ? "Update" : "Create"}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Stock Management Dialog */}
      <Dialog open={isStockDialogOpen} onOpenChange={setIsStockDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add Stock - {stockProduct?.name}</DialogTitle>
          </DialogHeader>
          <Form {...stockForm}>
            <form
              onSubmit={stockForm.handleSubmit(handleStockSubmit)}
              className="space-y-4"
            >
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">
                  Current Stock: {stockProduct?.stock_quantity}
                </p>
              </div>

              <FormField
                control={stockForm.control}
                name="additional_stock"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Additional Stock</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min="1"
                        {...field}
                        onChange={(e) =>
                          field.onChange(parseInt(e.target.value) || 1)
                        }
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="flex justify-end space-x-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsStockDialogOpen(false)}
                >
                  Cancel
                </Button>
                <Button type="submit">Add Stock</Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Update Confirmation Dialog */}
      <AlertDialog
        open={isUpdateConfirmOpen}
        onOpenChange={setIsUpdateConfirmOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Submission</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to submit these details?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmSubmit}>
              Submit
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog
        open={isDeleteConfirmOpen}
        onOpenChange={setIsDeleteConfirmOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Deletion</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this product? This action cannot
              be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Products;
