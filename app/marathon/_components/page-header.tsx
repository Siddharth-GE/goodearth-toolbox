import type { ReactNode } from "react";

// Sticky title bar; `children` replaces the title and subtitle block.
export function PageHeader({
  title,
  subtitle,
  actions,
  children,
}: {
  title?: string;
  subtitle?: string;
  actions?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="border-border bg-background/95 sticky top-0 z-10 flex items-center justify-between border-b px-5 py-4 backdrop-blur">
      <div>
        {children ?? (
          <>
            {title && <h1 className="text-foreground text-lg font-bold">{title}</h1>}
            {subtitle && <p className="text-muted text-xs">{subtitle}</p>}
          </>
        )}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}
