import { EmptyState } from "@/components/ui/empty-state";
import { PageTitle } from "@/components/ui/page-title";
import { getReceivePool } from "@/lib/inventory/receipts-queries";
import { PackageCheck } from "lucide-react";
import { notFound, redirect } from "next/navigation";
import { listWorkCategories, listWorkItems } from "@/lib/masters/works";
import { ReceiveBasket } from "../../_components/receive-basket";

export default async function ReceivePage({ params }: { params: Promise<{ poId: string }> }) {
  const { poId } = await params;
  const [pool, workItems, workCategories] = await Promise.all([
    getReceivePool(poId),
    listWorkItems(),
    listWorkCategories(),
  ]);
  if (!pool) notFound();
  const categoryNameById = new Map(workCategories.map((c) => [c.id, c.name]));
  const works = workItems
    .filter((work) => work.is_active)
    .map((work) => ({
      id: work.id,
      code: work.code,
      name: work.name,
      category: categoryNameById.get(work.category_id) ?? "Other",
    }));

  // Goods only arrive against an issued order — the database refuses
  // anything else, so don't offer a form that cannot be submitted.
  if (pool.status !== "issued") redirect("/inventory/receive");

  return (
    <div className="space-y-4">
      <PageTitle
        title={`Receive against ${pool.reference}`}
        description={`${pool.vendor_name} · ${pool.project_name}${pool.site_label ? ` · ${pool.site_label}` : ""}`}
        backHref="/inventory/receive"
        backLabel="Receive"
      />

      {pool.lines.length === 0 ? (
        <EmptyState
          icon={PackageCheck}
          title="This purchase order has no lines"
          description="Nothing can be received against it."
        />
      ) : (
        <ReceiveBasket pool={pool} works={works} />
      )}
    </div>
  );
}
