"use client";

import { createContext, type ReactNode, useContext, useState } from "react";

export interface BreadcrumbSegment {
  label: string;
  /**
   * Omit on the current (deepest) segment — it renders as the non-link page
   * label. A plain `string` rather than Next's `Route`: typed-routes only
   * validates a literal template shape at the exact `Link` JSX call site, which
   * a value threaded through this context never is — `AppBreadcrumb` casts once
   * where it actually renders the `Link`.
   */
  href?: string;
}

interface BreadcrumbContextValue {
  trail: BreadcrumbSegment[] | null;
  setTrail: (trail: BreadcrumbSegment[] | null) => void;
}

const BreadcrumbContext = createContext<BreadcrumbContextValue | null>(null);

/**
 * Holds the current page's breadcrumb trail so a Server Component page can drive
 * the header's breadcrumb (the app shell's back-navigation, per the SnowUI
 * reference) without the header knowing about page-specific data. A page pushes
 * its trail via `SetBreadcrumb`; `AppBreadcrumb` reads it here.
 */
export function BreadcrumbProvider({ children }: { children: ReactNode }) {
  const [trail, setTrail] = useState<BreadcrumbSegment[] | null>(null);
  return (
    <BreadcrumbContext.Provider value={{ trail, setTrail }}>{children}</BreadcrumbContext.Provider>
  );
}

export function useBreadcrumbContext(): BreadcrumbContextValue {
  const ctx = useContext(BreadcrumbContext);
  if (!ctx) {
    throw new Error("useBreadcrumbContext must be used within a BreadcrumbProvider");
  }
  return ctx;
}
