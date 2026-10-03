import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { AlertTriangle, Bell, CheckCheck, ClipboardCheck, PackageX, UserPlus, X } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { formatBadge } from "@/hooks/useNavCounts";
import { DEFAULT_TIME_ZONE } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { resolveTarget, type Notification } from "../api";
import { useArchiveNotification, useMarkRead, useNotifications } from "../hooks";

function iconFor(kind: string) {
  if (kind.startsWith("change")) return ClipboardCheck;
  if (kind === "low_stock") return PackageX;
  if (kind === "credit_overdue") return AlertTriangle;
  if (kind === "member_joined") return UserPlus;
  return Bell;
}

export function NotificationBell() {
  const { business } = useAuth();
  const navigate = useNavigate();
  const notifications = useNotifications();
  const markRead = useMarkRead();
  const archive = useArchiveNotification();
  const [open, setOpen] = useState(false);
  const [opening, setOpening] = useState<string | null>(null);

  const list = notifications.data ?? [];
  const unread = list.filter((n) => !n.read_at);

  const openNotification = async (n: Notification) => {
    if (!n.read_at) markRead.mutate([n.id]);
    if (!n.link_table) return;
    setOpening(n.id);
    try {
      // Check the record still exists BEFORE navigating.
      const target = await resolveTarget(n, business?.timezone ?? DEFAULT_TIME_ZONE);
      if (!target) {
        toast.info("This item no longer exists", { description: "It may have been deleted or archived." });
        return;
      }
      setOpen(false);
      navigate(target);
    } finally {
      setOpening(null);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label={unread.length ? `Notifications, ${unread.length} unread` : "Notifications"}>
          <Bell className="h-5 w-5" />
          {unread.length > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-destructive-foreground animate-scale-in">
              {formatBadge(unread.length)}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[22rem] p-0">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <p className="font-semibold">Notifications</p>
          <Button
            variant="ghost"
            size="sm"
            disabled={!unread.length}
            onClick={() => markRead.mutate(unread.map((n) => n.id))}
            className="h-8 text-xs"
          >
            <CheckCheck className="mr-1.5 h-4 w-4" /> Mark all read
          </Button>
        </div>
        {notifications.isLoading ? (
          <div className="space-y-3 p-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : list.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
            <CheckCheck className="h-8 w-8 text-success" aria-hidden />
            <p className="font-medium">All caught up</p>
            <p className="text-sm text-muted-foreground">New activity that needs you will show up here.</p>
          </div>
        ) : (
          <ScrollArea className="max-h-[24rem]">
            <ul>
              {list.map((n) => {
                const Icon = iconFor(n.kind);
                return (
                  <li key={n.id} className={cn("group relative border-b last:border-0", !n.read_at && "bg-primary/5")}>
                    <button
                      type="button"
                      onClick={() => void openNotification(n)}
                      disabled={opening === n.id}
                      className="flex w-full gap-3 px-4 py-3 pr-16 text-left hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-none"
                    >
                      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                      <span className="min-w-0 space-y-0.5">
                        <span className={cn("block text-sm", !n.read_at && "font-semibold")}>{n.title}</span>
                        {n.body && <span className="block truncate text-xs text-muted-foreground">{n.body}</span>}
                        <span className="block text-xs text-muted-foreground">
                          {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                        </span>
                      </span>
                      {!n.read_at && <span className="absolute right-4 top-4 h-2 w-2 rounded-full bg-primary" aria-label="Unread" />}
                    </button>
                    <div className="absolute bottom-2 right-2 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                      {!n.read_at && (
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => markRead.mutate([n.id])} aria-label="Mark as read">
                          <CheckCheck className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => archive.mutate(n.id)} aria-label="Dismiss">
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </ScrollArea>
        )}
      </PopoverContent>
    </Popover>
  );
}
