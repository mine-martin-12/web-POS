import React, { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { format } from "date-fns";
import { ClipboardCheck } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useSecurity } from "@/hooks/useSecurity";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { useCredits } from "@/features/credits/hooks";
import { useCustomers } from "@/features/customers/hooks";
import { useProducts, useSales } from "@/features/sales/hooks";
import { DEFAULT_CURRENCY } from "@/lib/currency";
import { dayKey, parseDayKey } from "@/lib/dates";
import { ResubmitDialog } from "../components/ResubmitDialog";
import { ReviewCard } from "../components/ReviewCard";
import { useChangeRequests, useMemberNames } from "../hooks";
import type { Lookups } from "../lib";
import type { ChangeRequest, ChangeStatus } from "../types";

type Tab = "all" | ChangeStatus;
const TABS: Array<{ value: Tab; label: string }> = [
  { value: "pending", label: "Pending" },
  { value: "sent_back_for_review", label: "Sent back" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
  { value: "all", label: "All" },
];
const HIGHLIGHT_MS = 2500;

const ApprovalsPage: React.FC = () => {
  const { user, business } = useAuth();
  const { canReviewChanges } = useSecurity();
  const [params, setParams] = useSearchParams();
  const changes = useChangeRequests();
  const names = useMemberNames();
  const products = useProducts();
  const customers = useCustomers();
  const sales = useSales();
  const credits = useCredits();
  const [resubmitting, setResubmitting] = useState<ChangeRequest | null>(null);
  const [highlighted, setHighlighted] = useState<string | null>(null);

  const tab = (params.get("status") as Tab | null) ?? (canReviewChanges ? "pending" : "all");
  const showArchived = params.get("archived") === "1";
  const focusId = params.get("update");

  // Filters live in the URL (replace, not push) so views can be shared and survive reloads.
  const setParam = (key: string, value: string | null) =>
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        if (value === null) next.delete(key);
        else next.set(key, value);
        return next;
      },
      { replace: true },
    );

  const visible = useMemo(
    () => (changes.data ?? []).filter((c) => showArchived || !c.archived_at || c.id === focusId),
    [changes.data, showArchived, focusId],
  );
  const counts = useMemo(() => {
    const result: Record<Tab, number> = { all: visible.length, pending: 0, approved: 0, sent_back_for_review: 0, rejected: 0 };
    for (const c of visible) result[c.status]++;
    return result;
  }, [visible]);
  const rows = tab === "all" ? visible : visible.filter((c) => c.status === tab || c.id === focusId);

  // Deep link (?update=<id>): scroll to the card and highlight it briefly.
  useEffect(() => {
    if (!focusId || !changes.data) return;
    const target = document.getElementById(`change-${focusId}`);
    if (!target) return;
    target.scrollIntoView({ behavior: "smooth", block: "center" });
    setHighlighted(focusId);
    const timer = window.setTimeout(() => setHighlighted(null), HIGHLIGHT_MS);
    return () => window.clearTimeout(timer);
  }, [focusId, changes.data]);

  const lookups: Lookups = useMemo(
    () => ({
      currency: business?.currency ?? DEFAULT_CURRENCY,
      products: new Map((products.data ?? []).map((p) => [p.id, p.name])),
      customers: new Map((customers.data ?? []).map((c) => [c.id, c.name])),
    }),
    [business?.currency, products.data, customers.data],
  );

  const recordLabel = (c: ChangeRequest): string => {
    if (c.table_name === "products") return lookups.products.get(c.record_id) ?? "Product (archived)";
    if (c.table_name === "sales") {
      const sale = sales.data?.find((s) => s.id === c.record_id);
      return sale
        ? `${sale.quantity} × ${sale.product_name} · ${format(parseDayKey(dayKey(sale.sale_date, business?.timezone)), "d MMM")}`
        : "Sale (no longer exists)";
    }
    const credit = credits.data?.find((cr) => cr.id === c.record_id);
    return credit ? `${credit.customer_name}${credit.sale ? ` · ${credit.sale.product_name}` : ""}` : "Credit (no longer exists)";
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-foreground">{canReviewChanges ? "Approvals" : "My change requests"}</h1>
        <p className="text-muted-foreground">
          {canReviewChanges
            ? "Changes your staff asked for. Approving applies the change immediately."
            : "Changes you asked for, and what your admin decided."}
        </p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Tabs value={tab} onValueChange={(v) => setParam("status", v)}>
          <TabsList className="flex-wrap">
            {TABS.map((t) => (
              <TabsTrigger key={t.value} value={t.value}>
                {t.label} ({counts[t.value]})
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        {canReviewChanges && (
          <div className="flex items-center gap-2">
            <Switch id="show-archived" checked={showArchived} onCheckedChange={(on) => setParam("archived", on ? "1" : null)} />
            <Label htmlFor="show-archived">Show archived</Label>
          </div>
        )}
      </div>

      {changes.isLoading ? (
        <div className="space-y-4">
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-56 w-full rounded-xl" />
          ))}
        </div>
      ) : changes.isError ? (
        <div className="py-8 text-center">
          <p className="text-sm text-muted-foreground">Couldn't load change requests.</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => changes.refetch()}>
            Try again
          </Button>
        </div>
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed py-12 text-center">
          <ClipboardCheck className="h-10 w-10 text-muted-foreground" aria-hidden />
          <p className="text-sm text-muted-foreground">
            {tab === "pending"
              ? "All caught up. No changes are waiting for review."
              : canReviewChanges
                ? "Nothing here."
                : "You haven't requested any changes. Use \"Request change\" on a sale, credit or product."}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {rows.map((c) => (
            <ReviewCard
              key={c.id}
              change={c}
              recordLabel={recordLabel(c)}
              requester={(c.requested_by && names.data?.get(c.requested_by)) || "A team member"}
              reviewer={c.reviewed_by ? names.data?.get(c.reviewed_by) : undefined}
              lookups={lookups}
              canReview={canReviewChanges}
              isMine={c.requested_by === user?.id}
              highlighted={highlighted === c.id}
              onResubmit={setResubmitting}
            />
          ))}
        </div>
      )}

      <ResubmitDialog change={resubmitting} lookups={lookups} onOpenChange={(open) => !open && setResubmitting(null)} />
    </div>
  );
};

export default ApprovalsPage;
