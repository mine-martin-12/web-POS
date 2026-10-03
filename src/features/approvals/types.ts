export type ChangeTable = "sales" | "credits" | "products";
export type ChangeStatus = "pending" | "approved" | "sent_back_for_review" | "rejected";
export type ChangeDecision = "approve" | "send_back" | "reject";

export interface ChangeRequest {
  id: string;
  table_name: ChangeTable;
  record_id: string;
  old_values: Record<string, unknown>;
  new_values: Record<string, unknown>;
  reason: string;
  status: ChangeStatus;
  requested_by: string | null;
  requested_at: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  admin_note: string | null;
  archived_at: string | null;
}

export const STATUS_LABELS: Record<ChangeStatus, string> = {
  pending: "Pending",
  approved: "Approved",
  sent_back_for_review: "Sent back",
  rejected: "Rejected",
};

export const TABLE_LABELS: Record<ChangeTable, string> = {
  sales: "Sale",
  credits: "Credit",
  products: "Product",
};
