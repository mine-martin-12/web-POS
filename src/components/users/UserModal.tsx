import React, { useState, useEffect } from 'react';
import { User, CreateUserRequest, UpdateUserRequest } from '@/types/user';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { userApi } from '@/services/userApi';

interface UserModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  user?: User | null;
}

export const UserModal: React.FC<UserModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  user,
}) => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    role: 'user' as 'admin' | 'user',
    password: '',
  });

  const isEditing = !!user;

  useEffect(() => {
    if (user) {
      setFormData({
        name: user.name,
        email: user.email,
        role: user.role,
        password: '',
      });
    } else {
      setFormData({
        name: '',
        email: '',
        role: 'user',
        password: '',
      });
    }
  }, [user]);

  const validateForm = () => {
    if (!formData.name.trim()) {
      toast({
        title: 'Error',
        description: 'Name is required',
        variant: 'destructive',
      });
      return false;
    }

    if (!formData.email.trim()) {
      toast({
        title: 'Error',
        description: 'Email is required',
        variant: 'destructive',
      });
      return false;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(formData.email)) {
      toast({
        title: 'Error',
        description: 'Please enter a valid email address',
        variant: 'destructive',
      });
      return false;
    }

    if (!isEditing && !formData.password.trim()) {
      toast({
        title: 'Error',
        description: 'Password is required',
        variant: 'destructive',
      });
      return false;
    }

    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) return;

    setLoading(true);

    try {
      if (isEditing && user) {
        const updateData: UpdateUserRequest = {
          name: formData.name.trim(),
          email: formData.email.trim(),
          role: formData.role,
        };
        await userApi.updateUser(user.id, updateData);
        toast({
          title: 'Success',
          description: 'User updated successfully',
        });
      } else {
        const createData: CreateUserRequest = {
          name: formData.name.trim(),
          email: formData.email.trim(),
          role: formData.role,
          password: formData.password,
        };
        await userApi.createUser(createData);
        toast({
          title: 'Success',
          description: 'User created successfully',
        });
      }
      onSuccess();
      onClose();
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'An error occurred',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? 'Edit User' : 'Add New User'}
          </DialogTitle>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="Enter full name"
              disabled={loading}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              placeholder="Enter email address"
              disabled={loading}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="role">Role</Label>
            <Select
              value={formData.role}
              onValueChange={(value: 'admin' | 'user') => 
                setFormData({ ...formData, role: value })
              }
              disabled={loading}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select a role" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="user">User</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {!isEditing && (
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                placeholder="Enter password"
                disabled={loading}
              />
            </div>
          )}

          <div className="flex justify-end space-x-2 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Saving...' : isEditing ? 'Update' : 'Create'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};