import { PageTitle } from "@/components/ui/page-title";
import { getPoFormOptions } from "@/lib/purchase-orders/queries";
import { PoForm } from "./_components/po-form";

export default async function NewPurchaseOrderPage() {
  const options = await getPoFormOptions();

  return (
    <div className="space-y-4">
      <PageTitle
        title="New purchase order"
        backHref="/purchase-orders"
        backLabel="Purchase Orders"
        description="One vendor, one plot or unit (or a general purchase). Lines come from approved indents next."
      />
      <PoForm options={options} />
    </div>
  );
}
