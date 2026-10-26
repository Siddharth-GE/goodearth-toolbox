import { hasApp } from "@/lib/auth/access";
import { requireUser } from "@/lib/auth/dal";
import { compareIssuesToEstimate } from "@/lib/estimator/compare";
import {
  getEstimate,
  getEstimateMeasurements,
  getEstimateVariations,
  getIssuedAgainstEstimate,
  getReconciliationApprovals,
  getRecipeBook,
} from "@/lib/estimator/estimate-queries";
import { buildEstimateView } from "@/lib/estimator/estimate-view";
import { listMixes } from "@/lib/estimator/mixes-queries";
import { listMaterialItems, listUomNames } from "@/lib/estimator/shared";
import { listWorkStatus } from "@/lib/estimator/works-queries";
import { notFound } from "next/navigation";
import { EstimateHeader } from "./_components/estimate-header";
import { EstimateMaterials } from "./_components/estimate-materials";
import { EstimateReachedSite } from "./_components/estimate-reached-site";
import { EstimateTotal } from "./_components/estimate-total";
import { EstimateWorks } from "./_components/estimate-works";

// Reads as a BOQ: works under categories, a subtotal per category, the grand total on top.
// The figures are worked out in lib/estimator/estimate-view.ts (pure, tested).
export default async function EstimatePage({
  params,
}: {
  params: Promise<{ estimateId: string }>;
}) {
  const { estimateId } = await params;
  const [user, estimate, book, works, variations, materialItems, mixRows, measurements, uoms] =
    await Promise.all([
      requireUser(),
      getEstimate(estimateId),
      getRecipeBook(),
      listWorkStatus(),
      // Per-villa variations (0087) replace the standard recipe whole, so live costs mean THIS house.
      getEstimateVariations(estimateId),
      listMaterialItems(),
      listMixes(),
      // A line present here is MEASURED: its quantity is the sheet's total (0096).
      getEstimateMeasurements(estimateId),
      listUomNames(),
    ]);
  if (!estimate) notFound();
  // Whoever holds Masters can set a missing Masters price here; everyone else sets this villa's price only.
  const canEditMasters = await hasApp(user, "/masters");

  const view = buildEstimateView({ estimate, book, works, variations, materialItems, mixRows });

  // Issued-vs-estimated is for the OFFICIAL estimate only. Inventory's reads are open (no money), so this crosses no gate.
  const issuedData =
    estimate.status === "submitted" && estimate.unitId
      ? await getIssuedAgainstEstimate(estimate.unitId)
      : null;
  const comparison =
    issuedData && estimate.frozen
      ? compareIssuesToEstimate(
          estimate.frozen.takeoff.map((row) => ({
            workItemId: row.workItemId,
            itemId: row.itemId ?? null,
            materialName: row.materialName,
            uom: row.uom,
            quantity: row.quantity,
          })),
          issuedData.lines,
        )
      : null;

  // Reconciliation (0083): every unmatched arrival needs the estimator's approval; the flag never clears.
  const approvals =
    comparison && comparison.unmatched.length > 0
      ? await getReconciliationApprovals(estimateId)
      : [];
  const approvalByKey = new Map(
    approvals.map((approval) => [`${approval.workItemId ?? ""} ${approval.itemId}`, approval]),
  );

  return (
    <div className="space-y-4">
      <EstimateHeader estimate={estimate} view={view} />
      <EstimateTotal estimate={estimate} view={view} />
      <EstimateWorks
        estimate={estimate}
        view={view}
        variations={variations}
        measurements={measurements}
        canEditMasters={canEditMasters}
        uoms={uoms}
      />
      {view.takeoffRows.length > 0 && (
        <EstimateMaterials estimate={estimate} view={view} variations={variations} />
      )}
      {comparison && issuedData && (
        <EstimateReachedSite
          estimateId={estimateId}
          comparison={comparison}
          issuedData={issuedData}
          works={works}
          approvalByKey={approvalByKey}
        />
      )}
    </div>
  );
}
