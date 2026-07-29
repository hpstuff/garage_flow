import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

const formFieldVariants = cva(
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

export type FormFieldProps = ComponentProps<"div"> & VariantProps<typeof formFieldVariants>;

export function FormField({ className, variant, ...props }: FormFieldProps) {
  return (
    <div
      className={cn(formFieldVariants({ variant, className }))}
      {...props}
    />
  );
}