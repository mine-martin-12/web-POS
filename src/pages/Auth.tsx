import React, { useState } from "react";
import { Navigate, useLocation, useSearchParams } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form } from "@/components/ui/form";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AuthShell } from "@/components/auth/AuthShell";
import ForgotPasswordModal from "@/components/auth/ForgotPasswordModal";
import PasswordStrengthIndicator from "@/components/auth/PasswordStrengthIndicator";
import { TextField } from "@/components/common/form-fields";
import { emailField, requiredText, strongPassword, invalidSummary } from "@/lib/validation";

const signInSchema = z.object({
  email: emailField,
  password: z.string().min(1, "Password is required"),
});
type SignInData = z.infer<typeof signInSchema>;

const signUpSchema = z.object({
  businessName: requiredText("Business name", 120),
  firstName: requiredText("First name"),
  lastName: requiredText("Last name"),
  email: emailField,
  password: strongPassword,
});
type SignUpData = z.infer<typeof signUpSchema>;

type Tab = "signin" | "signup";

const Auth = () => {
  const { user, profile, isRecoveryMode, signIn, signUpBusiness } = useAuth();
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const tab: Tab = params.get("tab") === "signup" ? "signup" : "signin";

  const signInForm = useForm<SignInData>({
    resolver: zodResolver(signInSchema),
    defaultValues: { email: "", password: "" },
    reValidateMode: "onSubmit",
  });
  const signUpForm = useForm<SignUpData>({
    resolver: zodResolver(signUpSchema),
    defaultValues: { businessName: "", firstName: "", lastName: "", email: "", password: "" },
    reValidateMode: "onSubmit",
  });

  if (isRecoveryMode) return <Navigate to="/reset-password" replace />;
  if (user && profile) {
    const from = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname;
    return <Navigate to={from && from !== "/auth" ? from : "/app"} replace />;
  }

  const onSignIn = async (data: SignInData) => {
    const { error } = await signIn(data.email, data.password);
    if (error) {
      signInForm.setError("password", { message: error });
      toast.error("Couldn't sign in", { description: error });
      return;
    }
    toast.success("Welcome back");
  };

  const onSignUp = async (data: SignUpData) => {
    const { error } = await signUpBusiness(data as Required<SignUpData>);
    if (error) {
      if (/business/i.test(error)) signUpForm.setError("businessName", { message: error });
      else if (/email/i.test(error)) signUpForm.setError("email", { message: error });
      toast.error("Couldn't create your business", { description: error });
      return;
    }
    toast.success(`Welcome to Smart POS`, { description: `${data.businessName} is ready. You're its admin.` });
  };

  const onInvalid = (errors: Record<string, unknown>) => {
    const { title, description } = invalidSummary(errors);
    toast.error(title, { description });
  };

  const signUpPassword = signUpForm.watch("password");

  return (
    <AuthShell subtitle="Modern POS Management System">
      <Card className="card-elevated">
        <CardHeader className="text-center">
          <CardTitle>{tab === "signin" ? "Welcome back" : "Start your business account"}</CardTitle>
          <CardDescription>
            {tab === "signin"
              ? "Sign in to your account"
              : "You'll be the admin and can invite your staff afterwards."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs
            value={tab}
            onValueChange={(value) => setParams(value === "signup" ? { tab: "signup" } : {}, { replace: true })}
            className="w-full"
          >
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="signin">Sign in</TabsTrigger>
              <TabsTrigger value="signup">New business</TabsTrigger>
            </TabsList>

            <TabsContent value="signin">
              <Form {...signInForm}>
                <form onSubmit={signInForm.handleSubmit(onSignIn, onInvalid)} className="space-y-4" noValidate>
                  <TextField
                    control={signInForm.control}
                    clearErrors={signInForm.clearErrors}
                    name="email"
                    label="Email"
                    type="email"
                    autoComplete="email"
                    placeholder="you@business.com"
                  />
                  <TextField
                    control={signInForm.control}
                    clearErrors={signInForm.clearErrors}
                    name="password"
                    label="Password"
                    type="password"
                    autoComplete="current-password"
                  />
                  <div className="flex justify-end">
                    <Button
                      type="button"
                      variant="link"
                      size="sm"
                      className="h-auto px-0"
                      onClick={() => setShowForgotPassword(true)}
                    >
                      Forgot password?
                    </Button>
                  </div>
                  <Button type="submit" className="w-full btn-gradient-primary" disabled={signInForm.formState.isSubmitting}>
                    {signInForm.formState.isSubmitting ? "Signing in…" : "Sign in"}
                  </Button>
                  <p className="text-center text-sm text-muted-foreground">
                    Joining an existing business? Ask your admin for an invitation.
                  </p>
                </form>
              </Form>
            </TabsContent>

            <TabsContent value="signup">
              <Form {...signUpForm}>
                <form onSubmit={signUpForm.handleSubmit(onSignUp, onInvalid)} className="space-y-4" noValidate>
                  <TextField
                    control={signUpForm.control}
                    clearErrors={signUpForm.clearErrors}
                    name="businessName"
                    label="Business name"
                    autoComplete="organization"
                    placeholder="e.g. Mama Mboga Traders"
                  />
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <TextField
                      control={signUpForm.control}
                      clearErrors={signUpForm.clearErrors}
                      name="firstName"
                      label="First name"
                      autoComplete="given-name"
                    />
                    <TextField
                      control={signUpForm.control}
                      clearErrors={signUpForm.clearErrors}
                      name="lastName"
                      label="Last name"
                      autoComplete="family-name"
                    />
                  </div>
                  <TextField
                    control={signUpForm.control}
                    clearErrors={signUpForm.clearErrors}
                    name="email"
                    label="Email"
                    type="email"
                    autoComplete="email"
                  />
                  <TextField
                    control={signUpForm.control}
                    clearErrors={signUpForm.clearErrors}
                    name="password"
                    label="Password"
                    type="password"
                    autoComplete="new-password"
                  />
                  <PasswordStrengthIndicator password={signUpPassword} />
                  <Button type="submit" className="w-full btn-gradient-primary" disabled={signUpForm.formState.isSubmitting}>
                    {signUpForm.formState.isSubmitting ? "Creating your business…" : "Create business"}
                  </Button>
                </form>
              </Form>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <ForgotPasswordModal isOpen={showForgotPassword} onClose={() => setShowForgotPassword(false)} />
    </AuthShell>
  );
};

export default Auth;
