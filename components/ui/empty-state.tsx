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
    <div className={cn("border-border bg-surface rounded-2xl border p-6 text-center", className)}>
      {Icon && <Icon className="text-muted mx-auto mb-3 size-8" />}
      <p className="text-foreground text-sm font-medium">{title}</p>
      {description && <p className="text-muted mt-1 text-sm">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
