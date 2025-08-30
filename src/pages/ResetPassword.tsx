import React, { useState, useEffect } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Eye, EyeOff, Building2, AlertTriangle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import PasswordStrengthIndicator, { validatePassword } from '@/components/auth/PasswordStrengthIndicator';

const ResetPassword = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // Redirect if already authenticated and not in reset flow
  useEffect(() => {
    const hashParams = new URLSearchParams(window.location.hash.substring(1));
    const accessToken = hashParams.get('access_token');
    const type = hashParams.get('type');
    
    if (!accessToken || type !== 'recovery') {
      if (user) {
        navigate('/dashboard');
      } else {
        navigate('/auth');
      }
    }
  }, [user, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      // Validate password strength
      const passwordValidation = validatePassword(password);
      if (!passwordValidation.isValid) {
        toast({
          title: "Weak Password",
          description: "Password must meet all security requirements.",
          variant: "destructive"
        });
        return;
      }

      // Check password confirmation
      if (password !== confirmPassword) {
        toast({
          title: "Password Mismatch",
          description: "Passwords do not match. Please try again.",
          variant: "destructive"
        });
        return;
      }

      // Update password
      const { error } = await supabase.auth.updateUser({
        password: password
      });

      if (error) {
        toast({
          title: "Error",
          description: error.message,
          variant: "destructive"
        });
      } else {
        toast({
          title: "Success",
          description: "Your password has been updated successfully!"
        });
        navigate('/dashboard');
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: "An unexpected error occurred. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-muted p-4">
      <div className="w-full max-w-md animate-fade-in-up">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-primary rounded-2xl mb-4 shadow-glow">
            <Building2 className="h-8 w-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-foreground">Smart POS</h1>
          <p className="text-muted-foreground mt-2">Reset Your Password</p>
        </div>

        <Card className="card-elevated">
          <CardHeader className="text-center">
            <CardTitle className="flex items-center justify-center gap-2">
              <AlertTriangle className="h-5 w-5 text-orange-500" />
              Reset Password
            </CardTitle>
            <CardDescription>
              Enter your new password below
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="new-password">New Password</Label>
                <div className="relative">
                  <Input
                    id="new-password"
                    type={showPassword ? "text" : "password"}
                    placeholder="Enter your new password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </Button>
                </div>
                <PasswordStrengthIndicator password={password} className="mt-2" />
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirm-password">Confirm New Password</Label>
                <Input
                  id="confirm-password"
                  type={showPassword ? "text" : "password"}
                  placeholder="Confirm your new password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                />
                {confirmPassword && password !== confirmPassword && (
                  <p className="text-sm text-red-600 dark:text-red-400">
                    Passwords do not match
                  </p>
                )}
              </div>

              <Button 
                type="submit" 
                className="w-full btn-gradient-primary"
                disabled={isLoading || !password || !confirmPassword || password !== confirmPassword}
              >
                {isLoading ? 'Updating Password...' : 'Update Password'}
              </Button>
            </form>
          </CardContent>
        </Card>

        <p className="text-center text-sm text-muted-foreground mt-4">
          After updating your password, you'll be redirected to the dashboard.
        </p>
      </div>
    </div>
  );
};

export default ResetPassword;