import { Badge } from "@/components/ui/badge";
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
import { computeLine, rateBuildUp, type MaterialDef, type MixDef } from "@/lib/estimator/calc";
import { getRecipeBook } from "@/lib/estimator/estimate-queries";
import { listMixes } from "@/lib/estimator/mixes-queries";
import { listMaterialItems, listUomNames } from "@/lib/estimator/shared";
import { getWorkSetup, listWorkStatus } from "@/lib/estimator/works-queries";
import { floorTwins } from "@/lib/estimator/works-rules";
import { formatMoney, formatQuantity } from "@/lib/format";
import { notFound } from "next/navigation";
import { ComponentQtyField, RemoveComponentButton } from "../../mixes/_components/mix-forms";
import { AddWorkComponentForm, CopyRateForm, WorkInfoForm } from "../_components/work-setup-forms";

export default async function WorkSetupPage({
  params,
}: {
  params: Promise<{ workItemId: string }>;
}) {
  const { workItemId } = await params;
  const [work, materials, mixes, uoms, book, allWorks] = await Promise.all([
    getWorkSetup(workItemId),
    listMaterialItems(),
    listMixes(),
    listUomNames(),
    getRecipeBook(),
    listWorkStatus(),
  ]);
  if (!work) notFound();

  // What one unit of this work costs, through the same calculator the
  // estimates use — one implementation, so the two can never disagree.
  const recipe = book.recipes.find((row) => row.workItemId === workItemId);
  const mixesById = new Map<string, MixDef>(book.mixes.map((mix) => [mix.id, mix]));
  const materialsById = new Map<string, MaterialDef>(
    book.materials.map((material) => [material.id, material]),
  );
  const perUnit = computeLine({ workItemId, qty: 1 }, recipe, mixesById, materialsById);
  // Where each unit's money goes — every material, mixes expanded.
  const buildUp = rateBuildUp(recipe, mixesById, materialsById);

  // The same work on other floors, offered ticked for "copy this rate".
  const activeWorks = allWorks
    .filter((row) => row.isActive)
    .map((row) => ({ id: row.workItemId, code: row.code, name: row.name, group: row.groupName }));
  const self = activeWorks.find((row) => row.id === workItemId);
  const twins = self ? floorTwins(self, activeWorks) : [];

  return (
    <div className="space-y-4">
      <PageTitle
        title={`${work.code} — ${work.name}`}
        description={[work.categoryName, work.groupName].filter(Boolean).join(" · ")}
        backHref="/estimator/works"
        backLabel="Rate book"
        actions={work.uom === null ? <Badge variant="neutral">Not set up</Badge> : undefined}
      />

      <Card className="space-y-3 p-4">
        <div>
          <p className="text-muted text-[11px] font-medium tracking-[0.14em] uppercase">
            Unit and labour
          </p>
          <p className="text-muted mt-1 text-sm">
            How this work is measured, and what the labour costs per unit of it.
          </p>
        </div>
        <WorkInfoForm work={work} uoms={uoms} />
      </Card>

      {work.uom === null ? (
        <Card className="p-4">
          <p className="text-muted text-sm">
            Set the unit above first — a recipe&apos;s quantities are per one unit of the work, so
            there is nothing to measure against until then.
          </p>
        </Card>
      ) : (
        <Card className="space-y-4 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-muted text-[11px] font-medium tracking-[0.14em] uppercase">
                What one {work.uom} consumes
              </p>
              <p className="text-muted mt-1 text-sm">
                Add a mix (its own materials come with it) or a material on its own.
              </p>
            </div>
            <div className="text-right">
              <p className="text-muted text-[11px] font-medium tracking-[0.14em] uppercase">
                Cost per {work.uom}
              </p>
              <p className="text-foreground text-lg font-semibold">
                {formatMoney(perUnit.totalCost)}
              </p>
              <p className="text-muted text-xs">
                {perUnit.totalCost === null
                  ? "something isn't priced yet"
                  : `${formatMoney(perUnit.labourCost)} labour + ${formatMoney(perUnit.materialCost)} materials`}
              </p>
            </div>
          </div>

          <AddWorkComponentForm
            workItemId={work.workItemId}
            workUom={work.uom}
            materials={materials}
            mixes={mixes}
          />

          {work.components.length === 0 ? (
            <p className="text-muted text-sm">
              Nothing yet — this work will cost labour only on an estimate.
            </p>
          ) : (
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeaderCell>Item</TableHeaderCell>
                  <TableHeaderCell>Quantity</TableHeaderCell>
                  <TableHeaderCell></TableHeaderCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {work.components.map((component) => (
                  <TableRow key={component.id}>
                    <TableCell className="text-foreground font-medium">
                      <span className="flex flex-wrap items-center gap-2">
                        {component.name}
                        {component.kind === "mix" && <Badge variant="info">Mix</Badge>}
                        {component.kind === "mix" && component.mixComponentCount === 0 && (
                          <Badge variant="warning">Nothing in it yet</Badge>
                        )}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <ComponentQtyField
                          id={component.id}
                          qty={component.qtyPerUnit}
                          label={component.name}
                          kind="work"
                        />
                        <span className="text-muted text-sm">
                          {component.uom} per {work.uom}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <RemoveComponentButton id={component.id} kind="work" label={component.name} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          {perUnit.missingRateMaterialIds.length > 0 && (
            <p className="text-warning text-sm">
              {perUnit.missingRateMaterialIds.length}{" "}
              {perUnit.missingRateMaterialIds.length === 1 ? "material has" : "materials have"} no
              rate, so the material cost is unknown rather than zero.
            </p>
          )}

          {buildUp && buildUp.materials.length > 0 && (
            <div className="space-y-2">
              <p className="text-muted text-[11px] font-medium tracking-[0.14em] uppercase">
                Where each {work.uom} goes
              </p>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableHeaderCell>Material</TableHeaderCell>
                    <TableHeaderCell>Per {work.uom}</TableHeaderCell>
                    <TableHeaderCell className="text-right">Masters price</TableHeaderCell>
                    <TableHeaderCell className="text-right">Cost</TableHeaderCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {buildUp.materials.map((row) => {
                    const def = materialsById.get(row.materialId);
                    return (
                      <TableRow key={row.materialId}>
                        <TableCell className="text-foreground text-sm">
                          {def?.name ?? "Unknown material"}
                        </TableCell>
                        <TableCell className="text-sm">
                          {formatQuantity(row.qtyPerUnit)} {def?.uom ?? ""}
                        </TableCell>
                        <TableCell className="text-right text-sm">
                          {row.price === null ? (
                            <Badge variant="warning">Not priced</Badge>
                          ) : (
                            formatMoney(row.price)
                          )}
                        </TableCell>
                        <TableCell className="text-right text-sm">
                          {formatMoney(row.cost)}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}

          {work.lineCount > 0 && (
            <p className="text-muted text-sm">
              Used on {formatQuantity(work.lineCount)}{" "}
              {work.lineCount === 1 ? "estimate line" : "estimate lines"}. Draft estimates follow
              changes here; a villa with its own version of this work keeps its own, and a submitted
              estimate keeps what it froze.
            </p>
          )}
        </Card>
      )}

      {work.uom !== null && (
        <Card className="space-y-3 p-4">
          <div>
            <p className="text-muted text-[11px] font-medium tracking-[0.14em] uppercase">
              Copy this rate to other works
            </p>
            <p className="text-muted mt-1 text-sm">
              {twins.length > 0
                ? `The same work on ${twins.length === 1 ? "another floor is" : "other floors are"} ticked below.`
                : "The same unit, labour rate and materials, onto any other work."}
            </p>
          </div>
          <CopyRateForm workItemId={work.workItemId} twins={twins} allWorks={activeWorks} />
        </Card>
      )}
    </div>
  );
}
