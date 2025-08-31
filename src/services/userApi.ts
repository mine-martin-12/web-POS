import { User, CreateUserRequest, UpdateUserRequest } from '@/types/user';
import { supabase } from '@/integrations/supabase/client';
import { useCSRFProtection } from '@/hooks/useCSRFProtection';

export const userApi = {
  async getUsers(): Promise<User[]> {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (error) {
      throw new Error(error.message || 'Failed to fetch users');
    }
    
    return data.map(profile => ({
      id: profile.user_id,
      name: `${profile.first_name} ${profile.last_name}`.trim(),
      email: profile.email,
      role: profile.role as 'admin' | 'user',
      created_at: profile.created_at
    }));
  },

  async createUser(userData: CreateUserRequest, csrfToken?: string): Promise<User> {
    // Basic CSRF protection check (optional, for additional security)
    if (csrfToken && typeof window !== 'undefined') {
      const storedToken = localStorage.getItem('csrf_token');
      if (storedToken) {
        try {
          const parsed = JSON.parse(storedToken);
          if (parsed.token !== csrfToken) {
            throw new Error('Invalid security token');
          }
        } catch {
          throw new Error('Invalid security token');
        }
      }
    }

    // Check if email already exists
    const { data: existingUser, error: checkError } = await supabase
      .from('profiles')
      .select('email')
      .eq('email', userData.email)
      .maybeSingle();

    if (checkError) {
      throw new Error('Failed to check email availability');
    }

    if (existingUser) {
      throw new Error('This email is already registered. Please log in or use a different email.');
    }

    // Get current user's business info
    const { data: currentUserProfile, error: profileError } = await supabase
      .from('profiles')
      .select('business_id, business_name')
      .eq('user_id', (await supabase.auth.getUser()).data.user?.id)
      .single();

    if (profileError || !currentUserProfile) {
      throw new Error('Unable to get current user business information');
    }

    // Create auth user first
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email: userData.email,
      password: userData.password,
      options: {
        emailRedirectTo: `${window.location.origin}/`,
        data: {
          first_name: userData.name.split(' ')[0] || userData.name,
          last_name: userData.name.split(' ').slice(1).join(' ') || '',
          role: userData.role,
          business_id: currentUserProfile.business_id,
          business_name: currentUserProfile.business_name
        }
      }
    });

    if (authError) {
      // Handle specific Supabase auth errors
      if (authError.message.includes('already registered')) {
        throw new Error('This email is already registered. Please log in or use a different email.');
      }
      throw new Error(authError.message || 'Failed to create user');
    }

    if (!authData.user) {
      throw new Error('Failed to create user');
    }

    return {
      id: authData.user.id,
      name: userData.name,
      email: userData.email,
      role: userData.role,
      created_at: new Date().toISOString()
    };
  },

  async updateUser(id: string, userData: UpdateUserRequest): Promise<User> {
    const { data, error } = await supabase
      .from('profiles')
      .update({
        first_name: userData.name.split(' ')[0] || userData.name,
        last_name: userData.name.split(' ').slice(1).join(' ') || '',
        email: userData.email,
        role: userData.role,
        updated_at: new Date().toISOString()
      })
      .eq('user_id', id)
      .select()
      .maybeSingle();
    
    if (error) {
      throw new Error(error.message || 'Failed to update user');
    }
    
    if (!data) {
      throw new Error('User not found');
    }
    
    return {
      id: data.user_id,
      name: `${data.first_name} ${data.last_name}`.trim(),
      email: data.email,
      role: data.role as 'admin' | 'user',
      created_at: data.created_at
    };
  },

  async deleteUser(id: string): Promise<void> {
    try {
      // Call the edge function to securely delete the user from both profiles and auth
      const { data, error } = await supabase.functions.invoke('admin-delete-user', {
        body: { userId: id }
      });

      if (error) {
        console.error('Edge function error:', error);
        throw new Error(error.message || 'Failed to delete user');
      }

      if (!data?.success) {
        throw new Error(data?.error || 'Failed to delete user');
      }
    } catch (error: any) {
      console.error('Delete user error:', error);
      throw new Error(error.message || 'Failed to delete user');
    }
  },
};