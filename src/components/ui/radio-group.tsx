import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

const radioGroupVariants = cva(
  "flex h-4 w-4 shrink-0 rounded-full border border-primary ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "bg-background",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export type RadioGroupProps = ComponentProps<"input"> & VariantProps<typeof radioGroupVariants>;

export function RadioGroup({ className, variant, ...props }: RadioGroupProps) {
  return (
    <input
      type="radio"
      className={cn(radioGroupVariants({ variant, className }))}
      {...props}
    />
  );
}