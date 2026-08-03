import {
  CalendarClock,
  Car,
  ClipboardList,
  KanbanSquare,
  LayoutDashboard,
  type LucideIcon,
  Settings,
  Users,
  Wrench,
} from "lucide-react";

interface NavItem {
  href: string;
  key: string;
  icon: LucideIcon;
}

interface NavGroup {
  /** i18n key under `nav.groups`, or `null` to render unlabeled. */
  label: string | null;
  items: NavItem[];
}

/**
 * The app's primary navigation, grouped by how the front desk actually uses it:
 * the dashboard alone, the day-to-day work (Repair Orders/Kanban/Appointments),
 * the reference registries (Customers/Vehicles/Mechanics), then Settings on its
 * own. A group with `label: null` renders unlabeled — used for the lone
 * dashboard link and, separated by a divider, Settings.
 */
export const NAV_GROUPS: NavGroup[] = [
  {
    label: null,
    items: [{ href: "/dashboard", key: "dashboard", icon: LayoutDashboard }],
  },
  {
    label: "work",
    items: [
      { href: "/repair-orders", key: "repairOrders", icon: ClipboardList },
      { href: "/repair-orders/board", key: "board", icon: KanbanSquare },
      { href: "/appointments", key: "appointments", icon: CalendarClock },
    ],
  },
  {
    label: "directory",
    items: [
      { href: "/customers", key: "customers", icon: Users },
      { href: "/vehicles", key: "vehicles", icon: Car },
      { href: "/mechanics", key: "mechanics", icon: Wrench },
    ],
  },
  {
    label: null,
    items: [{ href: "/settings", key: "settings", icon: Settings }],
  },
];

/** Every nav item, flattened — the breadcrumb matches against this, not the groups. */
export const NAV_ITEMS: NavItem[] = NAV_GROUPS.flatMap((group) => group.items);

/** The nav item whose href best matches `pathname` — longest match wins, so a
 * nested route (e.g. `/repair-orders/board`) doesn't also highlight its parent. */
export function findActiveNavItem(pathname: string): NavItem | undefined {
  return [...NAV_ITEMS]
    .filter((item) => pathname === item.href || pathname.startsWith(`${item.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0];
}
