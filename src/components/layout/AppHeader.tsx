import React, { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { ThemeToggle } from "@/components/common/ThemeToggle";
import { findPage, QUICK_ACTIONS } from "@/config/routes";
import { SHORTCUTS } from "@/lib/platform";
import { cn } from "@/lib/utils";
import { Breadcrumbs } from "./Breadcrumbs";

const SCROLL_THRESHOLD_PX = 10;
const newSale = QUICK_ACTIONS.find((a) => a.id === "new-sale")!;

interface AppHeaderProps {
  onOpenPalette: () => void;
  /** Extra controls (privacy toggle, notifications) rendered before the theme toggle. */
  actions?: React.ReactNode;
}

/** Sticky floating header; turns translucent with a blur once the page scrolls. */
export function AppHeader({ onOpenPalette, actions }: AppHeaderProps) {
  const { pathname } = useLocation();
  const [scrolled, setScrolled] = useState(false);
  const page = findPage(pathname);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > SCROLL_THRESHOLD_PX);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={cn(
        "sticky top-2 z-30 mx-2 mt-2 flex h-14 items-center gap-2 rounded-xl border px-2 transition-[background-color,box-shadow] duration-200 sm:px-3",
        scrolled
          ? "border-border/60 bg-card/75 shadow-md backdrop-blur-md supports-[backdrop-filter]:bg-card/60"
          : "bg-card",
      )}
    >
      <SidebarTrigger aria-label="Toggle sidebar" />
      <Separator orientation="vertical" className="h-5" />
      <Breadcrumbs className="hidden md:block" />
      <span className="truncate font-semibold md:hidden">{page?.title}</span>

      <div className="ml-auto flex items-center gap-1">
        <Button
          variant="outline"
          size="sm"
          onClick={onOpenPalette}
          className="hidden h-9 gap-2 text-muted-foreground sm:inline-flex"
          aria-label="Open command palette"
        >
          <Search className="h-4 w-4" aria-hidden />
          <span className="hidden lg:inline">Search…</span>
          <kbd className="pointer-events-none rounded border bg-muted px-1.5 font-mono text-[10px] font-medium">
            {SHORTCUTS.commandPalette.label}
          </kbd>
        </Button>
        <Button variant="ghost" size="icon" onClick={onOpenPalette} className="sm:hidden" aria-label="Search">
          <Search className="h-5 w-5" />
        </Button>
        {actions}
        <ThemeToggle />
        <Button asChild size="sm" className="ml-1 hidden sm:inline-flex">
          <Link to={newSale.to}>
            <Plus className="h-4 w-4" aria-hidden />
            {newSale.label}
          </Link>
        </Button>
      </div>
    </header>
  );
}
