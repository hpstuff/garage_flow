import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export function Label({ className, ...props }: ComponentProps<"label">) {
  return (
    // biome-ignore lint/a11y/noLabelWithoutControl: reusable primitive — consumers associate it via htmlFor / children.
    <label
      className={cn("text-sm font-medium leading-none text-foreground", className)}
      {...props}
    />
  );
}
