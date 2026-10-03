import { getErrorMessage } from "@/lib/errors";
import { User, CreateUserRequest, UpdateUserRequest } from '@/types/user';
import { supabase } from '@/integrations/supabase/client';

export const userApi = {
  async getUsers(): Promise<User[]> {
    const { data, error } = await supabase
      .from('profiles')
      .select('*, user_roles(role)')
      .order('created_at', { ascending: false });
    
    if (error) {
      throw new Error(getErrorMessage(error, 'Failed to fetch users'));
    }
    
    return data.map(profile => ({
      id: profile.user_id,
      name: `${profile.first_name} ${profile.last_name}`.trim(),
      email: profile.email,
      role: (Array.isArray(profile.user_roles) ? profile.user_roles[0]?.role : profile.user_roles?.role) ?? 'user',
      created_at: profile.created_at
    }));
  },

  async createUser(_userData: CreateUserRequest): Promise<User> {
    throw new Error('Adding staff now happens through invitations.');
  },

  async updateUser(_id: string, _userData: UpdateUserRequest): Promise<User> {
    throw new Error('Editing staff now happens through the manage-staff function.');
  },

  async deleteUser(id: string): Promise<void> {
    try {
      console.log('Deleting user:', id);
      
      // Call the edge function to securely delete the user from both profiles and auth
      const { data, error } = await supabase.functions.invoke('admin-delete-user', {
        body: { userId: id }
      });

      if (error) {
        console.error('Edge function error:', error);
        throw new Error(getErrorMessage(error, 'Failed to delete user'));
      }

      if (data?.error) {
        console.error('Delete user error:', data.error);
        throw new Error(data.error);
      }

      if (!data?.success) {
        throw new Error('User deletion was not confirmed');
      }

      console.log('User deleted successfully:', data);
      
      // Add a small delay to ensure cleanup
      await new Promise(resolve => setTimeout(resolve, 500));
    } catch (error) {
      console.error('Delete user error:', error);
      throw new Error(getErrorMessage(error, 'Failed to delete user'));
    }
  },
};