import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { Search, Plus, Edit, Trash2, Download } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';

const saleSchema = z.object({
  product_id: z.string().min(1, 'Product is required'),
  quantity: z.number().min(1, 'Quantity must be at least 1'),
  selling_price: z.number().min(0, 'Selling price must be non-negative'),
  description: z.string().optional(),
});

type SaleFormData = z.infer<typeof saleSchema>;

interface Sale {
  id: string;
  product_id: string;
  quantity: number;
  selling_price: number;
  total_price?: number;
  sale_date: string;
  description?: string;
  created_at: string;
  updated_at: string;
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
  const [searchTerm, setSearchTerm] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingSale, setEditingSale] = useState<Sale | null>(null);

  const form = useForm<SaleFormData>({
    resolver: zodResolver(saleSchema),
    defaultValues: {
      product_id: '',
      quantity: 1,
      selling_price: 0,
      description: '',
    },
  });

  const fetchSales = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('sales')
        .select(`
          *,
          products (
            name,
            buying_price
          )
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setSales(data || []);
    } catch (error: any) {
      toast({
        title: 'Error',
        description: 'Failed to load sales',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchProducts = async () => {
    try {
      const { data, error } = await supabase
        .from('products')
        .select('id, name, buying_price, stock_quantity')
        .order('name', { ascending: true });

      if (error) throw error;
      setProducts(data || []);
    } catch (error: any) {
      toast({
        title: 'Error',
        description: 'Failed to load products',
        variant: 'destructive',
      });
    }
  };

  useEffect(() => {
    fetchSales();
    fetchProducts();
  }, []);

  const onSubmit = async (data: SaleFormData) => {
    try {
      // Check stock availability before processing sale
      const selectedProduct = products.find(p => p.id === data.product_id);
      if (!selectedProduct) {
        throw new Error('Product not found');
      }

      if (data.quantity > selectedProduct.stock_quantity) {
        throw new Error(`Insufficient stock. Available: ${selectedProduct.stock_quantity}, Requested: ${data.quantity}`);
      }

      const saleData = {
        product_id: data.product_id,
        quantity: data.quantity,
        selling_price: data.selling_price,
        description: data.description || null,
        business_id: profile?.business_id,
        // total_price will be calculated by trigger
        sale_date: new Date().toISOString(),
      };

      if (editingSale) {
        const { error } = await supabase
          .from('sales')
          .update(saleData)
          .eq('id', editingSale.id);

        if (error) throw error;
        toast({ title: 'Success', description: 'Sale updated successfully' });
      } else {
        const { error } = await supabase
          .from('sales')
          .insert(saleData);

        if (error) throw error;
        toast({ title: 'Success', description: 'Sale recorded successfully' });
      }

      setIsDialogOpen(false);
      setEditingSale(null);
      form.reset();
      fetchSales();
      fetchProducts(); // Refresh products to show updated stock
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to save sale',
        variant: 'destructive',
      });
    }
  };

  const handleEdit = (sale: Sale) => {
    setEditingSale(sale);
    form.reset({
      product_id: sale.product_id,
      quantity: sale.quantity,
      selling_price: sale.selling_price,
      description: sale.description || '',
    });
    setIsDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (profile?.role !== 'admin') {
      toast({
        title: 'Access Denied',
        description: 'Only admins can delete sales',
        variant: 'destructive',
      });
      return;
    }

    try {
      const { error } = await supabase
        .from('sales')
        .delete()
        .eq('id', id);

      if (error) throw error;
      toast({ title: 'Success', description: 'Sale deleted successfully' });
      fetchSales();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: 'Failed to delete sale',
        variant: 'destructive',
      });
    }
  };

  const exportToCSV = () => {
    const headers = ['Product', 'Quantity', 'Selling Price', 'Total Price', 'Profit', 'Sale Date', 'Description'];
    const csvContent = [
      headers.join(','),
      ...filteredSales.map(sale => {
        const profit = sale.products 
          ? (sale.selling_price - sale.products.buying_price) * sale.quantity
          : 0;
        return [
          sale.products?.name || 'Unknown Product',
          sale.quantity,
          sale.selling_price,
          sale.total_price || sale.quantity * sale.selling_price,
          profit.toFixed(2),
          new Date(sale.sale_date).toLocaleDateString(),
          sale.description || '',
        ].join(',');
      })
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'sales.csv';
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const calculateProfit = (sale: Sale) => {
    if (!sale.products) return 0;
    return (sale.selling_price - sale.products.buying_price) * sale.quantity;
  };

  const filteredSales = sales.filter(sale =>
    sale.products?.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    sale.description?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const openAddDialog = () => {
    setEditingSale(null);
    form.reset();
    setIsDialogOpen(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Sales</h1>
          <p className="text-muted-foreground">Track and manage your sales transactions</p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          <Button onClick={exportToCSV} variant="outline" className="flex items-center gap-2">
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
                        {sale.products?.name || 'Unknown Product'}
                      </TableCell>
                      <TableCell>{sale.quantity}</TableCell>
                      <TableCell>${sale.selling_price.toFixed(2)}</TableCell>
                      <TableCell>${(sale.total_price || sale.quantity * sale.selling_price).toFixed(2)}</TableCell>
                      <TableCell className={calculateProfit(sale) >= 0 ? 'text-green-600' : 'text-red-600'}>
                        ${calculateProfit(sale).toFixed(2)}
                      </TableCell>
                      <TableCell>{new Date(sale.sale_date).toLocaleDateString()}</TableCell>
                      <TableCell>{sale.description || '-'}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleEdit(sale)}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          {profile?.role === 'admin' && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleDelete(sale.id)}
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
              {editingSale ? 'Edit Sale' : 'Record New Sale'}
            </DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="product_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Product</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
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
                        onChange={(e) => field.onChange(parseInt(e.target.value) || 1)}
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
                        onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                      />
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
                    <FormLabel>Description (Optional)</FormLabel>
                    <FormControl>
                      <Textarea {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="flex justify-end space-x-2">
                <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit">
                  {editingSale ? 'Update' : 'Record Sale'}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Sales;