import React, { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { toast } from "sonner";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { getErrorMessage } from "@/lib/errors";
import { ROLE_LABELS } from "@/lib/permissions";
import { emailField } from "@/lib/validation";
import type { InviteInput } from "../api";
import { useInviteMember } from "../hooks";

const schema = z.object({
  firstName: z.string().trim().max(100),
  lastName: z.string().trim().max(100),
  email: emailField,
  role: z.enum(["user", "admin"]),
  delivery: z.enum(["email", "link"]),
});
type FormData = z.infer<typeof schema>;

interface InviteMemberDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function InviteMemberDialog({ open, onOpenChange }: InviteMemberDialogProps) {
  const invite = useInviteMember();
  const [link, setLink] = useState<string | null>(null);
  const form = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { firstName: "", lastName: "", email: "", role: "user", delivery: "email" },
  });

  const close = (next: boolean) => {
    if (invite.isPending) return;
    onOpenChange(next);
    if (!next) {
      form.reset();
      setLink(null);
    }
  };

  const onSubmit = async (data: FormData) => {
    try {
      // zod marks fields optional while tsconfig.strict is off; the resolver guarantees them.
      const result = await invite.mutateAsync(data as InviteInput);
      if (result.actionLink) {
        setLink(result.actionLink);
        if (data.delivery === "email") {
          toast.warning("Email couldn't be sent", { description: "Share the invitation link below instead." });
        }
      } else {
        toast.success("Invitation sent", { description: `${data.email} has 7 days to accept.` });
        close(false);
      }
    } catch (error) {
      toast.error("Couldn't send the invitation", { description: getErrorMessage(error) });
    }
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{link ? "Share invitation link" : "Invite a team member"}</DialogTitle>
          <DialogDescription>
            {link
              ? "Send this one-time link to the new member. It expires in 7 days."
              : "They'll get an email to set their password and join your business."}
          </DialogDescription>
        </DialogHeader>

        {link ? (
          <InvitationLink link={link} onDone={() => close(false)} />
        ) : (
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="firstName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>First name</FormLabel>
                      <FormControl>
                        <Input autoComplete="off" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="lastName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Last name</FormLabel>
                      <FormControl>
                        <Input autoComplete="off" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input type="email" autoComplete="off" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="role"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Role</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="user">{ROLE_LABELS.user}</SelectItem>
                        <SelectItem value="admin">{ROLE_LABELS.admin}</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      {field.value === "admin"
                        ? "Admins can manage the team, see all sales and financial reports, and delete records."
                        : "Staff record sales and payments and see only the sales they recorded."}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="delivery"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>How should they get it?</FormLabel>
                    <RadioGroup value={field.value} onValueChange={field.onChange} className="flex gap-4">
                      <div className="flex items-center gap-2">
                        <RadioGroupItem value="email" id="delivery-email" />
                        <Label htmlFor="delivery-email" className="font-normal">Send email</Label>
                      </div>
                      <div className="flex items-center gap-2">
                        <RadioGroupItem value="link" id="delivery-link" />
                        <Label htmlFor="delivery-link" className="font-normal">Copy a link</Label>
                      </div>
                    </RadioGroup>
                  </FormItem>
                )}
              />
              <DialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:gap-0">
                <Button type="button" variant="outline" onClick={() => close(false)} disabled={invite.isPending}>
                  Cancel
                </Button>
                <Button type="submit" disabled={invite.isPending}>
                  {invite.isPending ? "Sending…" : "Send invitation"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function InvitationLink({ link, onDone }: { link: string; onDone: () => void }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      toast.success("Link copied");
    } catch {
      toast.error("Couldn't copy automatically", { description: "Select the link and copy it manually." });
    }
  };
  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Input value={link} readOnly onFocus={(e) => e.currentTarget.select()} aria-label="Invitation link" />
        <Button type="button" variant="outline" size="icon" onClick={copy} aria-label="Copy link">
          {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
        </Button>
      </div>
      <DialogFooter>
        <Button type="button" onClick={onDone} className="w-full sm:w-auto">
          Done
        </Button>
      </DialogFooter>
    </div>
  );
}
