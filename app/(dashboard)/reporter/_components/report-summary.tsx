/**
 * The KPI band — a report's headline figures, computed from the same
 * totals as the table's grand-total row so the two can never disagree.
 * The first measure is the answer and renders hero; the rest qualify it.
 */

import { Figure, FigureBand, FigureBandCell } from "@/components/ui/figure";
import { formatCount, formatCrore, formatQuantity } from "@/lib/format";
import { DATASETS } from "@/lib/reporter/datasets";
import { measureId, type ReportSpec } from "@/lib/reporter/spec";
import type { ReportResult } from "@/lib/reporter/aggregate";

import { measureLabel } from "@/lib/reporter/labels";

function formatTotal(value: number | null, fieldType: string, agg: string): string {
  if (value === null) return "—";
  if (agg === "count" || agg === "count_distinct") return formatCount(value);
  if (fieldType === "money") return formatCrore(value);
  return formatQuantity(value);
}

export function ReportSummary({ spec, result }: { spec: ReportSpec; result: ReportResult }) {
  if (spec.measures.length === 0) return null;
  const dataset = DATASETS[spec.dataset];

  return (
    <FigureBand>
      {spec.measures.map((measure, index) => {
        const field = dataset.fields[measure.field];
        return (
          <FigureBandCell key={measureId(measure)}>
            <Figure
              label={measureLabel(field.label, measure.agg)}
              value={formatTotal(
                result.totals[measureId(measure)] ?? null,
                field.type,
                measure.agg,
              )}
              size={index === 0 ? "hero" : "lg"}
            />
          </FigureBandCell>
        );
      })}
      <FigureBandCell>
        <Figure label="Lines" value={formatCount(result.matched)} size="sm" />
      </FigureBandCell>
    </FigureBand>
  );
}
