import React, { Suspense, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { BrandedSpinner } from "@/components/common/BrandedSpinner";
import { PrivacyToggle } from "@/components/session/PrivacyToggle";
import { TrialBanner } from "@/components/session/TrialBanner";
import { usePrivacyMode } from "@/contexts/PrivacyModeContext";
import { SHORTCUTS } from "@/lib/platform";
import { EyeOff } from "lucide-react";
import { useApprovalsRealtime } from "@/features/approvals/hooks";
import { AppHeader } from "./AppHeader";
import { AppSidebar } from "./AppSidebar";
import { CommandPalette } from "./CommandPalette";
import { MobileFab } from "./MobileFab";

/** The signed-in app shell: sidebar, sticky header, command palette and page outlet. */
export function AppLayout() {
  const { pathname } = useLocation();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const privacy = usePrivacyMode();
  useApprovalsRealtime();

  return (
    <SidebarProvider>
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-background focus:px-4 focus:py-2 focus:shadow"
      >
        Skip to content
      </a>
      <AppSidebar />
      <SidebarInset>
        <TrialBanner />
        <AppHeader onOpenPalette={() => setPaletteOpen(true)} actions={<PrivacyToggle />} />
        <div id="main-content" tabIndex={-1} className="flex-1 p-4 pb-24 outline-none md:p-6 md:pb-6">
          {/* Keyed on the path so every page fades in. */}
          <div key={pathname} className="animate-fade-in">
            <Suspense fallback={<BrandedSpinner />}>
              <Outlet />
            </Suspense>
          </div>
        </div>
      </SidebarInset>
      <CommandPalette
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
        extraSettings={[
          {
            id: "privacy",
            label: privacy.enabled ? "Show amounts" : "Hide amounts (privacy mode)",
            description: "Blur money and chart values on screen",
            icon: EyeOff,
            shortcut: SHORTCUTS.privacyMode.label,
            run: privacy.toggle,
          },
        ]}
      />
      <MobileFab />
    </SidebarProvider>
  );
}
