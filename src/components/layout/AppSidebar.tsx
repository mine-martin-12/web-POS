import React from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { useTheme } from "next-themes";
import { Building2, ChevronsUpDown, Laptop, LogOut, Moon, Settings, Sun } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useSecurity } from "@/hooks/useSecurity";
import { formatBadge, useNavCounts } from "@/hooks/useNavCounts";
import { APP_HOME, APP_PAGES, type AppPage } from "@/config/routes";
import { initials } from "@/lib/format";
import { ROLE_LABELS } from "@/lib/permissions";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar";


function isActive(page: AppPage, pathname: string) {
  return page.path === APP_HOME ? pathname === APP_HOME : pathname === page.path || pathname.startsWith(`${page.path}/`);
}

export function AppSidebar() {
  const { profile, business, role, signOut } = useAuth();
  const security = useSecurity();
  const counts = useNavCounts();
  const { isMobile, setOpenMobile } = useSidebar();
  const { pathname } = useLocation();
  const { theme, setTheme } = useTheme();

  // On mobile the sidebar is a sheet: close it once a destination is chosen.
  const closeOnMobile = () => {
    if (isMobile) setOpenMobile(false);
  };

  const visible = APP_PAGES.filter((p) => !p.capability || security[p.capability]);
  const sections = [
    { key: "main", label: "Workspace", pages: visible.filter((p) => p.section === "main") },
    { key: "admin", label: "Admin", pages: visible.filter((p) => p.section === "admin") },
  ].filter((s) => s.pages.length > 0);

  return (
    <Sidebar variant="floating" collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild tooltip="Smart POS">
              <Link to={APP_HOME} onClick={closeOnMobile}>
                <span className="flex aspect-square size-8 items-center justify-center rounded-lg bg-gradient-primary text-white">
                  <Building2 className="size-4" aria-hidden />
                </span>
                <span className="grid flex-1 text-left leading-tight">
                  <span className="truncate font-semibold">Smart POS</span>
                  <span className="truncate text-xs text-muted-foreground">{business?.name}</span>
                </span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        {sections.map((section) => (
          <SidebarGroup key={section.key}>
            <SidebarGroupLabel>{section.label}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {section.pages.map((page) => {
                  const count = page.badge ? counts[page.badge] : undefined;
                  return (
                    <SidebarMenuItem key={page.path}>
                      <SidebarMenuButton
                        asChild
                        isActive={isActive(page, pathname)}
                        tooltip={page.title}
                        className="rounded-full data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-accent-foreground"
                      >
                        <NavLink to={page.path} end={page.path === APP_HOME} onClick={closeOnMobile}>
                          <page.icon aria-hidden />
                          <span>{page.title}</span>
                        </NavLink>
                      </SidebarMenuButton>
                      {count ? (
                        <SidebarMenuBadge
                          className="rounded-full bg-destructive/10 text-destructive"
                          aria-label={`${count} need attention`}
                        >
                          {formatBadge(count)}
                        </SidebarMenuBadge>
                      ) : null}
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton
                  size="lg"
                  tooltip="Account"
                  className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
                >
                  <Avatar className="h-8 w-8 rounded-lg">
                    <AvatarFallback className="rounded-lg bg-gradient-primary text-xs text-white">
                      {initials(profile?.first_name, profile?.last_name)}
                    </AvatarFallback>
                  </Avatar>
                  <span className="grid flex-1 text-left text-sm leading-tight">
                    <span className="truncate font-medium">
                      {profile?.first_name} {profile?.last_name}
                    </span>
                    <span className="truncate text-xs text-muted-foreground">{role ? ROLE_LABELS[role] : ""}</span>
                  </span>
                  <ChevronsUpDown className="ml-auto size-4" aria-hidden />
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent side={isMobile ? "top" : "right"} align="end" className="w-56">
                <DropdownMenuLabel className="font-normal">
                  <p className="truncate text-sm font-medium">
                    {profile?.first_name} {profile?.last_name}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">{profile?.email}</p>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link to="/app/settings" onClick={closeOnMobile}>
                    <Settings className="mr-2 h-4 w-4" />
                    Settings
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuLabel className="text-xs text-muted-foreground">Theme</DropdownMenuLabel>
                <DropdownMenuRadioGroup value={theme} onValueChange={setTheme}>
                  <DropdownMenuRadioItem value="light">
                    <Sun className="mr-2 h-4 w-4" />
                    Light
                  </DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="dark">
                    <Moon className="mr-2 h-4 w-4" />
                    Dark
                  </DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="system">
                    <Laptop className="mr-2 h-4 w-4" />
                    System
                  </DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => void signOut()} className="text-destructive focus:text-destructive">
                  <LogOut className="mr-2 h-4 w-4" />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
