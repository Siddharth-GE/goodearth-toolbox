import { cn } from "@/lib/utils";
import type { HTMLAttributes } from "react";

export function Card({
  className,
  interactive = false,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  /** A card that is itself a link/button — lifts and picks up the float shadow on hover. */
  interactive?: boolean;
}) {
  return (
    <div
      className={cn(
        "border-border bg-surface rounded-2xl border",
        interactive &&
          "ease-out-quint hover:border-foreground/15 hover:shadow-float transition-[transform,border-color,box-shadow] duration-200 hover:-translate-y-0.5",
        className,
      )}
      {...props}
    />
  );
}
