import { LinkButton } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageTitle } from "@/components/ui/page-title";
import { formatCount } from "@/lib/format";
import { listActiveGstRates } from "@/lib/masters/gst-rates";
import { getIndentForOrdering } from "@/lib/purchase-orders/queries";
import { PackageCheck } from "lucide-react";
import { notFound } from "next/navigation";
import { IndentOrderForm } from "./_components/indent-order-form";

/**
 * Step two of a PO from an indent (plan.md, B3): the indent's remaining
 * lines, a vendor for each, and Create — one draft PO per vendor.
 */
export default async function OrderIndentPage({
  params,
}: {
  params: Promise<{ indentId: string }>;
}) {
  const { indentId } = await params;
  const [indent, gstRates] = await Promise.all([
    getIndentForOrdering(indentId),
    listActiveGstRates(),
  ]);
  if (!indent) notFound();

  const description = [indent.project_name, indent.place, indent.work_label]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="space-y-4">
      <PageTitle
        title={`Order ${indent.reference}`}
        backHref="/purchase-orders/from-indent"
        backLabel="Indents to order"
        description={description}
      />

      {indent.status !== "approved" ? (
        <EmptyState
          icon={PackageCheck}
          title="This indent isn't approved"
          description="Only an approved indent can be ordered. It is approved in the Indents tool."
          action={<LinkButton href="/purchase-orders/from-indent">Indents to order</LinkButton>}
        />
      ) : indent.lines.length === 0 ? (
        <EmptyState
          icon={PackageCheck}
          title="Everything on this indent is ordered"
          description="Its lines are fully covered by purchase orders that aren't cancelled."
          action={<LinkButton href="/purchase-orders/from-indent">Indents to order</LinkButton>}
        />
      ) : (
        <>
          {indent.fully_ordered > 0 && (
            <p className="text-muted text-sm">
              {formatCount(indent.fully_ordered)}{" "}
              {indent.fully_ordered === 1 ? "line is" : "lines are"} already fully ordered and not
              shown.
            </p>
          )}
          <IndentOrderForm
            indentId={indent.id}
            lines={indent.lines}
            vendors={indent.vendors}
            prices={indent.prices}
            gstRates={gstRates.map((rate) => rate.rate)}
            blocked={indent.scope_problem}
          />
        </>
      )}
    </div>
  );
}
