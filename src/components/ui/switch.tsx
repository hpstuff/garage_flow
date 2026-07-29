import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

const switchVariants = cva(
  "peer inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "bg-primary",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export type SwitchProps = ComponentProps<"input"> & VariantProps<typeof switchVariants>;

export function Switch({ className, variant, ...props }: SwitchProps) {
  return (
    <input
      type="checkbox"
      role="switch"
      className={cn(switchVariants({ variant, className }))}
      {...props}
    />
  );
}