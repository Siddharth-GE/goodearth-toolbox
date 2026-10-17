import { PageTitle } from "@/components/ui/page-title";
import { getPoFormOptions, getPoTermsTemplates } from "@/lib/purchase-orders/queries";
import { PoForm } from "./_components/po-form";

export default async function NewPurchaseOrderPage() {
  const [options, templates] = await Promise.all([getPoFormOptions(), getPoTermsTemplates()]);
  const defaultTerms = templates[0]?.is_default ? templates[0].body : null;

  return (
    <div className="space-y-4">
      <PageTitle
        title="New purchase order"
        backHref="/purchase-orders/list"
        backLabel="All purchase orders"
        description="One vendor. For a bulk buy pick General: its lines can come from any villa's approved indents, and it is delivered to a store. Pick a villa and its lines come from that villa's indents."
      />
      <PoForm options={options} defaultTerms={defaultTerms} />
    </div>
  );
}
