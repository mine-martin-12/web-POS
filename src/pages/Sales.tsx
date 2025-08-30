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
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Search, Plus, Edit, Trash2, Download, Printer } from "lucide-react";
import { Receipt } from "@/components/receipt/Receipt";
import { printReceipt } from "@/utils/printUtils";
import { createRoot } from 'react-dom/client';
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";

const saleSchema = z.object({
  product_id: z.string().min(1, "Product is required"),
  quantity: z.number().min(1, "Quantity must be at least 1"),
  selling_price: z.number().min(0, "Selling price must be non-negative"),
  payment_method: z.enum(["cash", "mpesa", "bank", "credit"], {
    required_error: "Payment method is required",
  }),
  description: z.string().optional(),
  customer_name: z.string().optional(),
  due_date: z.string().optional(),
}).refine((data) => {
  if (data.payment_method === "credit") {
    return data.customer_name && data.due_date;
  }
  return true;
}, {
  message: "Customer name and due date are required for credit sales",
  path: ["customer_name"],
});

type SaleFormData = z.infer<typeof saleSchema>;

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
  buying_price?: number;
  payment_percentage?: number;
  products?: {
    name: string;
    buying_price: number;
  };
}

interface Product {
  id: string;
  name: string;
  buying_price: number;
  stock_quantity: number;
}

const Sales: React.FC = () => {
  const { profile } = useAuth();
  const { toast } = useToast();
  const [sales, setSales] = useState<Sale[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingSale, setEditingSale] = useState<Sale | null>(null);
  const [isUpdateConfirmOpen, setIsUpdateConfirmOpen] = useState(false);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [saleToDelete, setSaleToDelete] = useState<string | null>(null);
  const [isPrintConfirmOpen, setIsPrintConfirmOpen] = useState(false);
  const [isRecordSaleConfirmOpen, setIsRecordSaleConfirmOpen] = useState(false);
  const [saleToprint, setSaleToPrint] = useState<Sale | null>(null);

  const form = useForm<SaleFormData>({
    resolver: zodResolver(saleSchema),
    defaultValues: {
      product_id: "",
      quantity: 1,
      selling_price: 0,
      payment_method: "cash",
      description: "",
    },
  });

  const fetchSales = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("sales")
        .select(
          `
          *,
          products (
            name,
            buying_price
          ),
          credits (
            amount_paid,
            amount_owed,
            status
          )
        `
        )
        .order("created_at", { ascending: false });

      if (error) throw error;
      setSales((data || []) as Sale[]);
    } catch (error: any) {
      toast({
        title: "Error",
        description: "Failed to load sales",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchProducts = async () => {
    try {
      const { data, error } = await supabase
        .from("products")
        .select("id, name, buying_price, stock_quantity")
        .order("name", { ascending: true });

      if (error) throw error;
      setProducts(data || []);
    } catch (error: any) {
      toast({
        title: "Error",
        description: "Failed to load products",
        variant: "destructive",
      });
    }
  };

  useEffect(() => {
    fetchSales();
    fetchProducts();
  }, []);

  const onSubmit = async (data: SaleFormData) => {
    if (!editingSale) {
      setIsRecordSaleConfirmOpen(true);
      return;
    }
    handleSubmit(data);
  };

  const handleSubmit = async (data: SaleFormData) => {
    try {
      // Check stock availability before processing sale (consider edit delta)
      const selectedProduct = products.find((p) => p.id === data.product_id);
      if (!selectedProduct) {
        throw new Error("Product not found");
      }

      let effectiveAvailable = selectedProduct.stock_quantity;
      if (editingSale && editingSale.product_id === data.product_id) {
        effectiveAvailable += editingSale.quantity;
      }

      if (data.quantity > effectiveAvailable) {
        throw new Error(
          `Insufficient stock. Available: ${effectiveAvailable}, Requested: ${data.quantity}`
        );
      }

      const saleData = {
        product_id: data.product_id,
        quantity: data.quantity,
        selling_price: data.selling_price,
        payment_method: data.payment_method,
        description: data.description || null,
        business_id: profile?.business_id,
        // total_price will be calculated by trigger
        sale_date: new Date().toISOString(),
      };

      let saleId = editingSale?.id;

      if (editingSale) {
        const { error } = await supabase
          .from("sales")
          .update(saleData)
          .eq("id", editingSale.id);

        if (error) throw error;
        toast({ title: "Success", description: "Sale updated successfully" });
      } else {
        const { data: insertedSale, error } = await supabase
          .from("sales")
          .insert(saleData)
          .select('id')
          .single();

        if (error) throw error;
        saleId = insertedSale.id;
        toast({ title: "Success", description: "Sale recorded successfully" });
      }

      // If this is a credit sale, create a credit record
      if (data.payment_method === "credit" && data.customer_name && data.due_date && saleId) {
        const creditData = {
          business_id: profile?.business_id,
          sale_id: saleId,
          customer_name: data.customer_name,
          amount_owed: data.quantity * data.selling_price,
          due_date: data.due_date,
        };

        const { error: creditError } = await supabase
          .from("credits")
          .insert(creditData);

        if (creditError) {
          console.error("Error creating credit record:", creditError);
          toast({
            title: "Warning",
            description: "Sale recorded but credit record failed to create",
            variant: "destructive",
          });
        }
      }

      setIsDialogOpen(false);
      setEditingSale(null);
      form.reset();
      fetchSales();
      fetchProducts(); // Refresh products to show updated stock
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to save sale",
        variant: "destructive",
      });
    }
  };

  const handleEdit = (sale: Sale) => {
    setEditingSale(sale);
    form.reset({
      product_id: sale.product_id,
      quantity: sale.quantity,
      selling_price: sale.selling_price,
      payment_method: sale.payment_method,
      description: sale.description || "",
    });
    setIsDialogOpen(true);
  };

  const handleUpdateConfirm = () => {
    setIsUpdateConfirmOpen(true);
  };

  const handleUpdateSubmit = () => {
    setIsUpdateConfirmOpen(false);
    form.handleSubmit(handleSubmit)();
  };

  const handleRecordSaleSubmit = () => {
    setIsRecordSaleConfirmOpen(false);
    form.handleSubmit(handleSubmit)();
  };

  const handleDeleteConfirm = (id: string) => {
    if (profile?.role !== "admin") {
      toast({
        title: "Access Denied",
        description: "Only admins can delete sales",
        variant: "destructive",
      });
      return;
    }
    setSaleToDelete(id);
    setIsDeleteConfirmOpen(true);
  };

  const handleDelete = async () => {
    if (!saleToDelete) return;

    try {
      const { error } = await supabase
        .from("sales")
        .delete()
        .eq("id", saleToDelete);

      if (error) throw error;
      toast({ title: "Success", description: "Sale deleted successfully" });
      fetchSales();
      setIsDeleteConfirmOpen(false);
      setSaleToDelete(null);
    } catch (error: any) {
      toast({
        title: "Error",
        description: "Failed to delete sale",
        variant: "destructive",
      });
    }
  };

  const exportToCSV = () => {
    const headers = [
      "Product",
      "Quantity",
      "Selling Price",
      "Total Price",
      "Payment Method",
      "Profit",
      "Profit Status",
      "Sale Date",
      "Description",
    ];
    const csvContent = [
      headers.join(","),
      ...filteredSales.map((sale) => {
        const profit = sale.products
          ? (sale.selling_price - sale.products.buying_price) * sale.quantity
          : 0;
        let profitStatus = "Realized";
        if (sale.payment_method === "credit" && (sale as any).credits?.[0]) {
          const credit = (sale as any).credits[0];
          const amountPaid = Number(credit.amount_paid) || 0;
          const amountOwed = Number(credit.amount_owed) || 0;
          const paymentPercentage = amountOwed > 0 ? (amountPaid / amountOwed) * 100 : 0;
          profitStatus = paymentPercentage >= 100 ? "Fully Paid" : paymentPercentage > 0 ? `${paymentPercentage.toFixed(0)}% Paid` : "Pending";
        } else if (sale.payment_method === "credit") {
          profitStatus = "Pending";
        }
        return [
          sale.products?.name || "Unknown Product",
          sale.quantity,
          sale.selling_price,
          sale.total_price || sale.quantity * sale.selling_price,
          sale.payment_method === "mpesa"
            ? "M-Pesa"
            : sale.payment_method === "bank"
            ? "Bank/Cheque"
            : sale.payment_method === "credit"
            ? "Credit Sale"
            : "Cash",
          profit.toFixed(2),
          profitStatus,
          new Date(sale.sale_date).toLocaleDateString(),
          sale.description || "",
        ].join(",");
      }),
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "sales.csv";
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const calculateProfit = (sale: Sale) => {
    if (!sale.products) return 0;
    return (sale.selling_price - sale.products.buying_price) * sale.quantity;
  };

  const handlePrintClick = (sale: Sale) => {
    setSaleToPrint(sale);
    setIsPrintConfirmOpen(true);
  };

  const handlePrintReceipt = () => {
    if (!saleToprint) return;
    
    // Create a temporary div to render the receipt
    const tempDiv = document.createElement('div');
    const root = createRoot(tempDiv);
    
    // Add product name to sale for receipt
    const saleWithProduct = {
      ...saleToprint,
      product_name: saleToprint.products?.name || "Unknown Product"
    };
    
    root.render(<Receipt sale={saleWithProduct} />);
    
    // Wait for render to complete
    setTimeout(() => {
      printReceipt(tempDiv.innerHTML);
      root.unmount();
      setIsPrintConfirmOpen(false);
      setSaleToPrint(null);
    }, 100);
  };

  const filteredSales = sales.filter(
    (sale) =>
      sale.products?.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      sale.description?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const openAddDialog = () => {
    setEditingSale(null);
    form.reset({
      product_id: "",
      quantity: 1,
      selling_price: 0,
      payment_method: "cash",
      description: "",
    });
    setIsDialogOpen(true);
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
          <h1 className="text-3xl font-bold text-foreground">Sales</h1>
          <p className="text-muted-foreground">
            Track and manage your sales transactions
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
            Record Sale
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <CardTitle>Sales History</CardTitle>
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search sales..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-8"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8">Loading sales...</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead>Quantity</TableHead>
                    <TableHead>Selling Price</TableHead>
                    <TableHead>Total Price</TableHead>
                    <TableHead>Payment Status</TableHead>
                    <TableHead>Profit</TableHead>
                    <TableHead>Sale Date</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredSales.map((sale) => (
                    <TableRow key={sale.id}>
                      <TableCell className="font-medium">
                        {sale.products?.name || "Unknown Product"}
                      </TableCell>
                      <TableCell>{sale.quantity}</TableCell>
                      <TableCell>
                        {formatCurrency(sale.selling_price)}
                      </TableCell>
                      <TableCell>
                        {formatCurrency(
                          sale.total_price || sale.quantity * sale.selling_price
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-1">
                          {sale.payment_method === "credit" && (sale as any).credits?.[0] ? (() => {
                            const credit = (sale as any).credits[0];
                            const amountPaid = Number(credit.amount_paid) || 0;
                            const amountOwed = Number(credit.amount_owed) || 0;
                            const paymentPercentage = amountOwed > 0 ? (amountPaid / amountOwed) * 100 : 0;
                            
                            return (
                              <>
                                <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                                  paymentPercentage >= 100
                                    ? "bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400"
                                    : paymentPercentage > 0
                                    ? "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400"
                                    : "bg-orange-100 text-orange-800 dark:bg-orange-900/20 dark:text-orange-400"
                                }`}>
                                  {paymentPercentage >= 100 ? "Paid" : paymentPercentage > 0 ? `${paymentPercentage.toFixed(0)}% Paid` : "Unpaid"}
                                </span>
                                {paymentPercentage < 100 && (
                                  <span className="text-xs text-muted-foreground">
                                    {formatCurrency(amountPaid)} / {formatCurrency(amountOwed)}
                                  </span>
                                )}
                              </>
                            );
                          })() : sale.payment_method === "credit" ? (
                            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-orange-100 text-orange-800 dark:bg-orange-900/20 dark:text-orange-400">
                              Credit Sale
                            </span>
                          ) : (
                            <>
                              <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400">
                                Paid
                              </span>
                              <span className="text-xs text-muted-foreground">
                                {sale.payment_method === "mpesa"
                                  ? "M-Pesa"
                                  : sale.payment_method === "bank"
                                  ? "Bank/Cheque"
                                  : "Cash"}
                              </span>
                            </>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col">
                          {sale.payment_method === "credit" && (sale as any).credits?.[0] ? (() => {
                            const credit = (sale as any).credits[0];
                            const amountPaid = Number(credit.amount_paid) || 0;
                            const amountOwed = Number(credit.amount_owed) || 0;
                            const paymentPercentage = amountOwed > 0 ? amountPaid / amountOwed : 0;
                            
                            const totalProfit = calculateProfit(sale);
                            const actualProfit = totalProfit * paymentPercentage;
                            const pendingProfit = totalProfit * (1 - paymentPercentage);
                            
                            return (
                              <div className="space-y-1">
                                <div className="flex items-center gap-1">
                                  <span className={
                                    actualProfit >= 0
                                      ? "text-green-600 dark:text-green-400"
                                      : "text-red-600 dark:text-red-400"
                                  }>
                                    {formatCurrency(actualProfit)}
                                  </span>
                                  <span className="text-xs text-green-600 dark:text-green-400">
                                    Actual
                                  </span>
                                </div>
                                {pendingProfit > 0 && (
                                  <div className="flex items-center gap-1">
                                    <span className="text-orange-600 dark:text-orange-400">
                                      {formatCurrency(pendingProfit)}
                                    </span>
                                    <span className="text-xs text-orange-600 dark:text-orange-400">
                                      Pending
                                    </span>
                                  </div>
                                )}
                              </div>
                            );
                          })() : (
                            <span className={
                              calculateProfit(sale) >= 0
                                ? "text-green-600 dark:text-green-400"
                                : "text-red-600 dark:text-red-400"
                            }>
                              {formatCurrency(calculateProfit(sale))}
                              {sale.payment_method === "credit" && (
                                <span className="text-xs text-orange-600 dark:text-orange-400 ml-1">
                                  Pending
                                </span>
                              )}
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        {new Date(sale.sale_date).toLocaleDateString()}
                      </TableCell>
                      <TableCell>{sale.description || "-"}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handlePrintClick(sale)}
                            title="Print Receipt"
                          >
                            <Printer className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleEdit(sale)}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          {profile?.role === "admin" && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleDeleteConfirm(sale.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
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
              {editingSale ? "Edit Sale" : "Record New Sale"}
            </DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form
              onSubmit={editingSale ? (e) => { e.preventDefault(); handleUpdateConfirm(); } : form.handleSubmit(onSubmit)}
              className="space-y-4"
            >
              <FormField
                control={form.control}
                name="product_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Product</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select a product" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {products.map((product) => (
                          <SelectItem key={product.id} value={product.id}>
                            {product.name} (Stock: {product.stock_quantity})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="quantity"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Quantity</FormLabel>
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
              <FormField
                control={form.control}
                name="selling_price"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Selling Price</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
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
              <FormField
                control={form.control}
                name="payment_method"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Payment Method</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select payment method" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="cash">Cash</SelectItem>
                        <SelectItem value="mpesa">M-Pesa</SelectItem>
                        <SelectItem value="bank">Bank/Cheque</SelectItem>
                        <SelectItem value="credit">Credit</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {form.watch("payment_method") === "credit" && (
                <>
                  <FormField
                    control={form.control}
                    name="customer_name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Customer Name</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="Enter customer name" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="due_date"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Due Date</FormLabel>
                        <FormControl>
                          <Input {...field} type="date" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </>
              )}
              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description (Optional)</FormLabel>
                    <FormControl>
                      <Textarea {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="flex justify-end space-x-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsDialogOpen(false)}
                >
                  Cancel
                </Button>
                <Button type="submit">
                  {editingSale ? "Update" : "Record Sale"}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Update Confirmation Dialog */}
      <Dialog open={isUpdateConfirmOpen} onOpenChange={setIsUpdateConfirmOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Confirm Submission</DialogTitle>
          </DialogHeader>
          <p className="text-muted-foreground">
            Are you sure you want to submit these details?
          </p>
          <div className="flex justify-end space-x-2 mt-4">
            <Button
              variant="outline"
              onClick={() => setIsUpdateConfirmOpen(false)}
            >
              Cancel
            </Button>
            <Button onClick={handleUpdateSubmit}>Confirm</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={isDeleteConfirmOpen} onOpenChange={setIsDeleteConfirmOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Confirm Deletion</DialogTitle>
          </DialogHeader>
          <p className="text-muted-foreground">
            Are you sure you want to delete this product? This action cannot be
            undone.
          </p>
          <div className="flex justify-end space-x-2 mt-4">
            <Button
              variant="outline"
              onClick={() => setIsDeleteConfirmOpen(false)}
            >
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete}>
              Delete
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Print Confirmation Dialog */}
      <Dialog open={isPrintConfirmOpen} onOpenChange={setIsPrintConfirmOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Print Receipt</DialogTitle>
          </DialogHeader>
          <p className="text-muted-foreground">
            Confirm you want to print the receipt.
          </p>
          <div className="flex justify-end space-x-2 mt-4">
            <Button
              variant="outline"
              onClick={() => setIsPrintConfirmOpen(false)}
            >
              Cancel
            </Button>
            <Button onClick={handlePrintReceipt}>Print</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Record Sale Confirmation Dialog */}
      <Dialog open={isRecordSaleConfirmOpen} onOpenChange={setIsRecordSaleConfirmOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Confirm Submission</DialogTitle>
          </DialogHeader>
          <p className="text-muted-foreground">
            Confirm Submission – Are you sure you want to record this sale?
          </p>
          <div className="flex justify-end space-x-2 mt-4">
            <Button
              variant="outline"
              onClick={() => setIsRecordSaleConfirmOpen(false)}
            >
              Cancel
            </Button>
            <Button onClick={handleRecordSaleSubmit}>Record Sale</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Sales;
