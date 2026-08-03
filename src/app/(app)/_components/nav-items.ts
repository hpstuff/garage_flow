import {
  CalendarClock,
  Car,
  ClipboardList,
  KanbanSquare,
  LayoutDashboard,
  Settings,
  Users,
  Wrench,
} from "lucide-react";

/** The app's primary navigation, shared by the sidebar and the header breadcrumb. */
export const NAV_ITEMS = [
  { href: "/dashboard", key: "dashboard", icon: LayoutDashboard },
  { href: "/customers", key: "customers", icon: Users },
  { href: "/vehicles", key: "vehicles", icon: Car },
  { href: "/repair-orders", key: "repairOrders", icon: ClipboardList },
  { href: "/repair-orders/board", key: "board", icon: KanbanSquare },
  { href: "/appointments", key: "appointments", icon: CalendarClock },
  { href: "/mechanics", key: "mechanics", icon: Wrench },
  { href: "/settings", key: "settings", icon: Settings },
] as const;

/** The nav item whose href best matches `pathname` — longest match wins, so a
 * nested route (e.g. `/repair-orders/board`) doesn't also highlight its parent. */
export function findActiveNavItem(pathname: string) {
  return [...NAV_ITEMS]
    .filter((item) => pathname === item.href || pathname.startsWith(`${item.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0];
}
