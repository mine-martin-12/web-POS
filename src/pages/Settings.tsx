import React, { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { User, Building2, Lock } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';

const profileSchema = z.object({
  first_name: z.string().min(1, 'First name is required'),
  last_name: z.string().min(1, 'Last name is required'),
  email: z.string().email('Invalid email address'),
});

const businessSchema = z.object({
  business_name: z.string().min(1, 'Business name is required'),
});

const passwordSchema = z.object({
  current_password: z.string().min(1, 'Current password is required'),
  new_password: z.string().min(6, 'Password must be at least 6 characters'),
  confirm_password: z.string().min(6, 'Password confirmation is required'),
}).refine((data) => data.new_password === data.confirm_password, {
  message: "Passwords don't match",
  path: ["confirm_password"],
});

type ProfileFormData = z.infer<typeof profileSchema>;
type BusinessFormData = z.infer<typeof businessSchema>;
type PasswordFormData = z.infer<typeof passwordSchema>;

const Settings: React.FC = () => {
  const { profile, refreshProfile } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  const profileForm = useForm<ProfileFormData>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      first_name: profile?.first_name || '',
      last_name: profile?.last_name || '',
      email: profile?.email || '',
    },
  });

  const businessForm = useForm<BusinessFormData>({
    resolver: zodResolver(businessSchema),
    defaultValues: {
      business_name: profile?.business_name || '',
    },
  });

  const passwordForm = useForm<PasswordFormData>({
    resolver: zodResolver(passwordSchema),
    defaultValues: {
      current_password: '',
      new_password: '',
      confirm_password: '',
    },
  });

  const onUpdateProfile = async (data: ProfileFormData) => {
    try {
      setLoading(true);
      const { error } = await supabase
        .from('profiles')
        .update({
          first_name: data.first_name,
          last_name: data.last_name,
          email: data.email,
        })
        .eq('user_id', profile?.user_id);

      if (error) throw error;

      toast({ title: 'Success', description: 'Profile updated successfully' });
      await refreshProfile();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to update profile',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const onUpdateBusiness = async (data: BusinessFormData) => {
    if (profile?.role !== 'admin') {
      toast({
        title: 'Access Denied',
        description: 'Only administrators can update business settings',
        variant: 'destructive',
      });
      return;
    }

    try {
      setLoading(true);
      const { error } = await supabase
        .from('profiles')
        .update({
          business_name: data.business_name,
        })
        .eq('business_id', profile.business_id);

      if (error) throw error;

      toast({ title: 'Success', description: 'Business settings updated successfully' });
      await refreshProfile();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to update business settings',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const onUpdatePassword = async (data: PasswordFormData) => {
    try {
      setLoading(true);
      
      // First, verify the current password by attempting to sign in
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: profile?.email || '',
        password: data.current_password,
      });

      if (signInError) {
        toast({
          title: 'Error',
          description: 'Current password is incorrect',
          variant: 'destructive',
        });
        return;
      }

      // Update the password
      const { error } = await supabase.auth.updateUser({
        password: data.new_password,
      });

      if (error) throw error;

      toast({ title: 'Success', description: 'Password updated successfully' });
      passwordForm.reset();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to update password',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-foreground">Settings</h1>
        <p className="text-muted-foreground">Manage your account and business preferences</p>
      </div>

      <div className="grid gap-6">
        {/* Profile Settings */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5" />
              Profile Information
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Form {...profileForm}>
              <form onSubmit={profileForm.handleSubmit(onUpdateProfile)} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <FormField
                    control={profileForm.control}
                    name="first_name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>First Name</FormLabel>
                        <FormControl>
                          <Input {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={profileForm.control}
                    name="last_name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Last Name</FormLabel>
                        <FormControl>
                          <Input {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <FormField
                  control={profileForm.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input type="email" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button type="submit" disabled={loading}>
                  Update Profile
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>

        {/* Business Settings */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              Business Settings
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Form {...businessForm}>
              <form onSubmit={businessForm.handleSubmit(onUpdateBusiness)} className="space-y-4">
                <FormField
                  control={businessForm.control}
                  name="business_name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Business Name</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          disabled={profile?.role !== 'admin'}
                        />
                      </FormControl>
                      <FormMessage />
                      {profile?.role !== 'admin' && (
                        <p className="text-sm text-muted-foreground">
                          Only administrators can modify business settings
                        </p>
                      )}
                    </FormItem>
                  )}
                />
                <Button
                  type="submit"
                  disabled={loading || profile?.role !== 'admin'}
                >
                  Update Business Settings
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>

        {/* Security Settings */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Lock className="h-5 w-5" />
              Security
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Form {...passwordForm}>
              <form onSubmit={passwordForm.handleSubmit(onUpdatePassword)} className="space-y-4">
                <FormField
                  control={passwordForm.control}
                  name="current_password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Current Password</FormLabel>
                      <FormControl>
                        <Input type="password" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Separator />
                <FormField
                  control={passwordForm.control}
                  name="new_password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>New Password</FormLabel>
                      <FormControl>
                        <Input type="password" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={passwordForm.control}
                  name="confirm_password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Confirm New Password</FormLabel>
                      <FormControl>
                        <Input type="password" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button type="submit" disabled={loading}>
                  Update Password
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>

        {/* Account Information */}
        <Card>
          <CardHeader>
            <CardTitle>Account Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Role</p>
                <p className="text-sm text-foreground capitalize">{profile?.role}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Business</p>
                <p className="text-sm text-foreground">{profile?.business_name}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Member Since</p>
                <p className="text-sm text-foreground">
                  {profile?.created_at ? new Date(profile.created_at).toLocaleDateString() : 'N/A'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Settings;