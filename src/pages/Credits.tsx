import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Search, DollarSign, Calendar, User, Edit, Trash2 } from 'lucide-react';

interface Credit {
  id: string;
  customer_name: string;
  amount_owed: number;
  amount_paid: number;
  due_date: string;
  status: 'unpaid' | 'partially_paid' | 'paid';
  created_at: string;
  sale_id: string;
}

const Credits: React.FC = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [credits, setCredits] = useState<Credit[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCredit, setSelectedCredit] = useState<Credit | null>(null);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [isPaymentDialogOpen, setIsPaymentDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isEditConfirmOpen, setIsEditConfirmOpen] = useState(false);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [editFormData, setEditFormData] = useState({
    customer_name: '',
    amount_owed: '',
    due_date: '',
    status: 'unpaid' as 'unpaid' | 'partially_paid' | 'paid'
  });

  useEffect(() => {
    if (user) {
      fetchCredits();
    }
  }, [user]);

  const fetchCredits = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('credits')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setCredits(data || []);
    } catch (error) {
      console.error('Error fetching credits:', error);
      toast({
        title: 'Error',
        description: 'Failed to fetch credits data',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handlePayment = async () => {
    if (!selectedCredit || !paymentAmount) return;

    const amount = parseFloat(paymentAmount);
    if (amount <= 0 || amount > (selectedCredit.amount_owed - selectedCredit.amount_paid)) {
      toast({
        title: 'Invalid Amount',
        description: 'Payment amount must be valid and not exceed the outstanding balance',
        variant: 'destructive',
      });
      return;
    }

    try {
      const newAmountPaid = selectedCredit.amount_paid + amount;
      
      const { error } = await supabase
        .from('credits')
        .update({ 
          amount_paid: newAmountPaid
        })
        .eq('id', selectedCredit.id);

      if (error) throw error;

      toast({
        title: 'Payment Recorded',
        description: `Payment of $${amount.toFixed(2)} has been recorded successfully`,
      });

      setIsPaymentDialogOpen(false);
      setPaymentAmount('');
      setSelectedCredit(null);
      fetchCredits();
    } catch (error) {
      console.error('Error recording payment:', error);
      toast({
        title: 'Error',
        description: 'Failed to record payment',
        variant: 'destructive',
      });
    }
  };

  const openEditDialog = (credit: Credit) => {
    setSelectedCredit(credit);
    setEditFormData({
      customer_name: credit.customer_name,
      amount_owed: credit.amount_owed.toString(),
      due_date: credit.due_date.split('T')[0],
      status: credit.status
    });
    setIsEditDialogOpen(true);
  };

  const handleEditSubmit = () => {
    setIsEditDialogOpen(false);
    setIsEditConfirmOpen(true);
  };

  const handleEditConfirm = async () => {
    if (!selectedCredit) return;

    try {
      const { error } = await supabase
        .from('credits')
        .update({
          customer_name: editFormData.customer_name,
          amount_owed: parseFloat(editFormData.amount_owed),
          due_date: editFormData.due_date,
          status: editFormData.status
        })
        .eq('id', selectedCredit.id);

      if (error) throw error;

      toast({
        title: 'Credit Updated',
        description: 'Credit record has been updated successfully',
      });

      setIsEditConfirmOpen(false);
      setSelectedCredit(null);
      fetchCredits();
    } catch (error) {
      console.error('Error updating credit:', error);
      toast({
        title: 'Error',
        description: 'Failed to update credit record',
        variant: 'destructive',
      });
    }
  };

  const openDeleteDialog = (credit: Credit) => {
    setSelectedCredit(credit);
    setIsDeleteDialogOpen(true);
  };

  const handleDeleteSubmit = () => {
    setIsDeleteDialogOpen(false);
    setIsDeleteConfirmOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!selectedCredit) return;

    try {
      const { error } = await supabase
        .from('credits')
        .delete()
        .eq('id', selectedCredit.id);

      if (error) throw error;

      toast({
        title: 'Credit Deleted',
        description: 'Credit record has been deleted successfully',
      });

      setIsDeleteConfirmOpen(false);
      setSelectedCredit(null);
      fetchCredits();
    } catch (error) {
      console.error('Error deleting credit:', error);
      toast({
        title: 'Error',
        description: 'Failed to delete credit record',
        variant: 'destructive',
      });
    }
  };

  const filteredCredits = credits.filter(credit =>
    credit.customer_name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getStatusBadgeVariant = (status: string) => {
    switch (status) {
      case 'paid':
        return 'default';
      case 'partially_paid':
        return 'secondary';
      case 'unpaid':
        return 'destructive';
      default:
        return 'outline';
    }
  };

  const formatCurrency = (amount: number) => `$${amount.toFixed(2)}`;

  const totalOutstanding = credits.reduce((sum, credit) => 
    sum + (credit.amount_owed - credit.amount_paid), 0
  );

  return (
    <div className="container mx-auto p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Credits & Debtors</h1>
        <p className="text-muted-foreground">Manage customer credit accounts and outstanding payments</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Outstanding</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(totalOutstanding)}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Credits</CardTitle>
            <User className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {credits.filter(c => c.status !== 'paid').length}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Overdue</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {credits.filter(c => 
                c.status !== 'paid' && new Date(c.due_date) < new Date()
              ).length}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <div>
              <CardTitle>Credit Accounts</CardTitle>
              <CardDescription>View and manage customer credit accounts</CardDescription>
            </div>
          </div>
          <div className="relative">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by customer name..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-8"
            />
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-4">Loading credits...</div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Customer</TableHead>
                    <TableHead>Amount Owed</TableHead>
                    <TableHead>Amount Paid</TableHead>
                    <TableHead>Outstanding</TableHead>
                    <TableHead>Due Date</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredCredits.map((credit) => {
                    const outstanding = credit.amount_owed - credit.amount_paid;
                    const isOverdue = new Date(credit.due_date) < new Date() && credit.status !== 'paid';
                    
                    return (
                      <TableRow key={credit.id} className={isOverdue ? 'bg-destructive/10' : ''}>
                        <TableCell className="font-medium">{credit.customer_name}</TableCell>
                        <TableCell>{formatCurrency(credit.amount_owed)}</TableCell>
                        <TableCell>{formatCurrency(credit.amount_paid)}</TableCell>
                        <TableCell className="font-semibold">{formatCurrency(outstanding)}</TableCell>
                        <TableCell>
                          {new Date(credit.due_date).toLocaleDateString()}
                          {isOverdue && <span className="text-destructive ml-1">(Overdue)</span>}
                        </TableCell>
                        <TableCell>
                          <Badge variant={getStatusBadgeVariant(credit.status)}>
                            {credit.status.replace('_', ' ')}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => openEditDialog(credit)}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => openDeleteDialog(credit)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                            {credit.status !== 'paid' && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  setSelectedCredit(credit);
                                  setIsPaymentDialogOpen(true);
                                }}
                              >
                                Record Payment
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {filteredCredits.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-4">
                        No credits found
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={isPaymentDialogOpen} onOpenChange={setIsPaymentDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record Payment</DialogTitle>
            <DialogDescription>
              Record a payment for {selectedCredit?.customer_name}
            </DialogDescription>
          </DialogHeader>
          {selectedCredit && (
            <div className="space-y-4">
              <div>
                <Label>Outstanding Balance</Label>
                <div className="text-lg font-semibold">
                  {formatCurrency(selectedCredit.amount_owed - selectedCredit.amount_paid)}
                </div>
              </div>
              <div>
                <Label htmlFor="payment-amount">Payment Amount</Label>
                <Input
                  id="payment-amount"
                  type="number"
                  step="0.01"
                  placeholder="Enter payment amount"
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value)}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsPaymentDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handlePayment}>Record Payment</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Credit Record</DialogTitle>
            <DialogDescription>
              Update credit details for {selectedCredit?.customer_name}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="edit-customer-name">Customer Name</Label>
              <Input
                id="edit-customer-name"
                value={editFormData.customer_name}
                onChange={(e) => setEditFormData(prev => ({ ...prev, customer_name: e.target.value }))}
              />
            </div>
            <div>
              <Label htmlFor="edit-amount-owed">Amount Owed</Label>
              <Input
                id="edit-amount-owed"
                type="number"
                step="0.01"
                value={editFormData.amount_owed}
                onChange={(e) => setEditFormData(prev => ({ ...prev, amount_owed: e.target.value }))}
              />
            </div>
            <div>
              <Label htmlFor="edit-due-date">Due Date</Label>
              <Input
                id="edit-due-date"
                type="date"
                value={editFormData.due_date}
                onChange={(e) => setEditFormData(prev => ({ ...prev, due_date: e.target.value }))}
              />
            </div>
            <div>
              <Label htmlFor="edit-status">Status</Label>
              <Select value={editFormData.status} onValueChange={(value: 'unpaid' | 'partially_paid' | 'paid') => setEditFormData(prev => ({ ...prev, status: value }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="unpaid">Unpaid</SelectItem>
                  <SelectItem value="partially_paid">Partially Paid</SelectItem>
                  <SelectItem value="paid">Paid</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleEditSubmit}>Update Credit</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={isEditConfirmOpen} onOpenChange={setIsEditConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Submission</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to update this credit record?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleEditConfirm}>Update</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={isDeleteConfirmOpen} onOpenChange={setIsDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Deletion</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this credit record? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteConfirm} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Credits;