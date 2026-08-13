import { PageTitle } from "@/components/ui/page-title";
import { getBillFormOptions } from "@/lib/bills/queries";
import { BillForm } from "./_components/bill-form";

export default async function NewBillPage() {
  const options = await getBillFormOptions();

  return (
    <div className="space-y-4">
      <PageTitle
        title="Record a bill"
        backHref="/bills/list"
        backLabel="All bills"
        description="The vendor's paper invoice, as printed — against one purchase order or one labour contract."
      />
      <BillForm options={options} />
    </div>
  );
}
