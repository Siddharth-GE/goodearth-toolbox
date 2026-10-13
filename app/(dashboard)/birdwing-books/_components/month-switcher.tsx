import { LinkButton } from "@/components/ui/button";
import { monthLabel, shiftMonth } from "@/lib/birdwing-books/shared";
import { ChevronLeft, ChevronRight } from "lucide-react";

/** Earlier · the month · later, as plain links — the month lives in the URL. */
export function MonthSwitcher({
  month,
  hrefFor,
}: {
  /** "YYYY-MM" */
  month: string;
  hrefFor: (month: string) => string;
}) {
  return (
    <div className="flex items-center gap-2">
      <LinkButton
        href={hrefFor(shiftMonth(month, -1))}
        variant="secondary"
        size="sm"
        className="px-2"
      >
        <ChevronLeft className="size-4" aria-hidden />
        <span className="sr-only">Earlier month</span>
      </LinkButton>
      <h2 className="text-foreground min-w-36 text-center text-[15px] font-semibold tracking-tight">
        {monthLabel(month)}
      </h2>
      <LinkButton
        href={hrefFor(shiftMonth(month, 1))}
        variant="secondary"
        size="sm"
        className="px-2"
      >
        <ChevronRight className="size-4" aria-hidden />
        <span className="sr-only">Later month</span>
      </LinkButton>
    </div>
  );
}

/** A "YYYY-MM" from the URL, or this month. */
export function monthParam(raw: string | undefined, today: string): string {
  return raw && /^\d{4}-(0[1-9]|1[0-2])$/.test(raw) ? raw : today.slice(0, 7);
}
