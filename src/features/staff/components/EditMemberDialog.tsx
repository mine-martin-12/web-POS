import React, { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getErrorMessage } from "@/lib/errors";
import { ROLE_LABELS } from "@/lib/permissions";
import { requiredText } from "@/lib/validation";
import { useUpdateMember } from "../hooks";
import type { Member } from "../types";

const schema = z.object({
  firstName: requiredText("First name"),
  lastName: z.string().trim().max(100),
  role: z.enum(["user", "admin"]),
});
type FormData = z.infer<typeof schema>;

interface EditMemberDialogProps {
  member: Member | null;
  isSelf: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EditMemberDialog({ member, isSelf, onOpenChange }: EditMemberDialogProps) {
  const update = useUpdateMember();
  const form = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { firstName: "", lastName: "", role: "user" },
  });

  useEffect(() => {
    if (member) form.reset({ firstName: member.first_name, lastName: member.last_name, role: member.role });
  }, [member, form]);

  const onSubmit = async (data: FormData) => {
    if (!member) return;
    try {
      await update.mutateAsync({
        userId: member.user_id,
        firstName: data.firstName,
        lastName: data.lastName,
        ...(isSelf || data.role === member.role ? {} : { role: data.role }),
      });
      toast.success("Team member updated");
      onOpenChange(false);
    } catch (error) {
      toast.error("Couldn't update team member", { description: getErrorMessage(error) });
    }
  };

  return (
    <Dialog open={member !== null} onOpenChange={(open) => !update.isPending && onOpenChange(open)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit team member</DialogTitle>
          <DialogDescription>{member?.email}</DialogDescription>
        </DialogHeader>
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
                      <Input {...field} />
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
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name="role"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Role</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange} disabled={isSelf}>
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
                  {isSelf && <FormDescription>You can't change your own role.</FormDescription>}
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:gap-0">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={update.isPending}>
                Cancel
              </Button>
              <Button type="submit" disabled={update.isPending}>
                {update.isPending ? "Saving…" : "Save changes"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
