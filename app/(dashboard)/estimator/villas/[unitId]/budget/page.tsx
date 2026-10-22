import { LinkButton } from "@/components/ui/button";
import { Figure, FigureBand, FigureBandCell } from "@/components/ui/figure";
import { PageTitle } from "@/components/ui/page-title";
import { Section } from "@/components/ui/section";
import {
  Table,
  TableBody,
  TableCell,
  TableFoot,
  TableHead,
  TableHeaderCell,
  TableRow,
  TableTotalCell,
} from "@/components/ui/table";
import type { Amount, BudgetLine } from "@/lib/estimator/budget-vs-actual";
import { getVillaBudget, requireBudgetReader } from "@/lib/estimator/budget-queries";
import { formatDate, formatMoney } from "@/lib/format";
import { notFound } from "next/navigation";

// Outside the Estimator's (tool) layout on purpose: the one Estimator page a /bills holder also opens (estimator/PLAN.md).
export default async function VillaBudgetPage({ params }: { params: Promise<{ unitId: string }> }) {
  const { unitId } = await params;
  const { isEstimator } = await requireBudgetReader();
  const budget = await getVillaBudget(unitId);
  if (!budget) notFound();
  const { report } = budget;

  return (
    <div className="space-y-4">
      <PageTitle
        title={`Budget against actual — ${budget.villaName}`}
        description={[
          budget.projectName,
          budget.plotName ? `Plot ${budget.plotName}` : null,
          budget.official
            ? `against ${budget.official.reference ?? "the official estimate"}, submitted ${formatDate(budget.official.submittedAt)}`
            : isEstimator
              ? "no official estimate yet"
              : "against the official estimate",
        ]
          .filter(Boolean)
          .join(" · ")}
        backHref={isEstimator ? "/estimator/site-check" : "/bills/list"}
        backLabel={isEstimator ? "Site check" : "All bills"}
        actions={
          budget.official ? (
            <LinkButton
              href={`/estimator/estimates/${budget.official.id}`}
              variant="secondary"
              size="sm"
            >
              Open the official estimate
            </LinkButton>
          ) : undefined
        }
      />

      <FigureBand className="lg:grid-cols-4">
        <FigureBandCell>
          <Figure
            label="Estimated"
            value={money(report.total.estimated)}
            hint="labour and material"
          />
        </FigureBandCell>
        <FigureBandCell>
          <Figure
            label="Committed"
            value={money(report.total.committed)}
            hint="POs and work orders"
          />
        </FigureBandCell>
        <FigureBandCell>
          <Figure
            label="Actual"
            value={money(report.total.actual)}
            hint="material reached, labour billed"
          />
        </FigureBandCell>
        <FigureBandCell>
          <Figure
            label="Left in the estimate"
            value={money(report.total.left)}
            tone={
              report.total.left && report.total.left.amount < 0
                ? "bad"
                : mayBeOver(report.total.left)
                  ? "warn"
                  : undefined
            }
          />
        </FigureBandCell>
      </FigureBand>

      <p className="text-muted text-sm">
        Every figure is before GST. Material counts when it reaches the villa, at the rate of the
        batch it came from. &ldquo;+ unknown&rdquo; means part of it has no rate yet, so the whole
        is more than shown; &ldquo;at most&rdquo; on what is left means spending is not all priced,
        so less is left than shown.
      </p>

      {report.stages.length === 0 ? (
        <p className="text-muted text-sm">
          Nothing estimated, ordered or spent for this villa yet.
        </p>
      ) : (
        report.stages.map((stage) => (
          <Section
            key={stage.key}
            title={stage.label}
            note={`Estimated ${money(stage.estimated)} · actual ${money(stage.actual)}`}
            collapsible
            defaultOpen={mayBeOver(stage.left)}
          >
            <div className="overflow-x-auto">
              <Table>
                <TableHead>
                  <TableRow>
                    <TableHeaderCell className="min-w-48">Work</TableHeaderCell>
                    <TableHeaderCell className="text-right">Estimated</TableHeaderCell>
                    <TableHeaderCell className="text-right">Committed</TableHeaderCell>
                    <TableHeaderCell className="text-right">Actual</TableHeaderCell>
                    <TableHeaderCell className="text-right">Left</TableHeaderCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {stage.works.map((work) => (
                    <TableRow key={work.workItemId ?? "none"}>
                      <TableCell>{work.label}</TableCell>
                      <MoneyCells line={work} />
                    </TableRow>
                  ))}
                </TableBody>
                <TableFoot>
                  <TableRow>
                    <TableTotalCell>{stage.label}</TableTotalCell>
                    <MoneyCells line={stage} total />
                  </TableRow>
                </TableFoot>
              </Table>
            </div>
          </Section>
        ))
      )}
    </div>
  );
}

function money(value: Amount | null): string {
  if (value === null) return "—";
  if (value.partial === "more") return `${formatMoney(value.amount)} + unknown`;
  if (value.partial === "less") return `at most ${formatMoney(value.amount)}`;
  if (value.partial === "both") return `about ${formatMoney(value.amount)}, part unknown`;
  return formatMoney(value.amount);
}

/** Over the estimate, or possibly over because spending is not fully priced. */
const mayBeOver = (left: Amount | null) =>
  left !== null && (left.amount < 0 || left.partial === "less" || left.partial === "both");

function MoneyCells({ line, total = false }: { line: BudgetLine; total?: boolean }) {
  const Cell = total ? TableTotalCell : TableCell;
  const over = line.left !== null && line.left.amount < 0;
  return (
    <>
      <Cell className="text-right whitespace-nowrap tabular-nums">
        {money(line.estimated)}
        {!total && line.estimated && (
          <div className="text-muted text-xs">
            {`labour ${money(line.estimatedLabour)} · material ${money(line.estimatedMaterial)}`}
          </div>
        )}
      </Cell>
      <Cell className="text-right whitespace-nowrap tabular-nums">{money(line.committed)}</Cell>
      <Cell className="text-right whitespace-nowrap tabular-nums">{money(line.actual)}</Cell>
      <Cell
        className={`text-right whitespace-nowrap tabular-nums ${over ? "text-danger font-medium" : ""}`}
      >
        {money(line.left)}
      </Cell>
    </>
  );
}
