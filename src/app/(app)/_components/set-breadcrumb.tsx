"use client";

import { useEffect } from "react";
import { type BreadcrumbSegment, useBreadcrumbContext } from "./breadcrumb-context";

/**
 * Declares the current page's breadcrumb trail (beyond the app-name root),
 * e.g. `[{ label: "Vehicles", href: "/vehicles" }, { label: plate }]`. Renders
 * nothing — it only pushes `segments` into the header's `AppBreadcrumb` for as
 * long as this page is mounted, clearing on navigation away.
 */
export function SetBreadcrumb({ segments }: { segments: BreadcrumbSegment[] }) {
  const { setTrail } = useBreadcrumbContext();

  useEffect(() => {
    setTrail(segments);
    return () => setTrail(null);
  }, [setTrail, segments]);

  return null;
}
