import { cn } from "@/lib/utils";
import Link from "next/link";
import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "ground" | "groundOutline";
type Size = "sm" | "md" | "lg";

const variantClasses: Record<Variant, string> = {
  primary: "bg-accent text-accent-foreground hover:bg-accent-hover",
  secondary: "bg-surface-raised text-foreground border border-border hover:border-foreground/30",
  ghost: "text-foreground hover:bg-foreground/[0.05]",
  // What destroys for good, pressed on purpose.
  danger: "bg-danger text-danger-foreground hover:bg-danger/90",
  // On a brand ground (DESIGN.md): the ground colours inverted, and a hairline of the ground ink.
  ground: "bg-on-ground text-ground hover:bg-on-ground/90 focus-visible:ring-on-ground/40",
  groundOutline:
    "border border-on-ground/45 text-on-ground hover:bg-on-ground/10 focus-visible:ring-on-ground/40",
};

const sizeClasses: Record<Size, string> = {
  // sm exists so screens stop overriding `md` by hand.
  sm: "h-8 px-2.5 text-xs",
  md: "h-10 px-4 text-sm",
  lg: "h-12 px-6 text-base",
};

// disabled:opacity-50 lives here, not on `primary`, so every variant dims when disabled.
const base =
  "inline-flex items-center justify-center gap-2 rounded-xl font-medium tracking-[0.02em] transition-[transform,background-color,border-color,opacity,box-shadow] duration-150 ease-out-quint active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent/25";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

export function Button({
  className,
  variant = "primary",
  size = "md",
  // Defaults to type="button": a submit is something you ask for, not inherit.
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
  /** Plain anchor instead of next/link, for downloads and external sites: next/link prefetches on hover and would build a generated file. */
  plain?: boolean;
  /** Another site, in a new tab with no referrer. Implies `plain`. */
  newTab?: boolean;
}

export function LinkButton({
  href,
  className,
  variant = "primary",
  size = "md",
  children,
  plain = false,
  newTab = false,
}: LinkButtonProps) {
  const classes = cn(base, variantClasses[variant], sizeClasses[size], className);

  if (newTab) {
    return (
      <a href={href} target="_blank" rel="noreferrer" className={classes}>
        {children}
      </a>
    );
  }

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
