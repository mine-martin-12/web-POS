import React, { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { toast } from "sonner";
import { Building2, Lock, User } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useSecurity } from "@/hooks/useSecurity";
import { changePassword, updateBusinessDetails, updateMyName } from "@/features/account/api";
import { simulatedNote } from "@/data/mode";
import { getErrorMessage } from "@/lib/errors";
import { ROLE_LABELS } from "@/lib/permissions";
import { emailField, requiredText, strongPassword } from "@/lib/validation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Separator } from "@/components/ui/separator";
import PasswordStrengthIndicator from "@/components/auth/PasswordStrengthIndicator";
import { NotificationPreferencesCard } from "@/features/notifications/components/NotificationPreferencesCard";

const profileSchema = z.object({
  first_name: requiredText("First name"),
  last_name: requiredText("Last name"),
});

const businessSchema = z.object({
  name: requiredText("Business name", 120),
  phone: z.string().trim().max(30).optional(),
  email: z.union([z.literal(""), emailField]).optional(),
  address: z.string().trim().max(200).optional(),
  currency: z
    .string()
    .trim()
    .regex(/^[A-Za-z]{3}$/, "Use a 3-letter currency code, e.g. KES"),
  timezone: requiredText("Time zone", 64),
});

const passwordSchema = z
  .object({
    current_password: z.string().min(1, "Current password is required"),
    new_password: strongPassword,
    confirm_password: z.string().min(1, "Please confirm the new password"),
  })
  .refine((data) => data.new_password === data.confirm_password, {
    message: "Passwords don't match",
    path: ["confirm_password"],
  });

type ProfileFormData = z.infer<typeof profileSchema>;
type BusinessFormData = z.infer<typeof businessSchema>;
type PasswordFormData = z.infer<typeof passwordSchema>;

const Settings: React.FC = () => {
  const { profile, business, role, refresh } = useAuth();
  const { canManageBusiness } = useSecurity();
  const [saving, setSaving] = useState<"profile" | "business" | "password" | null>(null);

  const profileForm = useForm<ProfileFormData>({
    resolver: zodResolver(profileSchema),
    defaultValues: { first_name: "", last_name: "" },
  });
  const businessForm = useForm<BusinessFormData>({
    resolver: zodResolver(businessSchema),
    defaultValues: { name: "", phone: "", email: "", address: "", currency: "KES", timezone: "Africa/Nairobi" },
  });
  const passwordForm = useForm<PasswordFormData>({
    resolver: zodResolver(passwordSchema),
    defaultValues: { current_password: "", new_password: "", confirm_password: "" },
  });

  // Fill the forms once the account has loaded (and after each save).
  useEffect(() => {
    if (profile) profileForm.reset({ first_name: profile.first_name, last_name: profile.last_name });
  }, [profile, profileForm]);
  useEffect(() => {
    if (business) {
      businessForm.reset({
        name: business.name,
        phone: business.phone ?? "",
        email: business.email ?? "",
        address: business.address ?? "",
        currency: business.currency,
        timezone: business.timezone,
      });
    }
  }, [business, businessForm]);

  const onUpdateProfile = async (data: ProfileFormData) => {
    if (!profile) return;
    setSaving("profile");
    try {
      await updateMyName(profile.user_id, { first_name: data.first_name, last_name: data.last_name });
      toast.success("Profile updated");
      await refresh();
    } catch (error) {
      toast.error("Couldn't update your profile", { description: getErrorMessage(error) });
    } finally {
      setSaving(null);
    }
  };

  const onUpdateBusiness = async (data: BusinessFormData) => {
    setSaving("business");
    try {
      await updateBusinessDetails(data);
      toast.success("Business details updated");
      await refresh();
    } catch (error) {
      toast.error("Couldn't update business details", { description: getErrorMessage(error) });
    } finally {
      setSaving(null);
    }
  };

  const onUpdatePassword = async (data: PasswordFormData) => {
    if (!profile) return;
    setSaving("password");
    try {
      // Re-authenticates first, so a borrowed, unlocked session can't change the password.
      const result = await changePassword({
        email: profile.email,
        currentPassword: data.current_password,
        newPassword: data.new_password,
      });
      if (result === "wrong_current_password") {
        passwordForm.setError("current_password", { message: "Current password is incorrect" });
        toast.error("Current password is incorrect");
        return;
      }
      toast.success(simulatedNote("Password updated"));
      passwordForm.reset();
    } catch (error) {
      toast.error("Couldn't update your password", { description: getErrorMessage(error) });
    } finally {
      setSaving(null);
    }
  };

  const newPassword = passwordForm.watch("new_password");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-foreground">Settings</h1>
        <p className="text-muted-foreground">Manage your account and business preferences</p>
      </div>

      <div className="grid gap-6">
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
                          <Input autoComplete="given-name" {...field} />
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
                          <Input autoComplete="family-name" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium">Email</p>
                  <Input value={profile?.email ?? ""} disabled readOnly />
                  <p className="text-sm text-muted-foreground">
                    Your sign-in email can only be changed by an administrator.
                  </p>
                </div>
                <Button type="submit" disabled={saving === "profile"} className="w-full sm:w-auto">
                  {saving === "profile" ? "Saving…" : "Update Profile"}
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              Business Details
            </CardTitle>
            <CardDescription>
              {canManageBusiness
                ? "Shown on receipts and exported reports."
                : "Only administrators can change business details."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...businessForm}>
              <form onSubmit={businessForm.handleSubmit(onUpdateBusiness)} className="space-y-4">
                <fieldset disabled={!canManageBusiness} className="space-y-4">
                  <FormField
                    control={businessForm.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Business Name</FormLabel>
                        <FormControl>
                          <Input autoComplete="organization" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <FormField
                      control={businessForm.control}
                      name="phone"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Phone</FormLabel>
                          <FormControl>
                            <Input type="tel" autoComplete="tel" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={businessForm.control}
                      name="email"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Business Email</FormLabel>
                          <FormControl>
                            <Input type="email" autoComplete="email" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  <FormField
                    control={businessForm.control}
                    name="address"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Address</FormLabel>
                        <FormControl>
                          <Input autoComplete="street-address" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <FormField
                      control={businessForm.control}
                      name="currency"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Currency</FormLabel>
                          <FormControl>
                            <Input maxLength={3} className="uppercase" {...field} />
                          </FormControl>
                          <FormDescription>3-letter code, e.g. KES</FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={businessForm.control}
                      name="timezone"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Time Zone</FormLabel>
                          <FormControl>
                            <Input {...field} />
                          </FormControl>
                          <FormDescription>e.g. Africa/Nairobi</FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </fieldset>
                {canManageBusiness && (
                  <Button type="submit" disabled={saving === "business"} className="w-full sm:w-auto">
                    {saving === "business" ? "Saving…" : "Update Business Details"}
                  </Button>
                )}
              </form>
            </Form>
          </CardContent>
        </Card>

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
                        <Input type="password" autoComplete="current-password" {...field} />
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
                        <Input type="password" autoComplete="new-password" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <PasswordStrengthIndicator password={newPassword} />
                <FormField
                  control={passwordForm.control}
                  name="confirm_password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Confirm New Password</FormLabel>
                      <FormControl>
                        <Input type="password" autoComplete="new-password" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button type="submit" disabled={saving === "password"} className="w-full sm:w-auto">
                  {saving === "password" ? "Saving…" : "Update Password"}
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>

        <NotificationPreferencesCard />

        <Card>
          <CardHeader>
            <CardTitle>Account Information</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <dt className="text-sm font-medium text-muted-foreground">Role</dt>
                <dd className="text-sm text-foreground">{role ? ROLE_LABELS[role] : "—"}</dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-muted-foreground">Business</dt>
                <dd className="text-sm text-foreground">{business?.name ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-muted-foreground">Member Since</dt>
                <dd className="text-sm text-foreground">
                  {profile?.created_at ? new Date(profile.created_at).toLocaleDateString() : "—"}
                </dd>
              </div>
            </dl>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Settings;
