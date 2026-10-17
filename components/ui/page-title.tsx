import { cn } from "@/lib/utils";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

/** The static heading a dashboard page starts with. Not PageHeader (app/marathon/_components), the sticky bar for kiosk screens. */
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
  backHref?: string;
  backLabel?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-start justify-between gap-3", className)}>
      <div className="min-w-0">
        {backHref && (
          <Link
            href={backHref}
            className="text-muted hover:text-foreground inline-flex items-center gap-1 text-xs transition-colors"
          >
            <ArrowLeft className="size-3.5" aria-hidden />
            {backLabel ?? "Back"}
          </Link>
        )}
        <h1
          className={cn(
            "text-foreground text-2xl font-semibold tracking-tight text-balance",
            backHref && "mt-1",
          )}
        >
          {title}
        </h1>
        {description && <p className="text-muted mt-1 max-w-prose text-sm">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
