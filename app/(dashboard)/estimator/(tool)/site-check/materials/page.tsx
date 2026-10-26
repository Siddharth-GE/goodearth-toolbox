import { LinkButton } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageTitle } from "@/components/ui/page-title";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/components/ui/table";
import { getItemLabels, getOfficialComparisons } from "@/lib/estimator/estimate-queries";
import { drawnPercent, materialTotals } from "@/lib/estimator/site-check";
import { formatCount, formatPercent, formatQuantity } from "@/lib/format";
import { listUnits } from "@/lib/masters/units";
import { cn } from "@/lib/utils";
import Link from "next/link";

/** "Where does all the cement go": each material across every villa's official estimate against what reached the villas, planned or not. Quantities only. */
export default async function SiteCheckMaterialsPage({
  searchParams,
}: {
  searchParams: Promise<{ item?: string }>;
}) {
  const { item } = await searchParams;
  const [officials, units] = await Promise.all([getOfficialComparisons(), listUnits()]);
  const totals = materialTotals(officials);
  const labels = await getItemLabels(totals.map((total) => total.itemId));

  const unitName = new Map(units.map((unit) => [unit.id, unit.name]));
  const materialName = (itemId: string, fallback: string | null) =>
    labels.get(itemId)?.name ?? fallback ?? "An item";
  const materialUom = (itemId: string, fallback: string | null) =>
    fallback ?? labels.get(itemId)?.uom ?? "";

  const focus = item ? totals.find((total) => total.itemId === item) : undefined;
  const focusByVilla = focus
    ? officials
        .map((official) => ({
          unitId: official.unitId,
          estimateId: official.estimateId,
          ...(materialTotals([official]).find((total) => total.itemId === focus.itemId) ?? {
            estimated: 0,
            reached: 0,
          }),
        }))
        .filter((row) => row.estimated > 0 || row.reached > 0)
        .sort((a, b) =>
          (unitName.get(a.unitId) ?? "").localeCompare(unitName.get(b.unitId) ?? "", undefined, {
            numeric: true,
          }),
        )
    : [];

  return (
    <div className="space-y-4">
      <PageTitle
        title="Every material"
        description="Each material across every villa's official estimate, and how much of it has reached the villas' sites — planned or not. Tap one to see it villa by villa."
        backHref="/estimator/site-check"
        backLabel="Site check"
      />

      {focus && (
        <Card className="space-y-3 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-foreground text-sm font-semibold">
              {materialName(focus.itemId, focus.name)}, villa by villa
            </p>
            <LinkButton href="/estimator/site-check/materials" variant="ghost" size="sm">
              Close
            </LinkButton>
          </div>
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>Villa</TableHeaderCell>
                <TableHeaderCell className="text-right">Estimated</TableHeaderCell>
                <TableHeaderCell className="text-right">Reached site</TableHeaderCell>
                <TableHeaderCell className="text-right">Of estimate</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {focusByVilla.map((row) => {
                const uom = materialUom(focus.itemId, focus.uom);
                const percent = drawnPercent(row.estimated, row.reached);
                return (
                  <TableRow key={row.estimateId}>
                    <TableCell className="text-foreground text-sm">
                      <Link
                        href={`/estimator/site-check/${row.unitId}`}
                        className="hover:underline"
                      >
                        {unitName.get(row.unitId) ?? "A villa"}
                      </Link>
                    </TableCell>
                    <TableCell className="text-right text-sm whitespace-nowrap">
                      {row.estimated > 0 ? `${formatQuantity(row.estimated)} ${uom}` : "—"}
                    </TableCell>
                    <TableCell className="text-right text-sm whitespace-nowrap">
                      {formatQuantity(row.reached)} {uom}
                    </TableCell>
                    <TableCell
                      className={cn(
                        "text-right text-sm",
                        percent !== null && percent > 100 && "text-warning",
                      )}
                    >
                      {formatPercent(percent)}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}

      <Card className="space-y-3 p-4">
        {totals.length === 0 ? (
          <p className="text-muted text-sm">
            The official estimates list no materials yet, and nothing has reached a villa.
          </p>
        ) : (
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>Material</TableHeaderCell>
                <TableHeaderCell className="text-right">Estimated</TableHeaderCell>
                <TableHeaderCell className="text-right">Reached site</TableHeaderCell>
                <TableHeaderCell className="text-right">Of estimate</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {[...totals]
                .sort((a, b) =>
                  materialName(a.itemId, a.name).localeCompare(materialName(b.itemId, b.name)),
                )
                .map((total) => {
                  const uom = materialUom(total.itemId, total.uom);
                  const percent = drawnPercent(total.estimated, total.reached);
                  return (
                    <TableRow key={total.itemId}>
                      <TableCell className="text-foreground text-sm">
                        <Link
                          href={`/estimator/site-check/materials?item=${total.itemId}`}
                          className="hover:underline"
                        >
                          {materialName(total.itemId, total.name)}
                        </Link>
                        <span className="text-muted block text-xs">
                          {total.villas === 0
                            ? "planned on no estimate"
                            : `on ${formatCount(total.villas)} ${total.villas === 1 ? "villa" : "villas"}`}
                        </span>
                      </TableCell>
                      <TableCell className="text-right text-sm whitespace-nowrap">
                        {total.estimated > 0 ? `${formatQuantity(total.estimated)} ${uom}` : "—"}
                      </TableCell>
                      <TableCell className="text-right text-sm whitespace-nowrap">
                        {formatQuantity(total.reached)} {uom}
                      </TableCell>
                      <TableCell
                        className={cn(
                          "text-right text-sm",
                          percent !== null && percent > 100 && "text-warning",
                        )}
                      >
                        {formatPercent(percent)}
                      </TableCell>
                    </TableRow>
                  );
                })}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
