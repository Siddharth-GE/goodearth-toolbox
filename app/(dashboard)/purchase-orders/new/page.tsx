import { PageTitle } from "@/components/ui/page-title";
import { getPoFormOptions, getPoTermsTemplates } from "@/lib/purchase-orders/queries";
import { PoForm } from "./_components/po-form";

export default async function NewPurchaseOrderPage() {
  const [options, templates] = await Promise.all([getPoFormOptions(), getPoTermsTemplates()]);
  // The default template leads the list; a new order starts from its text.
  const defaultTerms = templates[0]?.is_default ? templates[0].body : null;

  return (
    <div className="space-y-4">
      <PageTitle
        title="New purchase order"
        backHref="/purchase-orders/list"
        backLabel="All purchase orders"
        description="One vendor, one plot or unit (or a general purchase). Lines come next — from approved indents, or added directly for bulk buys."
      />
      <PoForm options={options} defaultTerms={defaultTerms} />
    </div>
  );
}
