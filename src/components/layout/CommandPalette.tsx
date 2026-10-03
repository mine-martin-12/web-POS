import React, { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useTheme } from "next-themes";
import { Laptop, LogOut, Moon, PanelLeft, Sun } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useSecurity } from "@/hooks/useSecurity";
import { APP_PAGES, QUICK_ACTIONS } from "@/config/routes";
import { isModKey, SHORTCUTS } from "@/lib/platform";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import { useSidebar } from "@/components/ui/sidebar";

export interface PaletteCommand {
  id: string;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  shortcut?: string;
  run: () => void;
}

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Feature-provided commands (e.g. privacy mode) for the Settings group. */
  extraSettings?: PaletteCommand[];
}

/** Ctrl/⌘+K palette. Every entry comes from the route registry or a working handler. */
export function CommandPalette({ open, onOpenChange, extraSettings = [] }: CommandPaletteProps) {
  const navigate = useNavigate();
  const security = useSecurity();
  const { signOut } = useAuth();
  const { setTheme } = useTheme();
  const { toggleSidebar } = useSidebar();

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isModKey(event) && !event.shiftKey && event.key.toLowerCase() === "k") {
        event.preventDefault();
        onOpenChange(!open);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onOpenChange]);

  const run = (fn: () => void) => () => {
    onOpenChange(false);
    fn();
  };

  const allowed = <T extends { capability?: keyof typeof security }>(item: T) =>
    !item.capability || security[item.capability] === true;

  const settings: PaletteCommand[] = [
    ...extraSettings,
    {
      id: "sidebar",
      label: "Toggle sidebar",
      description: "Collapse or expand the navigation",
      icon: PanelLeft,
      shortcut: SHORTCUTS.toggleSidebar.label,
      run: toggleSidebar,
    },
    { id: "light", label: "Light theme", description: "Use the light colour scheme", icon: Sun, run: () => setTheme("light") },
    { id: "dark", label: "Dark theme", description: "Use the dark colour scheme", icon: Moon, run: () => setTheme("dark") },
    {
      id: "system",
      label: "System theme",
      description: "Follow your device setting",
      icon: Laptop,
      run: () => setTheme("system"),
    },
    { id: "signout", label: "Sign out", description: "End your session on this device", icon: LogOut, run: () => void signOut() },
  ];

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder="Type a command or search…" />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        <CommandGroup heading="Quick actions">
          {QUICK_ACTIONS.filter(allowed).map((action) => (
            <CommandItem key={action.id} value={`${action.label} ${action.description}`} onSelect={run(() => navigate(action.to))}>
              <action.icon className="mr-2 h-4 w-4" aria-hidden />
              <PaletteLabel label={action.label} description={action.description} />
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Navigation">
          {APP_PAGES.filter(allowed).map((page) => (
            <CommandItem
              key={page.path}
              value={`Go to ${page.title} ${page.description}`}
              onSelect={run(() => navigate(page.path))}
            >
              <page.icon className="mr-2 h-4 w-4" aria-hidden />
              <PaletteLabel label={page.title} description={page.description} />
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Settings">
          {settings.map((command) => (
            <CommandItem key={command.id} value={`${command.label} ${command.description}`} onSelect={run(command.run)}>
              <command.icon className="mr-2 h-4 w-4" aria-hidden />
              <PaletteLabel label={command.label} description={command.description} />
              {command.shortcut && <CommandShortcut>{command.shortcut}</CommandShortcut>}
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}

function PaletteLabel({ label, description }: { label: string; description: string }) {
  return (
    <span className="flex min-w-0 flex-col">
      <span className="truncate">{label}</span>
      <span className="truncate text-xs text-muted-foreground">{description}</span>
    </span>
  );
}
