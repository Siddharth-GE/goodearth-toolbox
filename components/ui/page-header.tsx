import type { ReactNode } from "react";

// The sticky title-bar treatment proven across Marathon's screens:
// stays reachable while the rest of the page scrolls underneath, quiet
// enough not to read as a heavy app-bar. `children` overrides the
// title/subtitle block for screens that need something other than a
// plain heading there (e.g. a NavTabs row).
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
    <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-background/95 px-5 py-4 backdrop-blur">
      <div>
        {children ?? (
          <>
            {title && <h1 className="text-lg font-bold text-foreground">{title}</h1>}
            {subtitle && <p className="text-xs text-muted">{subtitle}</p>}
          </>
        )}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}
