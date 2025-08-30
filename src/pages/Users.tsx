import React, { useState, useEffect } from 'react';
import { User } from '@/types/user';
import { userApi } from '@/services/userApi';
import { UserModal } from '@/components/users/UserModal';
import { DeleteConfirmationModal } from '@/components/users/DeleteConfirmationModal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Search, Plus, Edit, Trash2 } from 'lucide-react';

const Users: React.FC = () => {
  const { toast } = useToast();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [isUserModalOpen, setIsUserModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [deletingUser, setDeletingUser] = useState<User | null>(null);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const data = await userApi.getUsers();
      setUsers(data);
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to load users',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const filteredUsers = users.filter(
    (user) =>
      user.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleAddUser = () => {
    setEditingUser(null);
    setIsUserModalOpen(true);
  };

  const handleEditUser = (user: User) => {
    setEditingUser(user);
    setIsUserModalOpen(true);
  };

  const handleDeleteUser = (user: User) => {
    setDeletingUser(user);
    setIsDeleteModalOpen(true);
  };

  const handleUserModalClose = () => {
    setIsUserModalOpen(false);
    setEditingUser(null);
  };

  const handleDeleteModalClose = () => {
    setIsDeleteModalOpen(false);
    setDeletingUser(null);
  };

  const handleSuccess = () => {
    fetchUsers();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Users</h1>
          <p className="text-muted-foreground">
            Manage system users and their access levels
          </p>
        </div>
        <Button onClick={handleAddUser} className="flex items-center gap-2">
          <Plus className="h-4 w-4" />
          Add User
        </Button>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <CardTitle>User Management</CardTitle>
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search users..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-8"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8">
              <div className="text-muted-foreground">Loading users...</div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredUsers.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center py-8">
                        <div className="text-muted-foreground">
                          {searchTerm ? 'No users match your search.' : 'No users found.'}
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredUsers.map((user) => (
                      <TableRow key={user.id}>
                        <TableCell className="font-medium">{user.name}</TableCell>
                        <TableCell>{user.email}</TableCell>
                        <TableCell>
                          <Badge
                            variant={user.role === 'admin' ? 'default' : 'secondary'}
                          >
                            {user.role}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleEditUser(user)}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleDeleteUser(user)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <UserModal
        isOpen={isUserModalOpen}
        onClose={handleUserModalClose}
        onSuccess={handleSuccess}
        user={editingUser}
      />

      <DeleteConfirmationModal
        isOpen={isDeleteModalOpen}
        onClose={handleDeleteModalClose}
        onSuccess={handleSuccess}
        user={deletingUser}
      />
    </div>
  );
};

export default Users;