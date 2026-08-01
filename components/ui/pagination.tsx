"use client";

import { Button, LinkButton } from "@/components/ui/button";
import { formatCount } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Previous / Next with a position label.
 *
 * There were three incompatible versions of this before: one built from
 * LinkButtons and driven by the URL, one from Buttons driven by state,
 * and one from raw `<button>` elements with no focus ring at all. They
 * disagreed on the label ("Page 2 of 9" vs "2 / 9"), on whether to hide
 * when there was only one page, and on whether a disabled control looked
 * disabled. This is one answer to all of them.
 *
 * Two driving modes, one component: pass `onPageChange` when the list is
 * client state (search results), or `hrefForPage` when the page lives in
 * the URL so a position can be linked to (the Masters items list). Pass
 * `pageSize` alongside `total` to get "Showing 1–50 of 2,633" instead of
 * a bare count.
 */
export function Pagination({
  page,
  pageCount,
  onPageChange,
  hrefForPage,
  total,
  pageSize,
  unit = "items",
  className,
}: {
  page: number;
  pageCount: number;
  /** State-driven lists. Provide this or `hrefForPage`. */
  onPageChange?: (page: number) => void;
  /** URL-driven lists — Previous/Next render as real links. */
  hrefForPage?: (page: number) => string;
  /** Optional row count, shown alongside so the numbers mean something. */
  total?: number;
  /** With `total`, upgrades the label to "Showing a–b of N". */
  pageSize?: number;
  unit?: string;
  className?: string;
}) {
  // Nothing to page through. Rendered as nothing rather than as two dead
  // buttons, which is what one of the three versions used to do.
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

  const step = (target: number, text: string, enabled: boolean) =>
    hrefForPage && enabled ? (
      <LinkButton href={hrefForPage(target)} variant="secondary" size="sm">
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
          {step(page - 1, "Previous", page > 1)}
          <span className="text-muted px-1 text-xs tabular-nums">
            Page {page} of {pageCount}
          </span>
          {step(page + 1, "Next", page < pageCount)}
        </div>
      )}
    </div>
  );
}
