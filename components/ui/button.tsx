import { cn } from "@/lib/utils";
import Link from "next/link";
import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "ghost";
type Size = "sm" | "md" | "lg";

const variantClasses: Record<Variant, string> = {
  primary: "bg-accent text-accent-foreground hover:opacity-90",
  secondary:
    "bg-surface text-foreground border border-border hover:bg-black/[0.03] dark:hover:bg-white/[0.04]",
  ghost: "text-foreground hover:bg-black/[0.04] dark:hover:bg-white/[0.06]",
};

const sizeClasses: Record<Size, string> = {
  // sm exists because screens kept fighting `md` with an override, e.g.
  // `<Button size="md" className="h-7 px-2.5 text-xs">`.
  sm: "h-8 px-2.5 text-xs",
  md: "h-10 px-4 text-sm",
  lg: "h-12 px-6 text-base",
};

// disabled:opacity-50 lives here rather than on `primary`, where it used
// to be — every disabled secondary and ghost button in the app looked
// fully enabled, including the pagination controls at the end of a list.
const base =
  "inline-flex items-center justify-center gap-2 rounded-xl font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

export function Button({
  className,
  variant = "primary",
  size = "md",
  // A <button> inside a <form> defaults to type="submit", which caught
  // seven dialogs out — each one had to pass type="button" by hand to
  // stop a Cancel button submitting the form. Defaulting to "button"
  // means a submit is something you ask for, not something you inherit.
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(base, variantClasses[variant], sizeClasses[size], className)}
      {...props}
    />
  );
}

interface LinkButtonProps {
  href: string;
  variant?: Variant;
  size?: Size;
  className?: string;
  children: React.ReactNode;
  /**
   * Renders a plain anchor instead of a next/link. Use for anything that
   * isn't an app route — a file download, an external site. next/link
   * prefetches on hover, which for a generated file means the server
   * builds the whole thing just because a cursor passed over the button.
   */
  plain?: boolean;
}

export function LinkButton({
  href,
  className,
  variant = "primary",
  size = "md",
  children,
  plain = false,
}: LinkButtonProps) {
  const classes = cn(base, variantClasses[variant], sizeClasses[size], className);

  if (plain) {
    return (
      <a href={href} className={classes}>
        {children}
      </a>
    );
  }

  return (
    <Link href={href} className={classes}>
      {children}
    </Link>
  );
}
