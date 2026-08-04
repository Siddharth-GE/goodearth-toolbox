import { cn } from "@/lib/utils";
import Link from "next/link";
import type { ReactNode } from "react";

/**
 * The title block at the top of a dashboard screen: name, one-line
 * description, optional back-link above and actions beside.
 *
 * Eight pages carried this same block hand-typed — identical classes,
 * eight chances to drift — before it became a component. It is NOT
 * PageHeader (app/marathon/_components/page-header.tsx): that one is
 * the sticky, backdrop-blurred bar for kiosk-style screens with real
 * scroll length (Marathon); this is the static heading a dashboard
 * page starts with.
 */
export function PageTitle({
  title,
  description,
  backHref,
  backLabel,
  actions,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  /** Rendered as "← backLabel" above the title. */
  backHref?: string;
  backLabel?: ReactNode;
  /** Buttons/badges laid against the right edge, wrapping under on small screens. */
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-start justify-between gap-3", className)}>
      <div className="min-w-0">
        {backHref && (
          <Link href={backHref} className="text-muted hover:text-foreground text-xs font-medium">
            ← {backLabel ?? "Back"}
          </Link>
        )}
        <h1 className={cn("text-foreground text-lg font-bold tracking-tight", backHref && "mt-1")}>
          {title}
        </h1>
        {description && <p className="text-muted text-sm">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
