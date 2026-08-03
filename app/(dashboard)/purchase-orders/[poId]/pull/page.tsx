import { EmptyState } from "@/components/ui/empty-state";
import { LinkButton } from "@/components/ui/button";
import { PageTitle } from "@/components/ui/page-title";
import { getIndentPool, getPurchaseOrder } from "@/lib/purchase-orders/queries";
import { canEditPo } from "@/lib/purchase-orders/workflow";
import { ClipboardList } from "lucide-react";
import { notFound, redirect } from "next/navigation";
import { PoolBasket } from "./_components/pool-basket";

export default async function PoPullPage({ params }: { params: Promise<{ poId: string }> }) {
  const { poId } = await params;
  const [po, pool] = await Promise.all([getPurchaseOrder(poId), getIndentPool(poId)]);
  if (!po || !pool) notFound();

  // Lines only change while it's a draft — past that, the pool screen
  // has nothing to offer (and the database would refuse anyway).
  if (!canEditPo(po.status)) redirect(`/purchase-orders/${poId}`);

  return (
    <div className="space-y-4">
      <PageTitle
        title="Add from approved indents"
        backHref={`/purchase-orders/${poId}`}
        backLabel={po.reference}
        description={`Approved indent lines for ${pool.scope_label} on ${po.project_name}. Quantities are what's still unordered across every purchase order.`}
      />

      {pool.groups.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title="Nothing to order here"
          description={`There are no approved indents for ${pool.scope_label} on this project yet. Indents are raised and approved in the Indents tool.`}
          action={<LinkButton href={`/purchase-orders/${poId}`}>Back to the PO</LinkButton>}
        />
      ) : (
        <PoolBasket poId={po.id} reference={po.reference} groups={pool.groups} />
      )}
    </div>
  );
}
