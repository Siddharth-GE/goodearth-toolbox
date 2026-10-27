"use client";

import { Heading } from "@/components/ui/heading";
import { SitePicker } from "@/components/masters/site-picker";
import { Button, LinkButton } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/form-message";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchSelect, type SearchOption } from "@/components/ui/search-select";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { createBillWithLines } from "@/lib/bills/line-actions";
import type { DeliveryForBill } from "@/lib/bills/line-queries";
import {
  billLinesProblem,
  isPieceWorkBill,
  lineMoneyOf,
  type BillLineDraft,
  type PoLineForBill,
  type WorkOrderLineForBill,
} from "@/lib/bills/lines";
import { rollUpBill } from "@/lib/bills/math";
import type { BillFormOptions } from "@/lib/bills/queries";
import { GENERAL_SCOPE, resolveScopeCode } from "@/lib/bills/reference";
import { exceedsAnchor } from "@/lib/bills/workflow";
import { formatDate, formatMoney } from "@/lib/format";
import { useActionRunner } from "@/lib/hooks/use-action-runner";
import { nextContractorBill } from "@/lib/masters/contractor-bill-number";
import { buildSiteOptions, decodeSite } from "@/lib/masters/site-options";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import {
  BillLinesEditor,
  draftsOf,
  toEditorLine,
  type EditorLine,
} from "../../_components/bill-lines-editor";

export type FormKind = "po" | "contract" | "nmr";

function NextBillNote({
  nextBill,
}: {
  nextBill: NonNullable<ReturnType<typeof nextContractorBill>>;
}) {
  return "problem" in nextBill ? (
    <p className="text-warning text-xs font-medium" role="alert">
      {nextBill.problem}
    </p>
  ) : (
    <p className="text-muted text-xs">
      {"Recording numbers it "}
      <span className="text-foreground font-mono font-semibold">{nextBill.reference}</span>
      {" — from the contractor's code and the project's company."}
    </p>
  );
}

// Labour logged on site is billed from Bills → Labour (Send to Bill); kind nmr here is labour with no work order: miscellaneous work or an unlogged muster roll. Over-billing warns, never blocks.
export function BillForm({
  options,
  initial,
  prefill,
  gstRates,
  uoms,
}: {
  options: BillFormOptions;
  initial: { kind: FormKind; vendorId: string; anchorId: string };
  prefill: {
    lines: BillLineDraft[];
    poLines?: PoLineForBill[];
    workLines?: WorkOrderLineForBill[];
    /** This PO's deliveries, each with the supplier invoice it carried (0132) and what it brought. */
    deliveries: (DeliveryForBill & { open: boolean })[];
    /** The delivery this bill is for, or "" for everything received and not yet billed. */
    deliveryId: string;
  };
  gstRates: number[];
  uoms: string[];
}) {
  const router = useRouter();
  const { kind, vendorId, anchorId } = initial;
  const [nmrVendorId, setNmrVendorId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [scope, setScope] = useState("");
  // The picked delivery's invoice fills itself in; with none picked, so does the one unbilled invoice when there is only one.
  const unbilled = prefill.deliveries.filter((delivery) => delivery.invoiceNo && delivery.open);
  const fromDelivery =
    prefill.deliveries.find((delivery) => delivery.id === prefill.deliveryId) ??
    (unbilled.length === 1 ? unbilled[0] : null);
  const [invoiceNo, setInvoiceNo] = useState(fromDelivery?.invoiceNo ?? "");
  const [invoiceDate, setInvoiceDate] = useState(fromDelivery?.invoiceDate ?? "");
  const [note, setNote] = useState("");
  const [lines, setLines] = useState<EditorLine[]>(() =>
    prefill.lines.map((draft) => toEditorLine(draft)),
  );
  const { pending: recording, error, run } = useActionRunner();

  const go = (next: {
    kind: FormKind;
    vendorId?: string;
    anchorId?: string;
    deliveryId?: string;
  }) => {
    const params = new URLSearchParams({ kind: next.kind });
    if (next.vendorId) params.set("vendor", next.vendorId);
    if (next.anchorId) params.set(next.kind === "po" ? "po" : "contract", next.anchorId);
    if (next.deliveryId) params.set("delivery", next.deliveryId);
    router.replace(`/bills/new?${params}`, { scroll: false });
  };

  // The order comes first and brings its vendor (founder, 2026-10-22): one search over every billable PO or work order.
  const vendorName = useMemo(
    () => new Map(options.vendors.map((vendor) => [vendor.id, vendor.name])),
    [options.vendors],
  );
  const anchorOptions: SearchOption[] = useMemo(
    () =>
      kind === "po"
        ? options.pos.map((po) => ({
            value: po.id,
            label: po.reference,
            hint: `${vendorName.get(po.vendor_id) ?? "—"} · ${po.project_name}`,
          }))
        : options.contracts.map((contract) => ({
            value: contract.id,
            label: `${contract.reference ? `${contract.reference} · ` : ""}${contract.description}`,
            hint: `${vendorName.get(contract.vendor_id) ?? "—"} · ${contract.project_name} (${contract.scope_name})`,
          })),
    [kind, options.pos, options.contracts, vendorName],
  );
  const anchoredPo = kind === "po" ? options.pos.find((po) => po.id === anchorId) : undefined;
  const anchoredContract =
    kind === "contract"
      ? options.contracts.find((contract) => contract.id === anchorId)
      : undefined;
  const anchorVendorId = anchoredPo?.vendor_id ?? anchoredContract?.vendor_id ?? vendorId;
  const pickAnchor = (id: string) => {
    const vendor =
      (kind === "po"
        ? options.pos.find((po) => po.id === id)?.vendor_id
        : options.contracts.find((contract) => contract.id === id)?.vendor_id) ?? "";
    go({ kind, vendorId: vendor, anchorId: id });
  };
  const anchorTotal = anchoredPo?.ordered_total ?? anchoredContract?.contract_value ?? null;
  const alreadyBilled = anchoredPo?.billed_total ?? anchoredContract?.billed_total ?? 0;

  // The NMR scope, the po-form way: one SitePicker; a code-less pick warns.
  const project = options.projects.find((candidate) => candidate.id === projectId);
  const nmrSiteOptions = useMemo(
    () => buildSiteOptions(options.units, options.plots, projectId),
    [options.units, options.plots, projectId],
  );
  const { plotId, unitId } = decodeSite(scope);
  const scopedSite = nmrSiteOptions.find((option) => option.value === scope);
  const missingProjectCode = kind === "nmr" && Boolean(project) && !project?.code;
  const scopeCode = resolveScopeCode(
    scopedSite?.code ?? null,
    scopedSite?.code ?? null,
    unitId ? "unit" : plotId ? "plot" : "general",
  );
  const missingScopeCode = kind === "nmr" && scope !== "" && scopeCode === null;

  const drafts = draftsOf(lines);
  const totals = rollUpBill(drafts.map(lineMoneyOf));
  const overBilled = anchorId !== "" && exceedsAnchor(anchorTotal, alreadyBilled, totals.total);
  const numberedVendor = kind === "nmr" ? nmrVendorId : (anchoredContract?.vendor_id ?? "");
  const numberedProject = kind === "nmr" ? projectId : (anchoredContract?.project_id ?? "");
  const nextBill =
    numberedVendor && numberedProject
      ? nextContractorBill(
          options.numbering,
          numberedVendor,
          numberedProject,
          kind === "contract" || isPieceWorkBill(drafts) ? "PW" : "NMR",
        )
      : null;
  const problem =
    (kind === "nmr"
      ? !projectId
        ? "Choose the project."
        : missingProjectCode || missingScopeCode
          ? "That place has no short code yet."
          : undefined
      : !anchorId
        ? kind === "po"
          ? "Choose the purchase order."
          : "Choose the work order."
        : undefined) ?? (nextBill && "problem" in nextBill ? nextBill.problem : undefined);
  const linesProblem = billLinesProblem(drafts);
  const blocked =
    problem ??
    (!invoiceNo.trim()
      ? "Type the invoice number."
      : !invoiceDate
        ? "Pick the date."
        : linesProblem);

  // A success lands on the new bill, so only refusals come back.
  const record = () =>
    run(() =>
      createBillWithLines({
        kind,
        poId: kind === "po" ? anchorId : null,
        labourContractId: kind === "contract" ? anchorId : null,
        vendorId: kind === "nmr" ? nmrVendorId || null : null,
        projectId: kind === "nmr" ? projectId : null,
        plotId: kind === "nmr" ? plotId : null,
        unitId: kind === "nmr" ? unitId : null,
        invoiceNo,
        invoiceDate,
        note: note || null,
        lines: drafts,
      }),
    );

  return (
    <div className="space-y-4">
      <div className="border-border bg-surface max-w-2xl space-y-4 rounded-2xl border p-5">
        <div className="space-y-1.5">
          <Label htmlFor="bill-kind">This bill is for</Label>
          <Select
            id="bill-kind"
            value={kind}
            onChange={(event) => go({ kind: event.target.value as FormKind })}
          >
            <option value="po">A purchase order — materials</option>
            <option value="contract">A work order — labour</option>
            <option value="nmr">Labour, no work order — miscellaneous or a muster roll</option>
          </Select>
          {kind === "nmr" && (
            <p className="text-muted text-xs">
              For labour with no work order: miscellaneous work, or a muster roll not logged on
              site. Labour the supervisors logged is billed from Bills → Labour, with Send to Bill.
            </p>
          )}
        </div>

        {kind !== "nmr" ? (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="bill-anchor">
                {kind === "po" ? "Against purchase order" : "Against work order"}
              </Label>
              <SearchSelect
                id="bill-anchor"
                options={anchorOptions}
                value={anchorId}
                onChange={(id) => (id ? pickAnchor(id) : go({ kind }))}
                placeholder={
                  kind === "po"
                    ? "Type the PO number, the vendor or the project…"
                    : "Type the work order number, the contractor or the project…"
                }
                emptyHint={
                  kind === "po"
                    ? "Only issued purchase orders appear here."
                    : "Only approved work orders appear here."
                }
              />
              {anchorId !== "" && (
                <p className="text-muted text-xs">
                  {anchoredPo
                    ? `PO value ${formatMoney(anchoredPo.ordered_total)} · billed so far ${formatMoney(alreadyBilled)}`
                    : anchoredContract
                      ? `Work order value ${formatMoney(anchoredContract.contract_value)} · billed so far ${formatMoney(alreadyBilled)}`
                      : null}
                </p>
              )}
            </div>
            {kind === "po" && anchorId !== "" && prefill.deliveries.length > 0 && (
              <div className="space-y-1.5">
                <Label htmlFor="bill-delivery">Which delivery is this bill for?</Label>
                <Select
                  id="bill-delivery"
                  value={prefill.deliveryId}
                  onChange={(event) =>
                    go({ kind, vendorId: anchorVendorId, anchorId, deliveryId: event.target.value })
                  }
                >
                  <option value="">Everything received and not yet billed</option>
                  {prefill.deliveries.map((delivery) => (
                    <option key={delivery.id} value={delivery.id} disabled={!delivery.open}>
                      {[
                        delivery.grn,
                        formatDate(delivery.receivedAt),
                        delivery.invoiceNo ? `invoice ${delivery.invoiceNo}` : "no invoice no.",
                        delivery.billed
                          ? "already billed"
                          : !delivery.open
                            ? "nothing left to bill"
                            : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </option>
                  ))}
                </Select>
                <p className="text-muted text-xs">
                  Its invoice number and date, and what it brought, fill the bill. Only what arrived
                  can be billed.
                </p>
              </div>
            )}
            {anchorId !== "" && (
              <div className="space-y-1.5">
                <p className="text-muted text-xs font-medium">
                  {kind === "po" ? "Vendor" : "Contractor"}
                </p>
                <p className="text-foreground text-sm font-medium">
                  {vendorName.get(anchorVendorId) ?? "—"}
                </p>
                {nextBill && <NextBillNote nextBill={nextBill} />}
              </div>
            )}
          </div>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="bill-nmr-project">Project</Label>
                <Select
                  id="bill-nmr-project"
                  value={projectId}
                  onChange={(event) => {
                    setProjectId(event.target.value);
                    setScope("");
                  }}
                >
                  <option value="" disabled>
                    Choose a project
                  </option>
                  {options.projects.map((candidate) => (
                    <option key={candidate.id} value={candidate.id}>
                      {candidate.name}
                      {candidate.code ? ` (${candidate.code})` : " — no code yet"}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="bill-nmr-scope">For</Label>
                <SitePicker
                  id="bill-nmr-scope"
                  value={scope}
                  onChange={(event) => setScope(event.target.value)}
                  disabled={!projectId}
                  options={nmrSiteOptions}
                  generalLabel="General — whole project"
                  showCodes
                />
              </div>
            </div>
            {missingProjectCode && (
              <p className="text-warning text-xs font-medium" role="alert">
                {project?.name} has no short code yet, so it can&apos;t number bills. Set one in
                Masters → Projects first.
              </p>
            )}
            {missingScopeCode ? (
              <p className="text-warning text-xs font-medium" role="alert">
                {scopedSite?.name} has no short code yet, so it can&apos;t number bills. Set one in
                Masters first.
              </p>
            ) : nextBill ? (
              <NextBillNote nextBill={nextBill} />
            ) : (
              project?.code && (
                <p className="text-muted text-xs">
                  Will be numbered BILL/{project.code}/{scopeCode ?? GENERAL_SCOPE}/… — the scope is
                  part of the number and can&apos;t change later.
                </p>
              )
            )}
            <div className="space-y-1.5">
              <Label htmlFor="bill-nmr-vendor">Contractor (optional)</Label>
              <Select
                id="bill-nmr-vendor"
                value={nmrVendorId}
                onChange={(event) => setNmrVendorId(event.target.value)}
              >
                <option value="">No contractor — paid directly</option>
                {options.vendors.map((vendor) => (
                  <option key={vendor.id} value={vendor.id}>
                    {vendor.name}
                  </option>
                ))}
              </Select>
            </div>
          </>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="bill-invoice-no">
              {kind === "nmr" ? "Contractor's bill or muster roll reference" : "Invoice number"}
            </Label>
            <Input
              id="bill-invoice-no"
              value={invoiceNo}
              onChange={(event) => setInvoiceNo(event.target.value)}
              placeholder={kind === "nmr" ? "e.g. Misc week 32" : "As printed on the bill"}
              autoComplete="off"
            />
            {kind === "po" && fromDelivery?.invoiceNo && (
              <p className="text-muted text-xs">{`From the delivery ${fromDelivery.grn}.`}</p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="bill-invoice-date">
              {kind === "nmr" ? "Bill date" : "Invoice date"}
            </Label>
            <Input
              id="bill-invoice-date"
              type="date"
              value={invoiceDate}
              onChange={(event) => setInvoiceDate(event.target.value)}
            />
          </div>
        </div>
      </div>

      {(kind === "nmr" || anchorId) && (
        <div className="space-y-2">
          <Heading>Lines</Heading>
          {kind === "po" && lines.length === 0 && (
            <p className="text-muted text-sm">
              Nothing on this PO has been received and left unbilled. A bill against it waits until
              the store or site records a delivery.
            </p>
          )}
          <BillLinesEditor
            lines={lines}
            onChange={setLines}
            gstRates={gstRates}
            uoms={uoms}
            poLines={prefill.poLines}
            workLines={prefill.workLines}
            allowOther={kind !== "po"}
          />
          {overBilled && anchorTotal !== null && (
            <p className="text-warning text-xs font-medium" role="alert">
              {`This takes billing against ${anchoredPo?.reference ?? anchoredContract?.reference ?? "it"} to ${formatMoney(alreadyBilled + totals.total)} — past its ${formatMoney(anchorTotal)} value. You can still record it; whoever approves should know why.`}
            </p>
          )}
        </div>
      )}

      <div className="max-w-2xl space-y-1.5">
        <Label htmlFor="bill-note">Note (optional)</Label>
        <Textarea
          id="bill-note"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="Anything the approver should know"
          rows={2}
        />
      </div>

      <div className="flex flex-wrap items-center justify-end gap-3">
        {!error && blocked && <p className="text-muted text-xs">{blocked}</p>}
        <FormMessage error={error} size="xs" />
        <LinkButton href="/bills/list" variant="ghost">
          Cancel
        </LinkButton>
        <Button onClick={record} disabled={recording || Boolean(blocked)}>
          {recording ? "Recording…" : "Record the bill"}
        </Button>
      </div>
    </div>
  );
}
