import { Card } from "@/components/ui/card";
import { Figure } from "@/components/ui/figure";
import type { EstimateDetail } from "@/lib/estimator/estimate-queries";
import type { EstimateView } from "@/lib/estimator/estimate-view";
import { formatDate, formatMoney } from "@/lib/format";

export function EstimateTotal({
  estimate,
  view,
}: {
  estimate: EstimateDetail;
  view: EstimateView;
}) {
  const { isDraft, totals, other, grand } = view;
  const empty = estimate.lines.length === 0 && estimate.otherCosts.length === 0;
  const missingBits = view.missing;
  const part = (label: string, value: number | null) =>
    `${label} ${value === null ? "not priced yet" : formatMoney(value)}`;
  return (
    <Card className="space-y-2 p-5">
      <Figure
        label={
          empty
            ? "Total"
            : !isDraft
              ? `Total, frozen ${formatDate(estimate.submittedAt)}`
              : grand.isComplete
                ? "Total at today's rates"
                : "Total so far"
        }
        value={empty ? formatMoney(null) : formatMoney(grand.amount)}
        hint={
          empty
            ? "nothing on it yet"
            : [
                part("Labour", totals.labour),
                part("Materials", totals.material),
                ...(estimate.otherCosts.length > 0 ? [part("Other costs", other.amount)] : []),
              ].join(" · ")
        }
        tone={!empty && !grand.isComplete ? "warn" : undefined}
        size="hero"
      />
      {missingBits.length > 0 && (
        <p className="text-warning text-sm">
          {missingBits.join(", ")}
          {isDraft
            ? " — the total counts only what is priced."
            : " — those were unpriced on the day of submit, so the frozen total counts only what was priced."}
        </p>
      )}
    </Card>
  );
}
