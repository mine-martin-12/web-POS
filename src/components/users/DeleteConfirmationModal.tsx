import React, { useState } from 'react';
import { User } from '@/types/user';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { userApi } from '@/services/userApi';

interface DeleteConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  user: User | null;
}

export const DeleteConfirmationModal: React.FC<DeleteConfirmationModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  user,
}) => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  const handleDelete = async () => {
    if (!user) return;

    setLoading(true);

    try {
      await userApi.deleteUser(user.id);
      toast({
        title: 'Success',
        description: 'User deleted successfully',
      });
      onSuccess();
      onClose();
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to delete user',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <AlertDialog open={isOpen} onOpenChange={onClose}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete User</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to delete <strong>{user?.name}</strong>? This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={loading}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDelete}
            disabled={loading}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {loading ? 'Deleting...' : 'Delete'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};