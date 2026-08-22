import { cn } from "@/lib/utils";
import type { InputHTMLAttributes } from "react";

/**
 * `indeterminate` is the native half-ticked state — a parent box whose
 * children are partly selected. The DOM only exposes it as a property,
 * never an attribute, hence the ref callback.
 */
export function Checkbox({
  className,
  indeterminate,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { indeterminate?: boolean }) {
  return (
    <input
      type="checkbox"
      ref={(node) => {
        if (node) node.indeterminate = indeterminate ?? false;
      }}
      className={cn(
        "border-border text-accent accent-accent focus-visible:ring-accent size-4 shrink-0 rounded-md border transition-colors focus-visible:ring-2 focus-visible:outline-none disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}
