import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { ComponentProps } from "react";

/** A rupee amount: the ₹ sits inside the field, the figures are tabular. */
export function MoneyInput({ className, ...props }: ComponentProps<"input">) {
  return (
    <div className="relative">
      <span
        aria-hidden
        className="text-muted pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-sm font-medium"
      >
        ₹
      </span>
      <Input
        inputMode="decimal"
        autoComplete="off"
        className={cn("aria-[invalid=true]:border-danger pl-7 font-medium tabular-nums", className)}
        {...props}
      />
    </div>
  );
}

/** A field's own error, under it. */
export function FieldError({ message }: { message?: string }) {
  return message ? (
    <p role="alert" className="text-danger text-xs font-medium">
      {message}
    </p>
  ) : null;
}

/** The small buttons under a field that fill it: "Full balance", "50%". */
export function QuickButton({ className, ...props }: ComponentProps<"button">) {
  return (
    <button
      type="button"
      className={cn(
        "bg-accent/10 text-accent hover:bg-accent/15 focus-visible:ring-accent/25 rounded-md px-2.5 py-1 text-xs font-semibold tabular-nums focus-visible:ring-4 focus-visible:outline-none",
        className,
      )}
      {...props}
    />
  );
}
