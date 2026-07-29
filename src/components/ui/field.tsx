"use client";

import { cloneElement, type ReactElement, type ReactNode, useId } from "react";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/** Props the control child must accept so `Field` can wire label + a11y onto it. */
type ControlProps = {
  id?: string;
  "aria-invalid"?: boolean;
  "aria-describedby"?: string;
};

export type FieldProps = {
  /** Field label; associated with the control via `htmlFor`. */
  label?: ReactNode;
  /** Optional helper text rendered below the control. */
  description?: ReactNode;
  /** Error message (e.g. from react-hook-form + Zod, ADR-0016). Presence flips `aria-invalid`. */
  error?: ReactNode;
  /** Force the control id (defaults to the child's own `id`, else a generated one). */
  htmlFor?: string;
  className?: string;
  /** The single control element (`Input`, `Select`, `Textarea`, `Checkbox`, …). */
  children: ReactElement<ControlProps>;
};

/**
 * Label + control + error/description wrapper with the a11y wiring done once
 * (`htmlFor`, `aria-invalid`, `aria-describedby`). Transport-agnostic: pass an
 * `error` string from react-hook-form/Zod and it renders — no form library
 * dependency (ADR-0016 keeps validation authoritative in the service).
 */
export function Field({ label, description, error, htmlFor, className, children }: FieldProps) {
  const generatedId = useId();
  const id = htmlFor ?? children.props.id ?? generatedId;
  const descriptionId = `${id}-description`;
  const errorId = `${id}-error`;
  const hasError = Boolean(error);

  const describedBy =
    cn(
      description ? descriptionId : undefined,
      hasError ? errorId : undefined,
      children.props["aria-describedby"],
    ) || undefined;

  const control = cloneElement(children, {
    id,
    "aria-invalid": hasError || children.props["aria-invalid"],
    "aria-describedby": describedBy,
  });

  return (
    <div className={cn("space-y-1.5", className)}>
      {label ? <Label htmlFor={id}>{label}</Label> : null}
      {control}
      {description ? (
        <p id={descriptionId} className="text-sm text-muted-foreground">
          {description}
        </p>
      ) : null}
      {hasError ? (
        <p id={errorId} className="text-sm font-medium text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
