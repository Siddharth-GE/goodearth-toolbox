import { PageTitle } from "@/components/ui/page-title";
import { getPoLinesForBill, getWorkOrderLinesForBill } from "@/lib/bills/line-queries";
import { linesFromPo, linesFromWorkOrder, type BillLineDraft } from "@/lib/bills/lines";
import { getBillFormOptions } from "@/lib/bills/queries";
import { idParam } from "@/lib/list-params";
import { listActiveGstRates } from "@/lib/masters/gst-rates";
import { listActiveUomNames } from "@/lib/masters/uoms";
import { BillForm, type FormKind } from "./_components/bill-form";

/** A muster roll starts with the masons' line; others are added as needed. */
const NMR_START: BillLineDraft = {
  kind: "nmr",
  poLineId: null,
  itemId: null,
  labourLogId: null,
  workItemId: null,
  description: "Masons (man-days)",
  uom: null,
  quantity: null,
  rate: null,
  gstPct: 0,
  discountAmount: null,
  otherCharges: null,
  note: null,
};

export default async function NewBillPage({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string; vendor?: string; po?: string; contract?: string }>;
}) {
  const raw = await searchParams;
  const kind: FormKind = raw.kind === "contract" || raw.kind === "nmr" ? raw.kind : "po";
  const vendorId = idParam(raw.vendor) ?? "";
  const poId = kind === "po" ? idParam(raw.po) : undefined;
  const contractId = kind === "contract" ? idParam(raw.contract) : undefined;

  const [options, gstRates, uoms, poLines, workLines] = await Promise.all([
    getBillFormOptions(),
    listActiveGstRates(),
    listActiveUomNames(),
    poId ? getPoLinesForBill(poId) : Promise.resolve(undefined),
    contractId ? getWorkOrderLinesForBill(contractId) : Promise.resolve(undefined),
  ]);
  const lines = poLines
    ? linesFromPo(poLines)
    : workLines
      ? linesFromWorkOrder(workLines)
      : kind === "nmr"
        ? [NMR_START]
        : [];
  const anchorId = poId ?? contractId ?? "";

  return (
    <div className="space-y-4">
      <PageTitle
        title="Record a bill"
        backHref="/bills/list"
        backLabel="All bills"
        description="Against a purchase order or a work order — its lines start from the PO or the work order, and change to match the paper."
      />
      {/* A new anchor is a new bill: the form starts again with its lines. */}
      <BillForm
        key={`${kind}-${vendorId}-${anchorId}`}
        options={options}
        initial={{ kind, vendorId, anchorId }}
        prefill={{ lines, poLines, workLines }}
        gstRates={gstRates.map((rate) => rate.rate)}
        uoms={uoms}
      />
    </div>
  );
}
