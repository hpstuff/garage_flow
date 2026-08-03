"use client";

import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { PanelLeft } from "lucide-react";
import type { ComponentProps } from "react";
import { createContext, useContext, useMemo } from "react";
import { cn } from "@/lib/utils";

/**
 * Sidebar — left navigation surface using the `--sidebar-*` tokens.
 * Composes a context provider for width/collapsible state, plus presentational
 * primitives: Header, Content, Footer, Group, Menu, MenuItem, Trigger, Separator.
 * Token-driven: no hard-coded colours; everything resolves through sidebar tokens.
 */

/* ------------------------------------------------------------------ */
/* Context                                                             */
/* ------------------------------------------------------------------ */

type SidebarContext = {
  state: "expanded" | "collapsed";
  open: boolean;
};

const SidebarContext = createContext<SidebarContext>({
  state: "expanded",
  open: true,
});

function useSidebar() {
  return useContext(SidebarContext);
}

/* ------------------------------------------------------------------ */
/* Provider                                                            */
/* ------------------------------------------------------------------ */

export function SidebarProvider({
  defaultOpen = true,
  open: openProp,
  onOpenChange,
  className,
  children,
  ...props
}: ComponentProps<"div"> & {
  defaultOpen?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const value = useMemo<SidebarContext>(() => {
    const isOpen = openProp ?? defaultOpen;
    return {
      state: isOpen ? "expanded" : "collapsed",
      open: isOpen,
    };
  }, [defaultOpen, openProp]);

  return (
    <SidebarContext.Provider value={value}>
      <div data-sidebar="provider" className={cn("flex min-h-screen w-full", className)} {...props}>
        {children}
      </div>
    </SidebarContext.Provider>
  );
}

/* ------------------------------------------------------------------ */
/* Sidebar (container)                                                 */
/* ------------------------------------------------------------------ */

const sidebarVariants = cva(
  "flex h-full flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-[width] duration-200 ease-in-out",
  {
    variants: {
      variant: {
        default: "w-64",
        collapsed: "w-16",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export type SidebarProps = ComponentProps<"aside"> & VariantProps<typeof sidebarVariants>;

export function Sidebar({ className, variant, ...props }: SidebarProps) {
  const { state } = useSidebar();
  const resolvedVariant = variant ?? (state === "collapsed" ? "collapsed" : "default");

  return (
    <aside
      data-sidebar="sidebar"
      data-state={state}
      className={cn(sidebarVariants({ variant: resolvedVariant }), className)}
      {...props}
    />
  );
}

/* ------------------------------------------------------------------ */
/* Header / Content / Footer                                           */
/* ------------------------------------------------------------------ */

export function SidebarHeader({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-sidebar="header"
      className={cn("flex h-14 items-center border-b border-sidebar-border px-4", className)}
      {...props}
    />
  );
}

export function SidebarContent({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-sidebar="content"
      className={cn("flex-1 overflow-y-auto px-2 py-3", className)}
      {...props}
    />
  );
}

export function SidebarFooter({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-sidebar="footer"
      className={cn("border-t border-sidebar-border px-4 py-3", className)}
      {...props}
    />
  );
}

/* ------------------------------------------------------------------ */
/* Group — labelled section of menu items                              */
/* ------------------------------------------------------------------ */

export function SidebarGroup({ className, ...props }: ComponentProps<"div">) {
  return <div data-sidebar="group" className={cn("flex flex-col gap-0.5", className)} {...props} />;
}

export function SidebarGroupLabel({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-sidebar="group-label"
      className={cn(
        "px-2 py-1.5 text-xs font-medium uppercase tracking-wider text-sidebar-foreground/60",
        className,
      )}
      {...props}
    />
  );
}

/* ------------------------------------------------------------------ */
/* Menu                                                                */
/* ------------------------------------------------------------------ */

export function SidebarMenu({ className, ...props }: ComponentProps<"ul">) {
  return <ul data-sidebar="menu" className={cn("flex flex-col gap-0.5", className)} {...props} />;
}

export function SidebarMenuItem({ className, ...props }: ComponentProps<"li">) {
  return <li data-sidebar="menu-item" className={cn("", className)} {...props} />;
}

/* ------------------------------------------------------------------ */
/* MenuAction — icon button inside a menu item                         */
/* ------------------------------------------------------------------ */

export function SidebarMenuAction({
  asChild,
  className,
  ...props
}: ComponentProps<"button"> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "button";
  return (
    <Comp
      data-sidebar="menu-action"
      className={cn(
        "inline-flex size-6 items-center justify-center rounded-md text-sidebar-foreground/60 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring [&_svg]:size-3.5 [&_svg]:shrink-0",
        className,
      )}
      {...props}
    />
  );
}

/* ------------------------------------------------------------------ */
/* MenuItem — the clickable row                                        */
/* ------------------------------------------------------------------ */

const sidebarMenuItemVariants = cva(
  "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring",
  {
    variants: {
      variant: {
        default:
          "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
        active: "bg-sidebar-primary text-sidebar-primary-foreground hover:bg-sidebar-primary/90",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export type SidebarMenuItemProps = ComponentProps<"a"> &
  VariantProps<typeof sidebarMenuItemVariants> & {
    asChild?: boolean;
  };

export function SidebarMenuLink({ asChild, className, variant, ...props }: SidebarMenuItemProps) {
  const Comp = asChild ? Slot : "a";
  return (
    <Comp
      data-sidebar="menu-link"
      className={cn(sidebarMenuItemVariants({ variant, className }))}
      {...props}
    />
  );
}

/* ------------------------------------------------------------------ */
/* Trigger — the hamburger-style toggle                                */
/* ------------------------------------------------------------------ */

export function SidebarTrigger({ className, ...props }: ComponentProps<"button">) {
  return (
    <button
      data-sidebar="trigger"
      type="button"
      className={cn(
        "inline-flex size-8 items-center justify-center rounded-md text-sidebar-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring",
        className,
      )}
      {...props}
    >
      <PanelLeft className="size-5" />
      <span className="sr-only">Toggle sidebar</span>
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Separator                                                           */
/* ------------------------------------------------------------------ */

export function SidebarSeparator({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-sidebar="separator"
      aria-hidden="true"
      className={cn("my-1.5 h-px bg-sidebar-border", className)}
      {...props}
    />
  );
}

export { sidebarMenuItemVariants, sidebarVariants, useSidebar };
