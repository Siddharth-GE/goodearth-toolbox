"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Previous / Next with a position label.
 *
 * There were three incompatible versions of this before: one built from
 * LinkButtons and driven by the URL, one from Buttons driven by state,
 * and one from raw `<button>` elements with no focus ring at all. They
 * disagreed on the label ("Page 2 of 9" vs "2 / 9"), on whether to hide
 * when there was only one page, and on whether a disabled control looked
 * disabled. This is one answer to all three.
 *
 * Client-side by design: every list that pages is already a Client
 * Component holding its own search state. The Masters items list is the
 * exception — it pages through the URL so a page can be linked to — and
 * it passes hrefs instead of handlers.
 */
export function Pagination({
  page,
  pageCount,
  onPageChange,
  total,
  unit = "items",
  className,
}: {
  page: number;
  pageCount: number;
  onPageChange: (page: number) => void;
  /** Optional row count, shown alongside so the numbers mean something. */
  total?: number;
  unit?: string;
  className?: string;
}) {
  // Nothing to page through. Rendered as nothing rather than as two dead
  // buttons, which is what one of the three versions used to do.
  if (pageCount <= 1 && total === undefined) return null;

  return (
    <div className={cn("flex flex-wrap items-center justify-between gap-3", className)}>
      <p className="text-muted text-xs">
        {total !== undefined &&
          `${total.toLocaleString("en-IN")} ${total === 1 ? unit.replace(/s$/, "") : unit}`}
      </p>

      {pageCount > 1 && (
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
          >
            Previous
          </Button>
          <span className="text-muted px-1 text-xs">
            Page {page} of {pageCount}
          </span>
          <Button
            variant="secondary"
            size="sm"
            disabled={page >= pageCount}
            onClick={() => onPageChange(page + 1)}
          >
            Next
          </Button>
        </div>
      )}
    </div>
  );
}
