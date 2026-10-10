import { PageTitle } from "@/components/ui/page-title";
import { getWorkOrderFormOptions } from "@/lib/bills/work-order-queries";
import { WorkOrderEditor } from "../_components/work-order-editor";

export default async function NewWorkOrderPage() {
  const options = await getWorkOrderFormOptions();

  return (
    <div className="space-y-4">
      <PageTitle
        title="New work order"
        backHref="/bills/work-orders"
        backLabel="Work orders"
        description="Who, where, the works from the Masters list and the terms. It waits for a bill approver, then bills are recorded against it."
      />
      <WorkOrderEditor
        options={options}
        initial={{
          vendorId: "",
          projectId: "",
          site: "",
          description: "",
          terms: options.defaultTerms ?? "",
          lines: [],
        }}
      />
    </div>
  );
}
