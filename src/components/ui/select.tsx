import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

const selectVariants = cva(
  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export type SelectProps = ComponentProps<"select"> & VariantProps<typeof selectVariants>;

export function Select({ className, variant, ...props }: SelectProps) {
  return (
    <select
      className={cn(selectVariants({ variant, className }))}
      {...props}
    />
  );
}