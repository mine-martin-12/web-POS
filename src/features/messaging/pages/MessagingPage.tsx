import React, { useMemo, useState } from "react";
import { PageHeader } from "@/components/common/PageHeader";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format, subDays } from "date-fns";
import { toast } from "sonner";
import { simulatedNote } from "@/data/mode";
import { AlertTriangle, CheckCircle2, Clock, MessageSquare, Megaphone, Pencil, RotateCcw, Send, Trash2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useUrlState } from "@/hooks/useUrlState";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { EmptyState } from "@/components/common/EmptyState";
import { DataTable, type DataTableColumn } from "@/components/common/data-table/DataTable";
import { CustomerPicker } from "@/features/customers/components/CustomerPicker";
import { MaskedPhone } from "@/features/customers/components/MaskedPhone";
import type { CustomerChoice } from "@/features/customers/types";
import { getErrorMessage } from "@/lib/errors";
import { queryKeys } from "@/lib/queryKeys";
import { cn } from "@/lib/utils";
import { deleteTemplate, fetchAudience, fetchMessages, fetchTemplates, retrySms, saveTemplate, sendOverdueReminders, sendSms, type Audience, type SmsMessage, type SmsTemplate } from "../api";
import { MessageComposer } from "../components/MessageComposer";

const STATS_DAYS = 30;
const AUDIENCES: Array<{ value: Audience; label: string; hint: string }> = [
  { value: "owing", label: "Customers who owe you", hint: "Anyone with an open credit balance" },
  { value: "overdue", label: "Overdue only", hint: "Balances past their due date" },
  { value: "all", label: "All customers", hint: "Everyone with a phone number" },
];

const MessagingPage: React.FC = () => {
  const { business } = useAuth();
  const queryClient = useQueryClient();
  const url = useUrlState();
  const tab = url.get("tab", "send");
  const since = useMemo(() => subDays(new Date(), STATS_DAYS).toISOString(), []);

  const messages = useQuery({ queryKey: queryKeys.messaging.history(since), queryFn: () => fetchMessages(since) });
  const templates = useQuery({ queryKey: queryKeys.messaging.templates(), queryFn: fetchTemplates });
  const refresh = () => queryClient.invalidateQueries({ queryKey: queryKeys.messaging.all });

  const [message, setMessage] = useState("");
  const [customer, setCustomer] = useState<CustomerChoice>(null);
  const [audience, setAudience] = useState<Audience>("owing");
  const [confirmBroadcast, setConfirmBroadcast] = useState<Array<{ customer_id: string }> | null>(null);

  const all = messages.data ?? [];
  const stats = {
    sent: all.filter((m) => m.status === "sent").length,
    failed: all.filter((m) => m.status === "failed").length,
    pending: all.filter((m) => m.status === "pending").length,
    broadcasts: new Set(all.filter((m) => m.broadcast_id).map((m) => m.broadcast_id)).size,
  };
  const sample = { customer_name: "Wanjiku", amount_due: "KES 1,250.00", due_date: "2026-10-15", business_name: business?.name ?? "" };

  const report = (r: { sent: number; failed: number }) => {
    if (r.failed && !r.sent) toast.error("Messages failed", { description: "See History to retry." });
    else toast.success(simulatedNote(`${r.sent} sent${r.failed ? `, ${r.failed} failed` : ""}`), { description: r.failed ? "Retry the failed ones from History." : undefined });
  };

  const send = useMutation({
    mutationFn: sendSms,
    onSuccess: (r) => {
      report(r);
      setMessage("");
    },
    onError: (e) => toast.error("Couldn't send", { description: getErrorMessage(e) }),
    onSettled: refresh,
  });
  const audienceQuery = useMutation({ mutationFn: fetchAudience });
  const reminders = useMutation({
    mutationFn: sendOverdueReminders,
    onSuccess: (r) => (r.recipients ? report(r) : toast.info("No new overdue balances to remind")),
    onError: (e) => toast.error("Couldn't send reminders", { description: getErrorMessage(e) }),
    onSettled: refresh,
  });
  const retry = useMutation({
    mutationFn: retrySms,
    onSuccess: report,
    onError: (e) => toast.error("Retry failed", { description: getErrorMessage(e) }),
    onSettled: refresh,
  });

  const startBroadcast = async () => {
    try {
      const people = await audienceQuery.mutateAsync(audience);
      if (!people.length) {
        toast.info("Nobody matches", { description: "No customers with a phone number in this group." });
        return;
      }
      setConfirmBroadcast(people);
    } catch (e) {
      toast.error("Couldn't load the audience", { description: getErrorMessage(e) });
    }
  };

  const historyColumns: DataTableColumn<SmsMessage>[] = [
    { id: "when", header: "When", sortValue: (m) => m.created_at, cell: (m) => <span className="whitespace-nowrap text-muted-foreground">{format(new Date(m.created_at), "d MMM, HH:mm")}</span> },
    { id: "to", header: "To", cell: (m) => <MaskedPhone phone={m.phone} /> },
    { id: "body", header: "Message", cell: (m) => <span className="block max-w-sm truncate">{m.body}</span> },
    { id: "kind", header: "Type", cell: (m) => <Badge variant="secondary" className="capitalize">{m.kind}</Badge> },
    {
      id: "status",
      header: "Status",
      cell: (m) => (
        <Badge variant="outline" className={cn(m.status === "sent" && "border-success/30 text-success", m.status === "failed" && "border-destructive/30 text-destructive")} title={m.error ?? undefined}>
          {m.status}
        </Badge>
      ),
    },
    {
      id: "retry",
      header: <span className="sr-only">Retry</span>,
      cell: (m) =>
        m.status === "failed" ? (
          <Button size="sm" variant="ghost" onClick={() => retry.mutate([m.id])} disabled={retry.isPending}>
            <RotateCcw className="mr-1.5 h-4 w-4" /> Retry
          </Button>
        ) : null,
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="Messages" />

      <section aria-label={`Last ${STATS_DAYS} days`} className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Sent" value={stats.sent} icon={CheckCircle2} tone="text-success" loading={messages.isLoading} />
        <Stat label="Failed" value={stats.failed} icon={AlertTriangle} tone="text-destructive" loading={messages.isLoading} />
        <Stat label="Pending" value={stats.pending} icon={Clock} tone="text-muted-foreground" loading={messages.isLoading} />
        <Stat label="Broadcasts" value={stats.broadcasts} icon={Megaphone} tone="text-primary" loading={messages.isLoading} />
      </section>
      <p className="-mt-3 text-xs text-muted-foreground">Last {STATS_DAYS} days</p>

      <Tabs value={tab} onValueChange={(v) => url.set({ tab: v }, { tab: "send" })}>
        <TabsList className="flex h-auto flex-wrap justify-start">
          <TabsTrigger value="send">Send</TabsTrigger>
          <TabsTrigger value="broadcast">Broadcast</TabsTrigger>
          <TabsTrigger value="templates">Templates</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>

        <TabsContent value="send" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Message one customer</CardTitle>
              <CardDescription>Only customers with a saved phone number can be texted.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="sms-customer">To</Label>
                <CustomerPicker id="sms-customer" value={customer} onChange={setCustomer} allowWalkIn={false} />
              </div>
              <MessageComposer value={message} onChange={setMessage} templates={templates.data ?? []} sample={{ ...sample, customer_name: customer?.kind === "customer" ? customer.customer.name.split(" ")[0] : sample.customer_name }} />
              <Button
                onClick={() => customer?.kind === "customer" && send.mutate({ customerIds: [customer.customer.id], message })}
                disabled={customer?.kind !== "customer" || !message.trim() || send.isPending}
                className="w-full sm:w-auto"
              >
                <Send className="mr-2 h-4 w-4" />
                {send.isPending ? "Sending…" : "Send"}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="broadcast" className="mt-4 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Broadcast</CardTitle>
              <CardDescription>Placeholders are filled in per customer. Each phone number gets one message.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <RadioGroup value={audience} onValueChange={(v) => setAudience(v as Audience)} className="grid gap-2 sm:grid-cols-3">
                {AUDIENCES.map((a) => (
                  <Label key={a.value} htmlFor={`aud-${a.value}`} className={cn("flex cursor-pointer gap-3 rounded-lg border p-3 font-normal", audience === a.value && "border-primary bg-primary/5")}>
                    <RadioGroupItem id={`aud-${a.value}`} value={a.value} className="mt-0.5" />
                    <span>
                      <span className="block font-medium">{a.label}</span>
                      <span className="text-xs text-muted-foreground">{a.hint}</span>
                    </span>
                  </Label>
                ))}
              </RadioGroup>
              <MessageComposer id="sms-broadcast" value={message} onChange={setMessage} templates={templates.data ?? []} sample={sample} />
              <Button onClick={startBroadcast} disabled={!message.trim() || audienceQuery.isPending || send.isPending} className="w-full sm:w-auto">
                <Megaphone className="mr-2 h-4 w-4" />
                {audienceQuery.isPending ? "Counting…" : "Review & send"}
              </Button>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Overdue reminders</CardTitle>
              <CardDescription>Texts each customer with a newly overdue balance. Each credit is reminded only once.</CardDescription>
            </CardHeader>
            <CardContent>
              <Button
                variant="outline"
                onClick={() =>
                  reminders.mutate(message.trim() || "Hi {customer_name}, a friendly reminder that {amount_due} was due on {due_date}. Thank you! {business_name}")
                }
                disabled={reminders.isPending}
              >
                <Clock className="mr-2 h-4 w-4" />
                {reminders.isPending ? "Sending…" : message.trim() ? "Send reminders with this message" : "Send standard reminders"}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="templates" className="mt-4">
          <TemplatesTab templates={templates.data ?? []} loading={templates.isLoading} onChanged={refresh} sample={sample} />
        </TabsContent>

        <TabsContent value="history" className="mt-4">
          <DataTable<SmsMessage>
            rows={all}
            columns={historyColumns}
            getRowId={(m) => m.id}
            loading={messages.isLoading}
            error={messages.error}
            onRetry={() => messages.refetch()}
            urlPrefix="h_"
            caption="Message history"
            selectable
            bulkActions={(selected, clear) =>
              selected.some((m) => m.status === "failed") ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    retry.mutate(selected.filter((m) => m.status === "failed").map((m) => m.id));
                    clear();
                  }}
                >
                  <RotateCcw className="mr-1.5 h-4 w-4" /> Retry failed
                </Button>
              ) : null
            }
            emptyState={<EmptyState icon={MessageSquare} title={`No messages in the last ${STATS_DAYS} days`} />}
            mobileCard={(m) => (
              <div className="space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <MaskedPhone phone={m.phone} className="text-sm" />
                  <Badge variant="outline">{m.status}</Badge>
                </div>
                <p className="text-sm">{m.body}</p>
                {m.status === "failed" && (
                  <Button size="sm" variant="ghost" onClick={() => retry.mutate([m.id])}>
                    <RotateCcw className="mr-1.5 h-4 w-4" /> Retry
                  </Button>
                )}
              </div>
            )}
          />
        </TabsContent>
      </Tabs>

      <ConfirmDialog
        open={confirmBroadcast !== null}
        onOpenChange={(open) => !open && setConfirmBroadcast(null)}
        title={`Send to ${confirmBroadcast?.length ?? 0} customers?`}
        description="Each customer gets their own copy with the placeholders filled in. This can't be undone."
        confirmLabel="Send"
        busyLabel="Sending…"
        busy={send.isPending}
        onConfirm={() => {
          if (!confirmBroadcast) return;
          send.mutate(
            { customerIds: confirmBroadcast.map((c) => c.customer_id), message, broadcast: true },
            { onSettled: () => setConfirmBroadcast(null) },
          );
        }}
      />
    </div>
  );
};

function Stat({ label, value, icon: Icon, tone, loading }: { label: string; value: number; icon: React.ComponentType<{ className?: string }>; tone: string; loading: boolean }) {
  return (
    <Card>
      <CardContent className="flex items-center justify-between p-4">
        <div>
          <p className="text-sm text-muted-foreground">{label}</p>
          {loading ? <Skeleton className="mt-1 h-7 w-12" /> : <p className="text-2xl font-bold tabular-nums">{value}</p>}
        </div>
        <Icon className={cn("h-5 w-5", tone)} aria-hidden />
      </CardContent>
    </Card>
  );
}

function TemplatesTab({ templates, loading, onChanged, sample }: { templates: SmsTemplate[]; loading: boolean; onChanged: () => void; sample: Record<string, string> }) {
  const [editing, setEditing] = useState<{ id?: string; name: string; body: string } | null>(null);
  const [deleting, setDeleting] = useState<SmsTemplate | null>(null);
  const save = useMutation({
    mutationFn: saveTemplate,
    onSuccess: () => {
      toast.success("Template saved");
      setEditing(null);
    },
    onError: (e) => toast.error("Couldn't save the template", { description: getErrorMessage(e) }),
    onSettled: onChanged,
  });
  const remove = useMutation({
    mutationFn: deleteTemplate,
    onSuccess: () => {
      toast.success("Template deleted");
      setDeleting(null);
    },
    onError: (e) => toast.error("Couldn't delete", { description: getErrorMessage(e) }),
    onSettled: onChanged,
  });

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{editing?.id ? "Edit template" : "New template"}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="template-name">Name</Label>
            <Input id="template-name" value={editing?.name ?? ""} onChange={(e) => setEditing({ ...(editing ?? { body: "" }), name: e.target.value })} placeholder="e.g. Payment reminder" />
          </div>
          <MessageComposer id="template-body" value={editing?.body ?? ""} onChange={(body) => setEditing({ ...(editing ?? { name: "" }), body })} templates={[]} sample={sample} />
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button onClick={() => editing && save.mutate(editing)} disabled={!editing?.name.trim() || !editing?.body.trim() || save.isPending} className="w-full sm:w-auto">
              {save.isPending ? "Saving…" : "Save template"}
            </Button>
            {editing && (
              <Button variant="ghost" onClick={() => setEditing(null)} className="w-full sm:w-auto">
                Clear
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Saved templates</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <Skeleton className="h-32 w-full" />
          ) : templates.length === 0 ? (
            <EmptyState icon={MessageSquare} title="No templates yet" variant="minimal" />
          ) : (
            <ul className="divide-y">
              {templates.map((t) => (
                <li key={t.id} className="flex items-start justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="font-medium">{t.name}</p>
                    <p className="line-clamp-2 text-sm text-muted-foreground">{t.body}</p>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <Button variant="ghost" size="icon" onClick={() => setEditing({ id: t.id, name: t.name, body: t.body })} aria-label={`Edit ${t.name}`}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => setDeleting(t)} aria-label={`Delete ${t.name}`}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="Delete this template?"
        description={deleting?.name ?? ""}
        confirmLabel="Delete"
        busyLabel="Deleting…"
        destructive
        busy={remove.isPending}
        onConfirm={() => deleting && remove.mutate(deleting.id)}
      />
    </div>
  );
}

export default MessagingPage;
