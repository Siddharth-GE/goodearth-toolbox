import { allPlots } from "@/lib/kaadal-billing/ledger";
import { getLedger } from "@/lib/kaadal-billing/queries";
import { NewOrderForm } from "../../_components/new-order-form";
import { DetailHead } from "../../_components/parts";

export default async function NewOrderPage() {
  const ledger = await getLedger();
  return (
    <div className="space-y-4">
      <DetailHead
        back={{ href: "/kaadal-billing/orders", label: "Orders" }}
        title="New order"
        meta="Add a vendor order, with the advance if it's already paid."
      />
      <NewOrderForm vendors={ledger.vendors} plots={allPlots(ledger)} today={ledger.today} />
    </div>
  );
}
