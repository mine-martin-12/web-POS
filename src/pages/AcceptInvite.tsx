import React, { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { toast } from "sonner";
import { Building2, Eye, EyeOff } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { getErrorMessage } from "@/lib/errors";
import { strongPassword } from "@/lib/validation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import PasswordStrengthIndicator from "@/components/auth/PasswordStrengthIndicator";

const schema = z
  .object({
    password: strongPassword,
    confirm: z.string().min(1, "Please confirm your password"),
  })
  .refine((d) => d.password === d.confirm, { message: "Passwords don't match", path: ["confirm"] });
type FormData = z.infer<typeof schema>;

/** Landing page for staff invitation links: the link signs the invitee in, and here they
 *  choose a password, which marks the invitation as accepted. */
const AcceptInvite: React.FC = () => {
  const { user, profile, business, isLoading, isLoadingRole } = useAuth();
  const navigate = useNavigate();
  const [showPassword, setShowPassword] = useState(false);
  const [saving, setSaving] = useState(false);
  const form = useForm<FormData>({ resolver: zodResolver(schema), defaultValues: { password: "", confirm: "" } });

  // Supabase reports expired/used links in the URL hash.
  const linkError = useMemo(() => {
    const params = new URLSearchParams(window.location.hash.substring(1));
    return params.get("error_description");
  }, []);

  const onSubmit = async (data: FormData) => {
    setSaving(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: data.password });
      if (error) throw error;
      const { error: completeError } = await supabase.rpc("complete_invitation");
      if (completeError) throw completeError;
      toast.success(business ? `Welcome to ${business.name}` : "Welcome aboard", {
        description: "Your password is set. Use it to sign in next time.",
      });
      navigate("/dashboard", { replace: true });
    } catch (error) {
      toast.error("Couldn't set your password", { description: getErrorMessage(error) });
    } finally {
      setSaving(false);
    }
  };

  const password = form.watch("password");

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-muted p-4">
      <div className="w-full max-w-md animate-fade-in-up">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-primary rounded-2xl mb-4 shadow-glow">
            <Building2 className="h-8 w-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-foreground">Smart POS</h1>
        </div>

        {isLoading || isLoadingRole ? (
          <Card>
            <CardContent className="py-10 text-center text-muted-foreground">Checking your invitation…</CardContent>
          </Card>
        ) : !user || !profile ? (
          <Card>
            <CardHeader>
              <CardTitle>Invitation link not valid</CardTitle>
              <CardDescription>
                {linkError ?? "This invitation link is invalid or has expired."} Ask your administrator to send a new
                one.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild className="w-full">
                <Link to="/auth">Go to sign in</Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>Join {business?.name ?? "your team"}</CardTitle>
              <CardDescription>
                Hi {profile.first_name}, choose a password for {profile.email}.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
                  <FormField
                    control={form.control}
                    name="password"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Password</FormLabel>
                        <div className="relative">
                          <FormControl>
                            <Input type={showPassword ? "text" : "password"} autoComplete="new-password" {...field} />
                          </FormControl>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                            onClick={() => setShowPassword((s) => !s)}
                            aria-label={showPassword ? "Hide password" : "Show password"}
                            aria-pressed={showPassword}
                          >
                            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </Button>
                        </div>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <PasswordStrengthIndicator password={password} />
                  <FormField
                    control={form.control}
                    name="confirm"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Confirm password</FormLabel>
                        <FormControl>
                          <Input type={showPassword ? "text" : "password"} autoComplete="new-password" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <Button type="submit" className="w-full" disabled={saving}>
                    {saving ? "Saving…" : "Set password and continue"}
                  </Button>
                </form>
              </Form>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
};

export default AcceptInvite;
