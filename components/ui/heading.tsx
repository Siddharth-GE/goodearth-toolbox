import { cn } from "@/lib/utils";
import type { HTMLAttributes } from "react";

/** A titled part of a page ("Lines", "Payments"), in the brand's heading face. Smaller headings inside a card stay in the sans. */
export function Heading({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h2 className={cn("text-foreground font-display text-2xl font-medium", className)} {...props} />
  );
}
