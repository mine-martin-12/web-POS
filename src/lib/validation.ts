import * as z from "zod";
import { validatePassword } from "@/lib/password";

/** One password rule for sign-up, invitations, reset and change-password. */
export const strongPassword = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .refine((value) => validatePassword(value).isValid, {
    message: "Use upper and lower case letters, a number and a symbol",
  });

export const emailField = z.string().trim().min(1, "Email is required").email("Enter a valid email address");

export const requiredText = (label: string, max = 100) =>
  z.string().trim().min(1, `${label} is required`).max(max, `${label} is too long`);

/** One summary toast for an invalid submit; field-level messages carry the detail. */
export function invalidSummary(errors: Record<string, unknown>): { title: string; description: string } {
  const count = Object.keys(errors).length;
  return {
    title: "Please check the form",
    description: count === 1 ? "One field needs your attention." : `${count} fields need your attention.`,
  };
}
