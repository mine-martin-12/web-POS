import React, { useMemo, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { simulatedNote } from "@/data/mode";
import { Link2, Mail, MoreHorizontal, Pencil, Plus, UserCheck, Users, UserX, XCircle } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useActionParam } from "@/hooks/useActionParam";
import { useUrlState } from "@/hooks/useUrlState";
import { DataTable } from "@/components/common/data-table/DataTable";
import { EmptyState } from "@/components/common/EmptyState";
import { getErrorMessage } from "@/lib/errors";
import { ROLE_LABELS } from "@/lib/permissions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { EditMemberDialog } from "../components/EditMemberDialog";
import { InvitationLink, InviteMemberDialog } from "../components/InviteMemberDialog";
import { useInvitations, useMembers, useResendInvitation, useRevokeInvitation, useSetMemberActive } from "../hooks";
import type { Invitation, Member } from "../types";

const fullName = (m: { first_name: string | null; last_name: string | null; email: string }) =>
  `${m.first_name ?? ""} ${m.last_name ?? ""}`.trim() || m.email;

const StaffPage: React.FC = () => {
  const { user } = useAuth();
  const members = useMembers();
  const invitations = useInvitations();
  const setActive = useSetMemberActive();
  const resend = useResendInvitation();
  const revoke = useRevokeInvitation();

  const url = useUrlState();
  const search = url.get("q");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [editing, setEditing] = useState<Member | null>(null);
  const [toggling, setToggling] = useState<Member | null>(null);
  const [revoking, setRevoking] = useState<Invitation | null>(null);
  const [sharedLink, setSharedLink] = useState<string | null>(null);
  useActionParam("invite", () => setInviteOpen(true));

  // Invited people get a placeholder account straight away; list them under
  // "Pending invitations" until they accept, not as members.
  const pendingUserIds = useMemo(
    () => new Set((invitations.data ?? []).map((i) => i.user_id).filter(Boolean)),
    [invitations.data],
  );

  const visibleMembers = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (members.data ?? [])
      .filter((m) => !pendingUserIds.has(m.user_id))
      .filter((m) => !term || fullName(m).toLowerCase().includes(term) || m.email.toLowerCase().includes(term));
  }, [members.data, pendingUserIds, search]);

  const toggleActive = async () => {
    if (!toggling) return;
    const activate = !toggling.is_active;
    try {
      await setActive.mutateAsync({ userId: toggling.user_id, active: activate });
      toast.success(activate ? "Team member reactivated" : "Team member deactivated", {
        description: activate ? undefined : `${fullName(toggling)} can no longer sign in.`,
      });
      setToggling(null);
    } catch (error) {
      toast.error(activate ? "Couldn't reactivate" : "Couldn't deactivate", { description: getErrorMessage(error) });
    }
  };

  const resendInvitation = async (invitation: Invitation, delivery: "email" | "link") => {
    try {
      const result = await resend.mutateAsync({ id: invitation.id, delivery });
      if (result.actionLink) setSharedLink(result.actionLink);
      else toast.success(simulatedNote("Invitation re-sent"), { description: invitation.email });
    } catch (error) {
      toast.error("Couldn't resend the invitation", { description: getErrorMessage(error) });
    }
  };

  const revokeInvitation = async () => {
    if (!revoking) return;
    try {
      await revoke.mutateAsync(revoking.id);
      toast.success("Invitation revoked");
      setRevoking(null);
    } catch (error) {
      toast.error("Couldn't revoke the invitation", { description: getErrorMessage(error) });
    }
  };

  const openInvitations = invitations.data ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Team</h1>
          <p className="text-muted-foreground">Invite staff, set their roles and control who can sign in.</p>
        </div>
        <Button onClick={() => setInviteOpen(true)} className="w-full sm:w-auto">
          <Plus className="mr-2 h-4 w-4" />
          <span className="sm:hidden">Invite</span>
          <span className="hidden sm:inline">Invite member</span>
        </Button>
      </div>

      {openInvitations.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Pending invitations</CardTitle>
            <CardDescription>These people haven't set their password yet.</CardDescription>
          </CardHeader>
          <CardContent className="divide-y">
            {openInvitations.map((invitation) => {
              const expired = new Date(invitation.expires_at) < new Date();
              return (
                <div key={invitation.id} className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{fullName(invitation)}</p>
                    <p className="text-sm text-muted-foreground">
                      {invitation.email} · {ROLE_LABELS[invitation.role]} ·{" "}
                      <span className={expired ? "text-destructive" : undefined}>
                        {expired
                          ? "expired"
                          : `expires ${formatDistanceToNow(new Date(invitation.expires_at), { addSuffix: true })}`}
                      </span>
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={resend.isPending}
                      onClick={() => resendInvitation(invitation, "email")}
                    >
                      <Mail className="mr-2 h-4 w-4" />
                      Resend
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={resend.isPending}
                      onClick={() => resendInvitation(invitation, "link")}
                      aria-label={`Get a new invitation link for ${invitation.email}`}
                    >
                      <Link2 className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setRevoking(invitation)}
                      aria-label={`Revoke invitation for ${invitation.email}`}
                    >
                      <XCircle className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      <DataTable<Member>
        rows={visibleMembers}
        loading={members.isLoading}
        error={members.error}
        onRetry={() => members.refetch()}
        caption="Team members"
        getRowId={(m) => m.user_id}
        search={{ value: search, onChange: (v) => url.set({ q: v, page: null }), placeholder: "Search by name or email" }}
        filtered={!!search}
        onClearFilters={() => url.set({ q: null })}
        rowClassName={(m) => (m.is_active ? undefined : "opacity-60")}
        emptyState={
          <EmptyState
            icon={Users}
            title="It's just you so far"
            description="Invite your staff so they can record sales from their own accounts."
            action={{ label: "Invite a team member", onClick: () => setInviteOpen(true) }}
          />
        }
        columns={[
          {
            id: "name",
            header: "Name",
            sortValue: (m) => fullName(m).toLowerCase(),
            cell: (m) => (
              <span className="font-medium">
                {fullName(m)}
                {m.user_id === user?.id && (
                  <Badge variant="outline" className="ml-2">
                    You
                  </Badge>
                )}
              </span>
            ),
          },
          { id: "email", header: "Email", sortValue: (m) => m.email, cell: (m) => m.email },
          {
            id: "role",
            header: "Role",
            sortValue: (m) => m.role,
            cell: (m) => <Badge variant={m.role === "admin" ? "default" : "secondary"}>{ROLE_LABELS[m.role]}</Badge>,
          },
          { id: "status", header: "Status", cell: (m) => <MemberStatus member={m} /> },
          {
            id: "actions",
            header: <span className="sr-only">Actions</span>,
            className: "w-12",
            cell: (m) => (
              <MemberActions member={m} isSelf={m.user_id === user?.id} onEdit={setEditing} onToggle={setToggling} />
            ),
          },
        ]}
        mobileCard={(m) => (
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 space-y-1">
              <p className="truncate font-medium">
                {fullName(m)}
                {m.user_id === user?.id && <span className="text-muted-foreground"> (you)</span>}
              </p>
              <p className="truncate text-sm text-muted-foreground">{m.email}</p>
              <div className="flex gap-2">
                <Badge variant={m.role === "admin" ? "default" : "secondary"}>{ROLE_LABELS[m.role]}</Badge>
                <MemberStatus member={m} />
              </div>
            </div>
            <MemberActions member={m} isSelf={m.user_id === user?.id} onEdit={setEditing} onToggle={setToggling} />
          </div>
        )}
      />

      <InviteMemberDialog open={inviteOpen} onOpenChange={setInviteOpen} />
      <EditMemberDialog member={editing} isSelf={editing?.user_id === user?.id} onOpenChange={() => setEditing(null)} />

      <ConfirmDialog
        open={toggling !== null}
        onOpenChange={(open) => !open && setToggling(null)}
        title={toggling?.is_active ? "Deactivate team member?" : "Reactivate team member?"}
        description={
          toggling?.is_active
            ? `${toggling ? fullName(toggling) : ""} will be signed out and won't be able to sign in. Their sales and history are kept. You can reactivate them later.`
            : `${toggling ? fullName(toggling) : ""} will be able to sign in again with their existing password.`
        }
        confirmLabel={toggling?.is_active ? "Deactivate" : "Reactivate"}
        busyLabel={toggling?.is_active ? "Deactivating…" : "Reactivating…"}
        destructive={toggling?.is_active}
        busy={setActive.isPending}
        onConfirm={toggleActive}
      />

      <ConfirmDialog
        open={revoking !== null}
        onOpenChange={(open) => !open && setRevoking(null)}
        title="Revoke invitation?"
        description={`The invitation link sent to ${revoking?.email ?? ""} will stop working.`}
        confirmLabel="Revoke"
        busyLabel="Revoking…"
        destructive
        busy={revoke.isPending}
        onConfirm={revokeInvitation}
      />

      <Dialog open={sharedLink !== null} onOpenChange={(open) => !open && setSharedLink(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Share invitation link</DialogTitle>
            <DialogDescription>Send this one-time link to the new member. It expires in 7 days.</DialogDescription>
          </DialogHeader>
          {sharedLink && <InvitationLink link={sharedLink} onDone={() => setSharedLink(null)} />}
        </DialogContent>
      </Dialog>
    </div>
  );
};

function MemberStatus({ member }: { member: Member }) {
  return member.is_active ? (
    <Badge variant="outline" className="border-success/40 text-success">
      Active
    </Badge>
  ) : (
    <Badge variant="outline" className="text-muted-foreground">
      Deactivated
    </Badge>
  );
}

function MemberActions({
  member,
  isSelf,
  onEdit,
  onToggle,
}: {
  member: Member;
  isSelf: boolean;
  onEdit: (m: Member) => void;
  onToggle: (m: Member) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={`Actions for ${fullName(member)}`}>
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => onEdit(member)}>
          <Pencil className="mr-2 h-4 w-4" />
          Edit
        </DropdownMenuItem>
        {!isSelf && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={() => onToggle(member)}
              className={member.is_active ? "text-destructive focus:text-destructive" : undefined}
            >
              {member.is_active ? <UserX className="mr-2 h-4 w-4" /> : <UserCheck className="mr-2 h-4 w-4" />}
              {member.is_active ? "Deactivate" : "Reactivate"}
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default StaffPage;
