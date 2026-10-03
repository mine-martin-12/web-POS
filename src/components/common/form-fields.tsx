import React, { useState } from "react";
import type { Control, FieldPath, FieldValues, UseFormClearErrors } from "react-hook-form";
import { Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/** Red border for inputs that FormControl marks aria-invalid. */
export const invalidInputClass = "aria-[invalid=true]:border-destructive aria-[invalid=true]:focus-visible:ring-destructive";

interface TextFieldProps<T extends FieldValues> extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "name"> {
  control: Control<T>;
  name: FieldPath<T>;
  label: string;
  description?: React.ReactNode;
  /** Pass form.clearErrors so a field's error disappears as soon as the user types. */
  clearErrors?: UseFormClearErrors<T>;
}

/**
 * Labelled input with inline validation: red label, border and helper text when invalid,
 * cleared on the next keystroke.
 */
export function TextField<T extends FieldValues>({
  control,
  name,
  label,
  description,
  clearErrors,
  className,
  type,
  ...inputProps
}: TextFieldProps<T>) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          <FormControl>
            {type === "password" ? (
              <PasswordInput
                {...inputProps}
                {...field}
                className={cn(invalidInputClass, className)}
                onChange={(e) => {
                  field.onChange(e);
                  clearErrors?.(name);
                }}
              />
            ) : (
              <Input
                type={type}
                {...inputProps}
                {...field}
                className={cn(invalidInputClass, className)}
                onChange={(e) => {
                  field.onChange(e);
                  clearErrors?.(name);
                }}
              />
            )}
          </FormControl>
          {description && <FormDescription>{description}</FormDescription>}
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

/** Password input with an accessible show/hide toggle. */
export const PasswordInput = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => {
    const [visible, setVisible] = useState(false);
    return (
      <div className="relative">
        <Input ref={ref} type={visible ? "text" : "password"} className={cn("pr-10", className)} {...props} />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? "Hide password" : "Show password"}
          aria-pressed={visible}
          tabIndex={-1}
        >
          {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </Button>
      </div>
    );
  },
);
PasswordInput.displayName = "PasswordInput";
