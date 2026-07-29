import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export type SeparatorProps = ComponentProps<"div"> & {
  orientation?: "horizontal" | "vertical";
};

/** Thin decorative divider, hidden from assistive tech. */
export function Separator({ className, orientation = "horizontal", ...props }: SeparatorProps) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "shrink-0 bg-border",
        orientation === "horizontal" ? "h-px w-full" : "h-full w-px",
        className,
      )}
      {...props}
    />
  );
}
