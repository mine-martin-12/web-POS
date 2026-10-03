import {
  Contact,
  HandCoins,
  LayoutDashboard,
  type LucideIcon,
  Package,
  PackagePlus,
  Settings,
  ShoppingCart,
  UserPlus,
  UserRoundPlus,
  Users,
} from "lucide-react";
import type { Capability } from "@/lib/permissions";

/**
 * The route registry. The sidebar, breadcrumbs, command palette and mobile action button
 * are all built from these lists, so none of them can link to a page that doesn't exist.
 * Adding a page: register its <Route> in App.tsx AND add it here.
 */

export const APP_HOME = "/app";

export type NavBadge = "overdueCredits";

export interface AppPage {
  path: string;
  title: string;
  description: string;
  icon: LucideIcon;
  /** Required capability; omitted = every member. */
  capability?: Capability;
  /** Sidebar section. Pages without one (e.g. Settings) live in the footer menu. */
  section?: "main" | "admin";
  badge?: NavBadge;
}

export const APP_PAGES: AppPage[] = [
  {
    path: APP_HOME,
    title: "Dashboard",
    description: "Today's sales and what needs attention",
    icon: LayoutDashboard,
    section: "main",
  },
  {
    path: "/app/sales",
    title: "Sales",
    description: "Record and review sales",
    icon: ShoppingCart,
    section: "main",
  },
  {
    path: "/app/credits",
    title: "Credits",
    description: "Customers who owe you and their payments",
    icon: HandCoins,
    section: "main",
    badge: "overdueCredits",
  },
  {
    path: "/app/customers",
    title: "Customers",
    description: "People you sell to, with masked phone numbers",
    icon: Contact,
    section: "main",
  },
  {
    path: "/app/products",
    title: "Products",
    description: "Stock levels and buying prices",
    icon: Package,
    section: "main",
  },
  {
    path: "/app/staff",
    title: "Team",
    description: "Invite staff and manage access",
    icon: Users,
    capability: "canManageUsers",
    section: "admin",
  },
  {
    path: "/app/settings",
    title: "Settings",
    description: "Your profile, business details and password",
    icon: Settings,
  },
];

export interface QuickAction {
  id: string;
  label: string;
  /** Short label for small screens ("Add" not "Add product"). */
  shortLabel: string;
  description: string;
  icon: LucideIcon;
  to: string;
  capability?: Capability;
}

/** Pages open their "create" dialog when they see these query params (see useActionParam). */
export const QUICK_ACTIONS: QuickAction[] = [
  {
    id: "new-sale",
    label: "New sale",
    shortLabel: "Sale",
    description: "Record a sale",
    icon: ShoppingCart,
    to: "/app/sales?new=1",
  },
  {
    id: "new-product",
    label: "Add product",
    shortLabel: "Add",
    description: "Add a product to your stock list",
    icon: PackagePlus,
    to: "/app/products?new=1",
  },
  {
    id: "new-customer",
    label: "Add customer",
    shortLabel: "Add",
    description: "Save a customer's name and phone",
    icon: UserRoundPlus,
    to: "/app/customers?new=1",
  },
  {
    id: "invite-member",
    label: "Invite team member",
    shortLabel: "Invite",
    description: "Send a staff invitation",
    icon: UserPlus,
    to: "/app/staff?invite=1",
    capability: "canManageUsers",
  },
];

export function findPage(pathname: string): AppPage | undefined {
  // Longest matching prefix wins, so /app/sales/123 resolves to Sales.
  return [...APP_PAGES]
    .sort((a, b) => b.path.length - a.path.length)
    .find((p) => pathname === p.path || pathname.startsWith(`${p.path}/`));
}

/** Old (pre-/app) URLs that must keep working. */
export const LEGACY_REDIRECTS: Record<string, string> = {
  "/dashboard": APP_HOME,
  "/sales": "/app/sales",
  "/credits": "/app/credits",
  "/products": "/app/products",
  "/users": "/app/staff",
  "/settings": "/app/settings",
};
