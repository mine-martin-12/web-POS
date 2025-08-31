import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { validatePassword } from '@/components/auth/PasswordStrengthIndicator';

interface Profile {
  id: string;
  user_id: string;
  email: string;
  first_name: string;
  last_name: string;
  role: 'admin' | 'user';
  business_id: string;
  business_name: string;
  created_at: string;
  updated_at: string;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  isLoading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: any }>;
  signUp: (email: string, password: string, firstName: string, lastName: string, businessName: string) => Promise<{ error: any }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();

  const fetchProfile = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('user_id', userId)
        .single();

      if (error) {
        console.error('Error fetching profile:', error);
        return null;
      }

      return data as Profile;
    } catch (error) {
      console.error('Error in fetchProfile:', error);
      return null;
    }
  };

  const refreshProfile = async () => {
    if (user) {
      const userProfile = await fetchProfile(user.id);
      setProfile(userProfile);
    }
  };

  useEffect(() => {
    // Set up auth state listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        
        if (session?.user) {
          // Defer profile fetching to avoid auth state callback issues
          setTimeout(async () => {
            const userProfile = await fetchProfile(session.user.id);
            setProfile(userProfile);
            setIsLoading(false);
          }, 0);
        } else {
          setProfile(null);
          setIsLoading(false);
        }
      }
    );

    // Check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      
      if (session?.user) {
        setTimeout(async () => {
          const userProfile = await fetchProfile(session.user.id);
          setProfile(userProfile);
          setIsLoading(false);
        }, 0);
      } else {
        setIsLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const signIn = async (email: string, password: string) => {
    try {
      setIsLoading(true);
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        toast({
          title: "Error",
          description: error.message,
          variant: "destructive",
        });
        return { error };
      }

      if (data.user) {
        // Check if user has a valid profile
        const { data: profileData, error: profileError } = await supabase
          .from('profiles')
          .select('*')
          .eq('user_id', data.user.id)
          .single();

        if (profileError || !profileData) {
          // User exists in auth but not in profiles - sign them out immediately
          await supabase.auth.signOut();
          toast({
            title: "Access Denied",
            description: "Your account has been disabled. Please contact your administrator.",
            variant: "destructive",
          });
          return { error: new Error('Account disabled') };
        }

        toast({
          title: "Success",
          description: "Signed in successfully!",
        });
      }

      return { error: null };
    } catch (error: any) {
      toast({
        title: "Error",
        description: "An unexpected error occurred. Please try again.",
        variant: "destructive",
      });
      return { error };
    } finally {
      setIsLoading(false);
    }
  };

  const signUp = async (email: string, password: string, firstName: string, lastName: string, businessName: string) => {
    try {
      // Validate password strength
      const passwordValidation = validatePassword(password);
      if (!passwordValidation.isValid) {
        toast({
          title: "Weak Password",
          description: "Password must be at least 8 characters with uppercase, lowercase, number, and special character.",
          variant: "destructive"
        });
        return { error: new Error('Password does not meet requirements') };
      }

      // Check if email already exists
      const { data: existingUser, error: checkError } = await supabase
        .from('profiles')
        .select('email')
        .eq('email', email)
        .maybeSingle();

      if (checkError) {
        toast({
          title: "Error",
          description: "Failed to validate email. Please try again.",
          variant: "destructive"
        });
        return { error: checkError };
      }

      if (existingUser) {
        const error = new Error('This email is already registered. Please log in or use a different email.');
        toast({
          title: "Email Already Exists",
          description: error.message,
          variant: "destructive"
        });
        return { error };
      }

      const redirectUrl = `${window.location.origin}/`;
      
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: redirectUrl,
          data: {
            first_name: firstName,
            last_name: lastName,
            business_name: businessName,
            role: 'admin' // First user in business becomes admin
          }
        }
      });

      if (error) {
        // Handle specific Supabase auth errors
        if (error.message.includes('already registered')) {
          toast({
            title: "Email Already Exists",
            description: "This email is already registered. Please log in or use a different email.",
            variant: "destructive"
          });
        } else {
          toast({
            title: "Error",
            description: error.message,
            variant: "destructive"
          });
        }
      } else {
        toast({
          title: "Success",
          description: "Account created successfully! Please check your email to verify your account."
        });
      }

      return { error };
    } catch (error: any) {
      toast({
        title: "Error", 
        description: "An unexpected error occurred",
        variant: "destructive"
      });
      return { error };
    }
  };

  const signOut = async () => {
    try {
      // Clear any existing timeouts/intervals
      const allTimeouts = window.setTimeout(() => {}, 0);
      for (let i = 1; i < allTimeouts; i++) {
        window.clearTimeout(i);
      }

      // Sign out from Supabase (this will revoke the refresh token)
      await supabase.auth.signOut();
      
      // Clear local state
      setUser(null);
      setSession(null);
      setProfile(null);
      
      // Clear any CSRF tokens or other security-related data
      localStorage.removeItem('csrf_token');
      
      toast({
        title: "Success",
        description: "Signed out successfully!"
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: "Error signing out",
        variant: "destructive"
      });
    }
  };

  const value = {
    user,
    session,
    profile,
    isLoading,
    signIn,
    signUp,
    signOut,
    refreshProfile
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};