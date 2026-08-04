import { EmptyState } from "@/components/ui/empty-state";
import { PageTitle } from "@/components/ui/page-title";
import { getReceivePool } from "@/lib/inventory/receipts-queries";
import { PackageCheck } from "lucide-react";
import { notFound, redirect } from "next/navigation";
import { ReceiveBasket } from "../../_components/receive-basket";

export default async function ReceivePage({ params }: { params: Promise<{ poId: string }> }) {
  const { poId } = await params;
  const pool = await getReceivePool(poId);
  if (!pool) notFound();

  // Goods only arrive against an issued order — the database refuses
  // anything else, so don't offer a form that cannot be submitted.
  if (pool.status !== "issued") redirect("/inventory");

  return (
    <div className="space-y-4">
      <PageTitle
        title={`Receive against ${pool.reference}`}
        description={`${pool.vendor_name} · ${pool.project_name}${pool.site_label ? ` · ${pool.site_label}` : ""}`}
        backHref="/inventory"
        backLabel="Inventory"
      />

      {pool.lines.length === 0 ? (
        <EmptyState
          icon={PackageCheck}
          title="This purchase order has no lines"
          description="Nothing can be received against it."
        />
      ) : (
        <ReceiveBasket pool={pool} />
      )}
    </div>
  );
}
