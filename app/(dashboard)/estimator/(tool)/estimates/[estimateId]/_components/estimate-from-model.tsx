import { Card } from "@/components/ui/card";
import type { EstimateDetail } from "@/lib/estimator/estimate-queries";
import { formatQuantity } from "@/lib/format";
import { MaterialsFromChoice } from "./other-cost-forms";

/** What the SketchUp model brought besides its rows (0174): where the materials come from, the built-up area and the
 * project settings it worked things out from. */
export function EstimateFromModel({
  estimate,
  isDraft,
}: {
  estimate: EstimateDetail;
  isDraft: boolean;
}) {
  const settings = Object.entries(estimate.modelSettings ?? {});
  if (!estimate.model && settings.length === 0 && estimate.modelBuaSqft === null) return null;
  return (
    <Card className="space-y-3 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <p className="text-muted text-[11px] font-medium tracking-[0.14em] uppercase">
            From the SketchUp model
          </p>
          <p className="text-muted text-sm">
            {estimate.useModelMaterials
              ? "Works the model gave materials to are made of those — its concrete, masonry and steel — in place of the rate book's list; its extras (ridge tiles, grills, stair teak) add to whichever list stands. Switch to the Rate book for the final QS."
              : "Every work is made of the rate book's list. The model's materials are kept but not counted."}
          </p>
        </div>
        {isDraft ? (
          <MaterialsFromChoice estimateId={estimate.id} useModel={estimate.useModelMaterials} />
        ) : (
          <p className="text-foreground text-sm font-medium">
            Materials from {estimate.useModelMaterials ? "the SketchUp model" : "the Rate book"}
          </p>
        )}
      </div>
      {estimate.modelBuaSqft !== null && (
        <p className="text-foreground text-sm">
          Built-up area: {formatQuantity(estimate.modelBuaSqft)} sqft
        </p>
      )}
      {settings.length > 0 && (
        <details className="text-sm">
          <summary className="text-muted cursor-pointer">
            The project settings it worked things out from ({settings.length})
          </summary>
          <dl className="mt-2 grid gap-x-6 gap-y-1 sm:grid-cols-2">
            {settings.map(([key, value]) => (
              <div key={key} className="flex justify-between gap-3">
                <dt className="text-muted">{key.replaceAll("_", " ")}</dt>
                <dd className="text-foreground tabular-nums">{String(value ?? "—")}</dd>
              </div>
            ))}
          </dl>
        </details>
      )}
    </Card>
  );
}
