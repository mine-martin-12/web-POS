import React, { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { toast } from "sonner";
import { MailCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form } from "@/components/ui/form";
import { TextField } from "@/components/common/form-fields";
import { emailField } from "@/lib/validation";

const schema = z.object({ email: emailField });
type FormData = z.infer<typeof schema>;

interface ForgotPasswordModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultEmail?: string;
}

const ForgotPasswordModal: React.FC<ForgotPasswordModalProps> = ({ isOpen, onClose, defaultEmail = "" }) => {
  const [sentTo, setSentTo] = useState<string | null>(null);
  const form = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { email: defaultEmail },
    reValidateMode: "onSubmit",
  });

  const close = () => {
    form.reset({ email: defaultEmail });
    setSentTo(null);
    onClose();
  };

  const onSubmit = async ({ email }: FormData) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) {
      toast.error("Couldn't send the reset link", {
        description: /rate limit/i.test(error.message)
          ? "Too many requests. Please wait a minute and try again."
          : error.message,
      });
      return;
    }
    // Same message whether or not the account exists, so emails can't be probed.
    setSentTo(email);
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && close()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Reset your password</DialogTitle>
          <DialogDescription>
            {sentTo
              ? "Check your inbox for the reset link."
              : "Enter your email and we'll send you a link to choose a new password."}
          </DialogDescription>
        </DialogHeader>

        {sentTo ? (
          <div className="space-y-4">
            <div className="flex flex-col items-center gap-3 py-2 text-center">
              <MailCheck className="h-10 w-10 text-success" aria-hidden />
              <p className="text-sm text-muted-foreground">
                If an account exists for <strong className="text-foreground">{sentTo}</strong>, a reset link is on
                its way. It expires in one hour.
              </p>
            </div>
            <DialogFooter>
              <Button onClick={close} className="w-full sm:w-auto">
                Close
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
              <TextField
                control={form.control}
                clearErrors={form.clearErrors}
                name="email"
                label="Email address"
                type="email"
                autoComplete="email"
                autoFocus
              />
              <DialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:gap-0">
                <Button type="button" variant="outline" onClick={close}>
                  Cancel
                </Button>
                <Button type="submit" disabled={form.formState.isSubmitting}>
                  {form.formState.isSubmitting ? "Sending…" : "Send reset link"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default ForgotPasswordModal;
