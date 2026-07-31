"use client";

import * as ProgressPrimitive from "@radix-ui/react-progress";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

/**
 * Linear progress bar (Radix, ADR-0017). Track is `primary` at 20%, fill is
 * `primary` — token-driven, reads correctly in light and dark.
 */
export function Progress({
  className,
  value,
  ...props
}: ComponentProps<typeof ProgressPrimitive.Root>) {
  return (
    <ProgressPrimitive.Root
      className={cn("relative h-2 w-full overflow-hidden rounded-full bg-primary/20", className)}
      {...props}
    >
      <ProgressPrimitive.Indicator
        className="size-full flex-1 bg-primary transition-all"
        style={{ transform: `translateX(-${100 - (value ?? 0)}%)` }}
      />
    </ProgressPrimitive.Root>
  );
}
