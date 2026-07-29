import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

const fieldVariants = cva(
  "flex flex-col gap-2",
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

export type FieldProps = ComponentProps<"div"> & VariantProps<typeof fieldVariants>;

export function Field({ className, variant, ...props }: FieldProps) {
  return (
    <div
      className={cn(fieldVariants({ variant, className }))}
      {...props}
    />
  );
}