import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Figure, FigureBand, FigureBandCell } from "@/components/ui/figure";
import { LinkButton } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/components/ui/table";
import { listWorkStatus, type WorkStatusRow } from "@/lib/estimator/queries";
import { formatMoney } from "@/lib/format";
import { Hammer } from "lucide-react";

export default async function WorksPage({
  searchParams,
}: {
  searchParams: Promise<{ show?: string }>;
}) {
  const { show } = await searchParams;
  const works = await listWorkStatus();
  const active = works.filter((work) => work.isActive);
  const setUp = active.filter((work) => work.uom !== null);
  const withRecipe = setUp.filter((work) => work.componentCount > 0);

  const shown =
    show === "todo"
      ? active.filter((work) => work.uom === null)
      : show === "set-up"
        ? setUp
        : active;

  // Grouped by category, in the works vocabulary's own order.
  const byCategory = new Map<string, WorkStatusRow[]>();
  for (const work of shown) {
    const key = `${work.categoryCode} — ${work.categoryName}`;
    byCategory.set(key, [...(byCategory.get(key) ?? []), work]);
  }

  return (
    <div className="space-y-4">
      <div className="max-w-2xl">
        <p className="text-muted text-xs font-semibold tracking-widest uppercase">Works</p>
        <p className="text-muted mt-1 text-sm">
          Every work from the Masters list. Set each one up once — what it is measured in, what
          labour costs, and what it consumes — and it can then be used on any estimate. The works
          themselves are edited in Masters; this is only their costing.
        </p>
      </div>

      <FigureBand className="sm:grid-cols-3 lg:grid-cols-3">
        <FigureBandCell>
          <Figure label="Works" value={String(active.length)} hint="active in Masters" size="lg" />
        </FigureBandCell>
        <FigureBandCell>
          <Figure label="Set up" value={String(setUp.length)} hint="have a unit" size="lg" />
        </FigureBandCell>
        <FigureBandCell>
          <Figure
            label="With a recipe"
            value={String(withRecipe.length)}
            hint="consume materials"
            size="lg"
          />
        </FigureBandCell>
      </FigureBand>

      <div className="flex flex-wrap gap-2">
        <LinkButton href="/estimator/works" variant={!show ? "primary" : "secondary"}>
          All
        </LinkButton>
        <LinkButton
          href="/estimator/works?show=set-up"
          variant={show === "set-up" ? "primary" : "secondary"}
        >
          Set up
        </LinkButton>
        <LinkButton
          href="/estimator/works?show=todo"
          variant={show === "todo" ? "primary" : "secondary"}
        >
          Still to set up ({active.length - setUp.length})
        </LinkButton>
      </div>

      {shown.length === 0 ? (
        <EmptyState
          icon={Hammer}
          title={show === "todo" ? "Every work is set up" : "No works yet"}
          description={
            show === "todo"
              ? "Nothing is waiting — every active work has a unit."
              : "Works come from the Masters list. Add them there first."
          }
        />
      ) : (
        [...byCategory].map(([category, rows]) => (
          <Card key={category} className="space-y-3 p-4">
            <p className="text-foreground text-sm font-semibold">{category}</p>
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeaderCell className="w-24">Code</TableHeaderCell>
                  <TableHeaderCell>Work</TableHeaderCell>
                  <TableHeaderCell>Measured in</TableHeaderCell>
                  <TableHeaderCell>Labour rate</TableHeaderCell>
                  <TableHeaderCell>Recipe</TableHeaderCell>
                  <TableHeaderCell></TableHeaderCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.map((work) => (
                  <TableRow key={work.workItemId}>
                    <TableCell className="text-muted text-sm">{work.code}</TableCell>
                    <TableCell className="text-foreground text-sm">
                      {work.name}
                      {work.groupName && (
                        <span className="text-muted block text-xs">{work.groupName}</span>
                      )}
                    </TableCell>
                    <TableCell>{work.uom ?? <Badge variant="neutral">Not set up</Badge>}</TableCell>
                    <TableCell>
                      {work.uom === null ? (
                        "—"
                      ) : work.labourRate === null ? (
                        <Badge variant="warning">Not priced</Badge>
                      ) : (
                        `${formatMoney(work.labourRate)} / ${work.uom}`
                      )}
                    </TableCell>
                    <TableCell>
                      {work.componentCount === 0
                        ? "—"
                        : `${work.componentCount} ${work.componentCount === 1 ? "item" : "items"}`}
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end">
                        <LinkButton
                          href={`/estimator/works/${work.workItemId}`}
                          variant="ghost"
                          size="sm"
                        >
                          {work.uom === null ? "Set up" : "Edit"}
                        </LinkButton>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        ))
      )}
    </div>
  );
}
