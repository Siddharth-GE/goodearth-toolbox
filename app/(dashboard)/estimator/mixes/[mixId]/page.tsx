import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Figure, FigureBand, FigureBandCell } from "@/components/ui/figure";
import { PageTitle } from "@/components/ui/page-title";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/components/ui/table";
import { getMix, listMaterials, listUomNames } from "@/lib/estimator/queries";
import { formatMoney } from "@/lib/format";
import { notFound } from "next/navigation";
import {
  AddMixComponentForm,
  ComponentQtyField,
  DeleteMixButton,
  MixFormDialog,
  RemoveComponentButton,
} from "../_components/mix-forms";

export default async function MixPage({ params }: { params: Promise<{ mixId: string }> }) {
  const { mixId } = await params;
  const [mix, materials, uoms] = await Promise.all([
    getMix(mixId),
    listMaterials(),
    listUomNames(),
  ]);
  if (!mix) notFound();

  // What one unit of the mix costs, if everything in it is priced. An
  // unpriced material makes the whole figure unknown rather than low —
  // and so does an empty mix: "₹0 from today's rates" on a mix with
  // nothing in it yet is the same lying zero as BUGCATCHER #13.
  const unpriced = mix.components.filter((component) => component.materialRate === null);
  const costPerUnit =
    unpriced.length > 0 || mix.components.length === 0
      ? null
      : mix.components.reduce(
          (total, component) => total + (component.materialRate ?? 0) * component.qtyPerUnit,
          0,
        );

  return (
    <div className="space-y-4">
      <PageTitle
        title={mix.name}
        description={mix.description ?? `What goes into one ${mix.uom}.`}
        backHref="/estimator/mixes"
        backLabel="Mixes"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {!mix.isActive && <Badge variant="neutral">Inactive</Badge>}
            <MixFormDialog mix={mix} uoms={uoms} />
            <DeleteMixButton mixId={mix.id} />
          </div>
        }
      />

      <FigureBand className="sm:grid-cols-2 lg:grid-cols-2">
        <FigureBandCell>
          <Figure
            label={`Cost per ${mix.uom}`}
            value={formatMoney(costPerUnit)}
            hint={
              mix.components.length === 0
                ? "nothing in it yet"
                : unpriced.length > 0
                  ? `${unpriced.length} of its materials ${unpriced.length === 1 ? "has" : "have"} no rate`
                  : "from today's material rates"
            }
            size="lg"
            tone={costPerUnit === null ? "warn" : undefined}
          />
        </FigureBandCell>
        <FigureBandCell>
          <Figure
            label="Materials"
            value={String(mix.components.length)}
            hint={`per one ${mix.uom}`}
            size="lg"
          />
        </FigureBandCell>
      </FigureBand>

      <Card className="space-y-4 p-4">
        <div>
          <p className="text-muted text-xs font-semibold tracking-widest uppercase">What goes in</p>
          <p className="text-muted mt-1 text-sm">
            Quantities are per one {mix.uom} of {mix.name}.
          </p>
        </div>

        <AddMixComponentForm mixId={mix.id} mixUom={mix.uom} materials={materials} />

        {mix.components.length === 0 ? (
          <p className="text-muted text-sm">
            Nothing in it yet — a work using this mix will get no materials from it.
          </p>
        ) : (
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>Material</TableHeaderCell>
                <TableHeaderCell>Quantity</TableHeaderCell>
                <TableHeaderCell>Rate</TableHeaderCell>
                <TableHeaderCell>Cost</TableHeaderCell>
                <TableHeaderCell></TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {mix.components.map((component) => (
                <TableRow key={component.id}>
                  <TableCell className="text-foreground font-medium">
                    {component.materialName}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <ComponentQtyField
                        id={component.id}
                        qty={component.qtyPerUnit}
                        label={component.materialName}
                        kind="mix"
                      />
                      <span className="text-muted text-sm">{component.materialUom}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    {component.materialRate === null ? (
                      <Badge variant="warning">Not priced</Badge>
                    ) : (
                      formatMoney(component.materialRate)
                    )}
                  </TableCell>
                  <TableCell className="text-foreground">
                    {formatMoney(
                      component.materialRate === null
                        ? null
                        : component.materialRate * component.qtyPerUnit,
                    )}
                  </TableCell>
                  <TableCell>
                    <RemoveComponentButton
                      id={component.id}
                      kind="mix"
                      label={component.materialName}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
