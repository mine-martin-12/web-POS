import React, { useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { Archive, ArchiveRestore, Check, CornerUpLeft, MessageSquareQuote, Pencil, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { getErrorMessage } from "@/lib/errors";
import { cn } from "@/lib/utils";
import { useArchiveChange, useReviewChange } from "../hooks";
import { fieldLabel, formatChangeValue, type Lookups } from "../lib";
import { STATUS_LABELS, TABLE_LABELS, type ChangeDecision, type ChangeRequest } from "../types";

const STATUS_TONE: Record<ChangeRequest["status"], string> = {
  pending: "border-warning/40 bg-warning/15",
  approved: "border-success/30 bg-success/15 text-success",
  sent_back_for_review: "border-primary/30 bg-primary/10 text-primary",
  rejected: "border-destructive/30 bg-destructive/10 text-destructive",
};

interface ReviewCardProps {
  change: ChangeRequest;
  recordLabel: string;
  requester: string;
  reviewer?: string;
  lookups: Lookups;
  canReview: boolean;
  isMine: boolean;
  highlighted: boolean;
  onResubmit: (change: ChangeRequest) => void;
}

export function ReviewCard({ change, recordLabel, requester, reviewer, lookups, canReview, isMine, highlighted, onResubmit }: ReviewCardProps) {
  const review = useReviewChange();
  const archive = useArchiveChange();
  const [note, setNote] = useState("");
  const [deciding, setDeciding] = useState<ChangeDecision | null>(null);

  const decide = async (decision: ChangeDecision) => {
    if (decision === "send_back" && !note.trim()) {
      toast.error("Add a note", { description: "Tell the requester what to change before sending it back." });
      return;
    }
    setDeciding(decision);
    try {
      await review.mutateAsync({ id: change.id, decision, note: note.trim() });
      toast.success(decision === "approve" ? "Change approved and applied" : decision === "send_back" ? "Sent back for review" : "Change rejected");
    } catch (error) {
      toast.error("Couldn't review the change", { description: getErrorMessage(error) });
    } finally {
      setDeciding(null);
    }
  };

  const toggleArchive = async () => {
    try {
      await archive.mutateAsync({ id: change.id, archived: !change.archived_at });
    } catch (error) {
      toast.error("Couldn't update", { description: getErrorMessage(error) });
    }
  };

  const fields = Object.keys(change.new_values);
  const busy = review.isPending;

  return (
    <Card
      id={`change-${change.id}`}
      className={cn(
        "scroll-mt-24 transition-shadow duration-500",
        highlighted && "ring-2 ring-primary ring-offset-2 ring-offset-background",
        change.archived_at && "opacity-70",
      )}
    >
      <CardHeader className="flex flex-col gap-2 space-y-0 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">{TABLE_LABELS[change.table_name]}</Badge>
            <span className="truncate font-medium">{recordLabel}</span>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {isMine ? "You" : requester} asked {formatDistanceToNow(new Date(change.requested_at), { addSuffix: true })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {change.archived_at && <Badge variant="outline">Archived</Badge>}
          <Badge variant="outline" className={STATUS_TONE[change.status]}>
            {STATUS_LABELS[change.status]}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <blockquote className="flex gap-2 rounded-md border-l-4 border-primary/40 bg-muted/50 px-3 py-2 text-sm">
          <MessageSquareQuote className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
          <span>{change.reason}</span>
        </blockquote>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Field</TableHead>
                <TableHead>Current</TableHead>
                <TableHead>Requested</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {fields.map((field) => (
                <TableRow key={field}>
                  <TableCell className="font-medium">{fieldLabel(change.table_name, field)}</TableCell>
                  <TableCell className="text-muted-foreground line-through decoration-muted-foreground/50">
                    <span className="sensitive">{formatChangeValue(change.table_name, field, change.old_values[field], lookups)}</span>
                  </TableCell>
                  <TableCell className="font-medium text-primary">
                    <span className="sensitive">{formatChangeValue(change.table_name, field, change.new_values[field], lookups)}</span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {change.status !== "pending" && (change.admin_note || change.reviewed_at) && (
          <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm">
            <p className="text-muted-foreground">
              {STATUS_LABELS[change.status]}
              {reviewer ? ` by ${reviewer}` : ""}
              {change.reviewed_at ? ` ${formatDistanceToNow(new Date(change.reviewed_at), { addSuffix: true })}` : ""}
            </p>
            {change.admin_note && <p className="mt-1 font-medium">“{change.admin_note}”</p>}
          </div>
        )}

        {canReview && change.status === "pending" && (
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor={`note-${change.id}`}>Note to {requester} (optional; required to send back)</Label>
              <Textarea id={`note-${change.id}`} rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button onClick={() => decide("approve")} disabled={busy} className="w-full sm:w-auto">
                <Check className="mr-2 h-4 w-4" />
                {deciding === "approve" ? "Approving…" : "Approve"}
              </Button>
              <Button variant="outline" onClick={() => decide("send_back")} disabled={busy} className="w-full sm:w-auto">
                <CornerUpLeft className="mr-2 h-4 w-4" />
                {deciding === "send_back" ? "Sending back…" : "Send back"}
              </Button>
              <Button variant="ghost" onClick={() => decide("reject")} disabled={busy} className="w-full text-destructive hover:text-destructive sm:w-auto">
                <X className="mr-2 h-4 w-4" />
                {deciding === "reject" ? "Rejecting…" : "Reject"}
              </Button>
            </div>
          </div>
        )}

        {isMine && change.status === "sent_back_for_review" && (
          <Button onClick={() => onResubmit(change)} className="w-full sm:w-auto">
            <Pencil className="mr-2 h-4 w-4" />
            Edit &amp; resubmit
          </Button>
        )}

        {canReview && change.status !== "pending" && (
          <Button variant="ghost" size="sm" onClick={toggleArchive} disabled={archive.isPending}>
            {change.archived_at ? <ArchiveRestore className="mr-2 h-4 w-4" /> : <Archive className="mr-2 h-4 w-4" />}
            {change.archived_at ? "Unarchive" : "Archive"}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
