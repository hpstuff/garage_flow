import { ChevronLeft, ChevronRight, MoreHorizontal } from "lucide-react";
import type { ComponentProps } from "react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Pagination — token-driven page navigation controls.
 * Uses `buttonVariants` for consistent affordance with the rest of the system.
 * Items render as buttons (for actions) or links (for navigation).
 */

export function Pagination({ className, ...props }: ComponentProps<"nav">) {
  return (
    <nav
      aria-label="pagination"
      className={cn("mx-auto flex w-full justify-center", className)}
      {...props}
    />
  );
}

export function PaginationContent({ className, ...props }: ComponentProps<"ul">) {
  return <ul className={cn("flex flex-row items-center gap-1", className)} {...props} />;
}

export function PaginationItem({ className, ...props }: ComponentProps<"li">) {
  return <li className={cn("", className)} {...props} />;
}

export function PaginationLink({
  className,
  isActive,
  size = "icon",
  ...props
}: ComponentProps<"a"> & {
  isActive?: boolean;
  size?: "sm" | "icon";
}) {
  return (
    <a
      aria-current={isActive ? "page" : undefined}
      className={cn(
        buttonVariants({
          variant: isActive ? "outline" : "ghost",
          size,
        }),
        "cursor-pointer",
        className,
      )}
      {...props}
    />
  );
}

export function PaginationPrevious({ className, ...props }: ComponentProps<typeof PaginationLink>) {
  return (
    <PaginationLink
      aria-label="Go to previous page"
      size="default"
      className={cn("gap-1 pl-2.5", className)}
      {...props}
    >
      <ChevronLeft className="size-4" />
      <span>Previous</span>
    </PaginationLink>
  );
}

export function PaginationNext({ className, ...props }: ComponentProps<typeof PaginationLink>) {
  return (
    <PaginationLink
      aria-label="Go to next page"
      size="default"
      className={cn("gap-1 pr-2.5", className)}
      {...props}
    >
      <span>Next</span>
      <ChevronRight className="size-4" />
    </PaginationLink>
  );
}

export function PaginationEllipsis({ className, ...props }: ComponentProps<"span">) {
  return (
    <span
      aria-hidden="true"
      className={cn("flex size-9 items-center justify-center text-muted-foreground", className)}
      {...props}
    >
      <MoreHorizontal className="size-4" />
    </span>
  );
}
