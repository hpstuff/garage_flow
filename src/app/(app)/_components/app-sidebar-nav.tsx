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

interface AppSidebarNavProps {
  /**
   * Nav item keys to omit entirely (GF-20) — e.g. `appointments` when a
   * Location has turned off working-schedule enforcement. A group left with
   * no items after filtering renders nothing, not an empty label/separator.
   */
  hiddenKeys?: string[];
}

export function AppSidebarNav({ hiddenKeys = [] }: AppSidebarNavProps) {
  const t = useTranslations("nav");
  const tGroups = useTranslations("nav.groups");
  const pathname = usePathname();
  const activeHref = findActiveNavItem(pathname)?.href;

  return (
    <>
      {NAV_GROUPS.map((group, index) => {
        const items = group.items.filter((item) => !hiddenKeys.includes(item.key));
        if (items.length === 0) return null;

        return (
          <SidebarGroup key={group.label ?? `group-${index}`}>
            {group.label === null ? (
              index > 0 && <SidebarSeparator />
            ) : (
              <SidebarGroupLabel>{tGroups(group.label)}</SidebarGroupLabel>
            )}
            <SidebarMenu>
              {items.map(({ href, key, icon: Icon }) => (
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
        );
      })}
    </>
  );
}
