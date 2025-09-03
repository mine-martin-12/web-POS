import { FormField, FormItem, FormLabel, FormControl, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Control } from "react-hook-form";
import { cn } from "@/lib/utils";

interface EnhancedFormFieldProps {
  control: Control<any>;
  name: string;
  label: string;
  placeholder?: string;
  type?: string;
  className?: string;
  required?: boolean;
  disabled?: boolean;
}

export function EnhancedFormField({
  control,
  name,
  label,
  placeholder,
  type = "text",
  className,
  required,
  disabled
}: EnhancedFormFieldProps) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <FormItem className={className}>
          <FormLabel className={cn(required && "after:content-['*'] after:text-destructive after:ml-1")}>
            {label}
          </FormLabel>
          <FormControl>
            <Input
              {...field}
              type={type}
              placeholder={placeholder}
              disabled={disabled}
              className={cn(
                fieldState.error && "border-destructive focus:border-destructive",
                "transition-colors"
              )}
            />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}