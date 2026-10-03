import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { toast } from "sonner";
import { CheckCircle2, KeyRound } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form } from "@/components/ui/form";
import { AuthShell } from "@/components/auth/AuthShell";
import ForgotPasswordModal from "@/components/auth/ForgotPasswordModal";
import PasswordStrengthIndicator from "@/components/auth/PasswordStrengthIndicator";
import { TextField, invalidSummary } from "@/components/common/form-fields";
import { strongPassword } from "@/lib/validation";

const schema = z
  .object({
    password: strongPassword,
    confirm: z.string().min(1, "Please confirm your new password"),
  })
  .refine((d) => d.password === d.confirm, { message: "Passwords don't match", path: ["confirm"] });
type FormData = z.infer<typeof schema>;

const REDIRECT_AFTER_MS = 3000;

const ResetPassword = () => {
  const { user, isLoading } = useAuth();
  const navigate = useNavigate();
  const [done, setDone] = useState(false);
  const [requestNew, setRequestNew] = useState(false);
  const form = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { password: "", confirm: "" },
    reValidateMode: "onSubmit",
  });

  // Supabase puts link problems (expired, already used) in the URL hash.
  const linkError = useMemo(() => {
    const hash = new URLSearchParams(window.location.hash.substring(1));
    const query = new URLSearchParams(window.location.search);
    return hash.get("error_description") ?? query.get("error_description");
  }, []);

  useEffect(() => {
    if (!done) return;
    const timer = window.setTimeout(() => navigate("/dashboard", { replace: true }), REDIRECT_AFTER_MS);
    return () => window.clearTimeout(timer);
  }, [done, navigate]);

  const onSubmit = async ({ password }: FormData) => {
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      toast.error("Couldn't update your password", { description: error.message });
      return;
    }
    window.history.replaceState(null, "", window.location.pathname);
    setDone(true);
  };

  const password = form.watch("password");

  let content: React.ReactNode;
  if (isLoading) {
    content = (
      <Card>
        <CardContent className="py-10 text-center text-muted-foreground">Checking your reset link…</CardContent>
      </Card>
    );
  } else if (done) {
    content = (
      <Card className="card-elevated">
        <CardContent className="flex flex-col items-center gap-4 py-10 text-center">
          <CheckCircle2 className="h-12 w-12 text-success" aria-hidden />
          <div>
            <h2 className="text-xl font-semibold">Password updated</h2>
            <p className="mt-1 text-sm text-muted-foreground">Taking you to your dashboard…</p>
          </div>
          <Button onClick={() => navigate("/dashboard", { replace: true })}>Continue now</Button>
        </CardContent>
      </Card>
    );
  } else if (!user) {
    content = (
      <Card className="card-elevated">
        <CardHeader>
          <CardTitle>Reset link not valid</CardTitle>
          <CardDescription>{linkError ?? "This reset link is invalid or has expired."}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 sm:flex-row">
          <Button onClick={() => setRequestNew(true)} className="w-full sm:w-auto">
            Send a new link
          </Button>
          <Button variant="outline" asChild className="w-full sm:w-auto">
            <Link to="/auth">Back to sign in</Link>
          </Button>
        </CardContent>
      </Card>
    );
  } else {
    content = (
      <Card className="card-elevated">
        <CardHeader className="text-center">
          <CardTitle className="flex items-center justify-center gap-2">
            <KeyRound className="h-5 w-5 text-primary" aria-hidden />
            Choose a new password
          </CardTitle>
          <CardDescription>For {user.email}</CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form
              onSubmit={form.handleSubmit(onSubmit, (errors) => {
                const { title, description } = invalidSummary(errors);
                toast.error(title, { description });
              })}
              className="space-y-4"
              noValidate
            >
              <TextField
                control={form.control}
                clearErrors={form.clearErrors}
                name="password"
                label="New password"
                type="password"
                autoComplete="new-password"
                autoFocus
              />
              <PasswordStrengthIndicator password={password} />
              <TextField
                control={form.control}
                clearErrors={form.clearErrors}
                name="confirm"
                label="Confirm new password"
                type="password"
                autoComplete="new-password"
              />
              <Button type="submit" className="w-full btn-gradient-primary" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? "Saving…" : "Update password"}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
    );
  }

  return (
    <AuthShell subtitle="Reset your password">
      {content}
      <ForgotPasswordModal isOpen={requestNew} onClose={() => setRequestNew(false)} />
    </AuthShell>
  );
};

export default ResetPassword;
