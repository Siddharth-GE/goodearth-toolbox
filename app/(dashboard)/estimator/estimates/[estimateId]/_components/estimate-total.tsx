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
  const { isDraft, totals } = view;
  const missingBits = view.missing;
  const part = (label: string, value: number | null) =>
    `${label} ${value === null ? "not priced yet" : formatMoney(value)}`;
  return (
    <Card className="space-y-2 p-5">
      <Figure
        label={
          estimate.lines.length === 0
            ? "Total"
            : !isDraft
              ? `Total, frozen ${formatDate(estimate.submittedAt)}`
              : totals.isComplete
                ? "Total at today's rates"
                : "Total so far"
        }
        value={estimate.lines.length === 0 ? formatMoney(null) : formatMoney(totals.grand)}
        hint={
          estimate.lines.length === 0
            ? "nothing on it yet"
            : `${part("Labour", totals.labour)} · ${part("Materials", totals.material)}`
        }
        tone={estimate.lines.length > 0 && !totals.isComplete ? "warn" : undefined}
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
