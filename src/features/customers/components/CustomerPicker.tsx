import React, { useState } from "react";
import { Check, ChevronsUpDown, Footprints, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Command, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { looksLikePhone } from "@/lib/phone";
import { cn } from "@/lib/utils";
import { useCustomerSearch } from "../hooks";
import { PICKER_MODE_LABELS, pickerMode } from "../lib";
import type { Customer, CustomerChoice } from "../types";
import { CustomerFormDialog } from "./CustomerFormDialog";
import { MaskedPhone } from "./MaskedPhone";

const DEBOUNCE_MS = 250;

interface CustomerPickerProps {
  value: CustomerChoice;
  onChange: (value: CustomerChoice) => void;
  /** Offer "Walk-in / guest" (not for credit sales, which need a named customer). */
  allowWalkIn?: boolean;
  invalid?: boolean;
  id?: string;
}

/**
 * Smart customer picker: recent customers when empty, exact phone lookup for digits,
 * name search from 2 letters, "Create new" with the typed text, and "Walk-in / guest".
 */
export function CustomerPicker({ value, onChange, allowWalkIn = true, invalid, id }: CustomerPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const debounced = useDebouncedValue(query, DEBOUNCE_MS);
  const { mode, term } = pickerMode(debounced);
  const search = useCustomerSearch(mode, term, open);
  const results = mode === "keep-typing" ? [] : (search.data ?? []);
  const typing = query !== debounced;
  const loading = typing || (search.isFetching && mode !== "keep-typing");

  const choose = (choice: CustomerChoice) => {
    onChange(choice);
    setOpen(false);
    setQuery("");
  };

  const label =
    value?.kind === "customer" ? value.customer.name : value?.kind === "walk-in" ? "Walk-in / guest" : "Select customer…";
  const trimmed = query.trim();

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            id={id}
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            aria-invalid={invalid}
            className={cn(
              "w-full justify-between font-normal",
              !value && "text-muted-foreground",
              invalid && "border-destructive",
            )}
          >
            <span className="truncate">{label}</span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" aria-hidden />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[--radix-popover-trigger-width] min-w-[18rem] p-0" align="start">
          <Command shouldFilter={false}>
            <CommandInput placeholder="Name or phone number…" value={query} onValueChange={setQuery} />
            <div className="flex items-center justify-between border-b px-3 py-1.5 text-xs text-muted-foreground">
              <span>{PICKER_MODE_LABELS[pickerMode(query).mode]}</span>
              {mode !== "keep-typing" && !loading && <span>{results.length} shown</span>}
            </div>
            <CommandList>
              {loading ? (
                <div className="space-y-2 p-2" aria-label="Loading customers">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="flex flex-col gap-1 px-2 py-1">
                      <Skeleton className="h-4 w-2/3" />
                      <Skeleton className="h-3 w-1/3" />
                    </div>
                  ))}
                </div>
              ) : mode === "keep-typing" ? (
                <p className="px-3 py-4 text-center text-sm text-muted-foreground">
                  {looksLikePhone(query) ? "Keep typing the phone number…" : "Type at least 2 letters…"}
                </p>
              ) : results.length === 0 ? (
                <p className="px-3 py-4 text-center text-sm text-muted-foreground">
                  {mode === "recent" ? "No customers yet." : `No customer matches "${trimmed}".`}
                </p>
              ) : (
                <CommandGroup>
                  {results.map((c: Customer) => (
                    <CommandItem key={c.id} value={c.id} onSelect={() => choose({ kind: "customer", customer: c })}>
                      <Check
                        className={cn(
                          "mr-2 h-4 w-4",
                          value?.kind === "customer" && value.customer.id === c.id ? "opacity-100" : "opacity-0",
                        )}
                        aria-hidden
                      />
                      <span className="flex min-w-0 flex-col">
                        <span className="truncate">{c.name}</span>
                        <MaskedPhone phone={c.phone} className="text-xs" />
                      </span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
              <CommandSeparator />
              <CommandGroup>
                <CommandItem value="__create" onSelect={() => setCreating(true)}>
                  <UserPlus className="mr-2 h-4 w-4" aria-hidden />
                  {trimmed ? `Create new "${trimmed}"` : "Create new customer"}
                </CommandItem>
                {allowWalkIn && (
                  <CommandItem value="__walkin" onSelect={() => choose({ kind: "walk-in" })}>
                    <Footprints className="mr-2 h-4 w-4" aria-hidden />
                    Walk-in / guest
                  </CommandItem>
                )}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      <CustomerFormDialog
        open={creating}
        onOpenChange={setCreating}
        initial={looksLikePhone(trimmed) ? { phone: trimmed } : { name: trimmed }}
        onSaved={(customer) => choose({ kind: "customer", customer })}
      />
    </>
  );
}
