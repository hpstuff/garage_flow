"use client";

import type { Route } from "next";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { Fragment } from "react";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { type BreadcrumbSegment, useBreadcrumbContext } from "./breadcrumb-context";
import { findActiveNavItem } from "./nav-items";

export function AppBreadcrumb() {
  const tApp = useTranslations("app");
  const tNav = useTranslations("nav");
  const pathname = usePathname();
  const { trail } = useBreadcrumbContext();
  const active = findActiveNavItem(pathname);

  // A page-declared trail (SetBreadcrumb) always wins — it reflects real data
  // (e.g. a vehicle's plate) the nav-derived fallback below can't know. Absent
  // that, fall back to the matched top-level nav section as the current page.
  const segments: BreadcrumbSegment[] =
    trail ?? (active && active.href !== "/dashboard" ? [{ label: tNav(active.key) }] : []);
  const isRoot = segments.length === 0;

  return (
    <Breadcrumb>
      <BreadcrumbList>
        <BreadcrumbItem>
          {isRoot ? (
            <BreadcrumbPage>{tApp("name")}</BreadcrumbPage>
          ) : (
            <BreadcrumbLink asChild>
              <Link href="/dashboard">{tApp("name")}</Link>
            </BreadcrumbLink>
          )}
        </BreadcrumbItem>
        {segments.map((segment, index) => {
          const isLast = index === segments.length - 1;
          return (
            <Fragment key={`${segment.href ?? ""}-${segment.label}`}>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                {!isLast && segment.href ? (
                  <BreadcrumbLink asChild>
                    <Link href={segment.href as Route}>{segment.label}</Link>
                  </BreadcrumbLink>
                ) : (
                  <BreadcrumbPage>{segment.label}</BreadcrumbPage>
                )}
              </BreadcrumbItem>
            </Fragment>
          );
        })}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
