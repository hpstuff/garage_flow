"use client";

import type { Route } from "next";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuLink,
  SidebarSeparator,
} from "@/components/ui/sidebar";
import { findActiveNavItem, NAV_GROUPS } from "./nav-items";

export function AppSidebarNav() {
  const t = useTranslations("nav");
  const tGroups = useTranslations("nav.groups");
  const pathname = usePathname();
  const activeHref = findActiveNavItem(pathname)?.href;

  return (
    <>
      {NAV_GROUPS.map((group, index) => (
        <SidebarGroup key={group.label ?? `group-${index}`}>
          {group.label === null ? (
            index > 0 && <SidebarSeparator />
          ) : (
            <SidebarGroupLabel>{tGroups(group.label)}</SidebarGroupLabel>
          )}
          <SidebarMenu>
            {group.items.map(({ href, key, icon: Icon }) => (
              <SidebarMenuItem key={href}>
                <SidebarMenuLink asChild variant={href === activeHref ? "active" : "default"}>
                  <Link href={href as Route}>
                    <Icon className="size-4 shrink-0" />
                    {t(key)}
                  </Link>
                </SidebarMenuLink>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroup>
      ))}
    </>
  );
}
