import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("border-border bg-surface rounded-2xl border p-10 text-center", className)}>
      {Icon && (
        <div className="bg-foreground/[0.04] mx-auto mb-3 flex size-10 items-center justify-center rounded-full">
          <Icon className="text-muted size-5" aria-hidden />
        </div>
      )}
      <p className="text-foreground text-sm font-medium">{title}</p>
      {description && <p className="text-muted mt-1 text-sm">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
