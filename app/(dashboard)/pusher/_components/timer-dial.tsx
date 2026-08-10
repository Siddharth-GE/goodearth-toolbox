import { cn } from "@/lib/utils";

/**
 * How long the baton has been sitting here, against how long it was
 * supposed to. A ring rather than a number alone, because the thing a
 * reader needs at a glance is the proportion, not the arithmetic.
 *
 * Past the allowance the ring fills red and breathes — calm, and
 * impossible to miss. That is the whole product in one component.
 */
export function TimerDial({
  days,
  expectedDays,
  className,
}: {
  days: number;
  expectedDays: number;
  className?: string;
}) {
  const stuck = expectedDays > 0 && days > expectedDays;
  const pct = expectedDays > 0 ? Math.min(100, (days / expectedDays) * 100) : 0;

  return (
    <div
      className={cn(
        "relative flex size-12 shrink-0 items-center justify-center rounded-full",
        stuck && "[animation:pusher-breathe_2.4s_ease-in-out_infinite]",
        className,
      )}
      style={{
        background: `conic-gradient(var(--${stuck ? "danger" : "accent"}) ${pct}%, var(--border) 0)`,
      }}
      // The ring is decorative; the text inside already says it, and a
      // screen reader should hear it once, not twice.
      role="img"
      aria-label={`${days} of ${expectedDays} days${stuck ? ", overdue" : ""}`}
    >
      <div className="bg-surface absolute inset-[3px] rounded-full" />
      <div className="relative text-center leading-none">
        <div
          className={cn(
            "font-mono text-[11px] font-semibold",
            stuck ? "text-danger" : "text-foreground",
          )}
        >
          {days}d
        </div>
        <div className="text-muted mt-0.5 font-mono text-[8px]">of {expectedDays}</div>
      </div>
    </div>
  );
}
