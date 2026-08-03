"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { SidebarMenu, SidebarMenuItem, SidebarMenuLink } from "@/components/ui/sidebar";
import { findActiveNavItem, NAV_ITEMS } from "./nav-items";

export function AppSidebarNav() {
  const t = useTranslations("nav");
  const pathname = usePathname();
  const activeHref = findActiveNavItem(pathname)?.href;

  return (
    <SidebarMenu>
      {NAV_ITEMS.map(({ href, key, icon: Icon }) => (
        <SidebarMenuItem key={href}>
          <SidebarMenuLink asChild variant={href === activeHref ? "active" : "default"}>
            <Link href={href}>
              <Icon className="size-4 shrink-0" />
              {t(key)}
            </Link>
          </SidebarMenuLink>
        </SidebarMenuItem>
      ))}
    </SidebarMenu>
  );
}
