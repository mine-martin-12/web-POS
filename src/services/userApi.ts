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
    console.log('Creating user with email:', userData.email);

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

    // Get current user's business info first
    const { data: currentUserProfile, error: profileError } = await supabase
      .from('profiles')
      .select('business_id, business_name')
      .eq('user_id', (await supabase.auth.getUser()).data.user?.id)
      .single();

    if (profileError || !currentUserProfile) {
      throw new Error('Unable to get current user business information');
    }

    // Create auth user first - this will fail if email already exists in Auth
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
      console.error('Auth user creation error:', authError);
      
      // Handle specific Supabase auth errors
      if (authError.message?.includes('already registered') || 
          authError.message?.includes('already exists') ||
          authError.message?.includes('duplicate')) {
        throw new Error('A user with this email already exists');
      }
      
      throw new Error(authError.message || 'Failed to create user authentication');
    }

    if (!authData.user) {
      throw new Error('User creation failed - no user returned');
    }

    console.log('Auth user created:', authData.user.id);

    // Wait for the profile to be created by the trigger and verify it exists
    let profile = null;
    let attempts = 0;
    const maxAttempts = 5;

    while (!profile && attempts < maxAttempts) {
      attempts++;
      console.log(`Attempting to fetch profile (attempt ${attempts})`);
      
      await new Promise(resolve => setTimeout(resolve, attempts * 500)); // Increasing delay
      
      const { data: profileData, error: fetchError } = await supabase
        .from('profiles')
        .select('*')
        .eq('user_id', authData.user.id)
        .single();

      if (!fetchError && profileData) {
        profile = profileData;
        break;
      }

      if (attempts === maxAttempts) {
        console.error('Profile creation failed after max attempts:', fetchError);
        
        // Clean up the auth user since profile creation failed
        try {
          await supabase.functions.invoke('admin-delete-user', {
            body: { userId: authData.user.id }
          });
        } catch (cleanupError) {
          console.error('Failed to cleanup auth user:', cleanupError);
        }
        
        throw new Error('Failed to create user profile. The user authentication has been cleaned up.');
      }
    }

    console.log('Profile created successfully:', profile);

    return {
      id: profile.user_id,
      name: `${profile.first_name} ${profile.last_name}`.trim(),
      email: profile.email,
      role: profile.role,
      created_at: profile.created_at
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
      console.log('Deleting user:', id);
      
      // Call the edge function to securely delete the user from both profiles and auth
      const { data, error } = await supabase.functions.invoke('admin-delete-user', {
        body: { userId: id }
      });

      if (error) {
        console.error('Edge function error:', error);
        throw new Error(error.message || 'Failed to delete user');
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
    } catch (error: any) {
      console.error('Delete user error:', error);
      throw new Error(error.message || 'Failed to delete user');
    }
  },
};