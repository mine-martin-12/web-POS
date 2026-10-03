/** A customer as clients see it (via customers_secure: phone masked for non-admins). */
export interface Customer {
  id: string;
  name: string;
  phone: string | null;
  notes: string | null;
  created_at: string;
  archived_at: string | null;
}

/** The customer picker's value: a saved customer, a walk-in, or nothing chosen yet (null). */
export type CustomerChoice = { kind: "customer"; customer: Customer } | { kind: "walk-in" } | null;

export type CreateCustomerResult =
  | { status: "created" | "existing_phone"; customer: Customer }
  | { status: "name_matches"; matches: Customer[] };

export type PickerMode = "recent" | "phone" | "name" | "keep-typing";
