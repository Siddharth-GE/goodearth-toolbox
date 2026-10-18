"use client";

import { Button, LinkButton } from "@/components/ui/button";
import { formatCount } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Previous / Next with a position label. Pass `onPageChange` for client state or `hrefForPage` when the page lives in the URL;
 * add `pageSize` alongside `total` for "Showing 1–50 of 2,633".
 */
export function Pagination({
  page,
  pageCount,
  onPageChange,
  prevHref,
  nextHref,
  total,
  pageSize,
  unit = "items",
  className,
}: {
  page: number;
  pageCount: number;
  onPageChange?: (page: number) => void;
  /** URL-driven lists. Plain strings (null at either end), not a callback: a Server Component cannot pass a function to a Client Component, and `next build` misses it. */
  prevHref?: string | null;
  nextHref?: string | null;
  total?: number;
  pageSize?: number;
  unit?: string;
  className?: string;
}) {
  // Nothing to page through: render nothing, not two dead buttons.
  if (pageCount <= 1 && total === undefined) return null;

  let label: string | null = null;
  if (total !== undefined) {
    if (pageSize !== undefined && total > 0) {
      const first = (page - 1) * pageSize + 1;
      const last = Math.min(page * pageSize, total);
      label = `Showing ${formatCount(first)}–${formatCount(last)} of ${formatCount(total)}`;
    } else {
      label = `${formatCount(total)} ${total === 1 ? unit.replace(/s$/, "") : unit}`;
    }
  }

  const step = (target: number, href: string | null | undefined, text: string, enabled: boolean) =>
    href && enabled ? (
      <LinkButton href={href} variant="secondary" size="sm">
        {text}
      </LinkButton>
    ) : (
      <Button
        variant="secondary"
        size="sm"
        disabled={!enabled}
        onClick={onPageChange ? () => onPageChange(target) : undefined}
      >
        {text}
      </Button>
    );

  return (
    <div className={cn("flex flex-wrap items-center justify-between gap-3", className)}>
      <p className="text-muted text-xs">{label}</p>

      {pageCount > 1 && (
        <div className="flex items-center gap-2">
          {step(page - 1, prevHref, "Previous", page > 1)}
          <span className="text-muted px-1 text-xs tabular-nums">
            Page {page} of {pageCount}
          </span>
          {step(page + 1, nextHref, "Next", page < pageCount)}
        </div>
      )}
    </div>
  );
}
