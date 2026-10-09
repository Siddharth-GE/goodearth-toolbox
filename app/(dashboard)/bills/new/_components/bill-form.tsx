"use client";

import { SitePicker } from "@/components/masters/site-picker";
import { Button, LinkButton } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/form-message";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { createBillWithLines } from "@/lib/bills/line-actions";
import {
  billLinesProblem,
  lineMoneyOf,
  type BillLineDraft,
  type PoLineForBill,
  type WorkOrderLineForBill,
} from "@/lib/bills/lines";
import { rollUpBill } from "@/lib/bills/math";
import type { BillFormOptions } from "@/lib/bills/queries";
import { GENERAL_SCOPE, resolveScopeCode } from "@/lib/bills/reference";
import { exceedsAnchor } from "@/lib/bills/workflow";
import { formatMoney } from "@/lib/format";
import { buildSiteOptions, decodeSite } from "@/lib/masters/site-options";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import {
  BillLinesEditor,
  draftsOf,
  toEditorLine,
  type EditorLine,
} from "../../_components/bill-lines-editor";

export type FormKind = "po" | "contract" | "nmr";

/**
 * What is this bill for? A purchase order, an approved work order, or
 * NMR — daily wages. A PO bill starts from the PO's materials received
 * and not yet billed; a work-order bill from its works; each line's
 * figures can be changed to match the paper, and the totals are the
 * lines' (plan.md B7). The kind, vendor and anchor live in the address,
 * so picking an anchor loads its lines. Daily wages logged on site are
 * billed from Bills → Labour (Send to Bill); this NMR form is for a
 * muster roll that never went through the log. Over-billing warns,
 * never blocks (founder decision).
 */
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
  };
  gstRates: number[];
  uoms: string[];
}) {
  const router = useRouter();
  const { kind, vendorId, anchorId } = initial;
  const [nmrVendorId, setNmrVendorId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [scope, setScope] = useState("");
  const [invoiceNo, setInvoiceNo] = useState("");
  const [invoiceDate, setInvoiceDate] = useState("");
  const [note, setNote] = useState("");
  const [lines, setLines] = useState<EditorLine[]>(() =>
    prefill.lines.map((draft) => toEditorLine(draft)),
  );
  const [error, setError] = useState<string>();
  const [recording, startTransition] = useTransition();

  const go = (next: { kind: FormKind; vendorId?: string; anchorId?: string }) => {
    const params = new URLSearchParams({ kind: next.kind });
    if (next.vendorId) params.set("vendor", next.vendorId);
    if (next.anchorId) params.set(next.kind === "po" ? "po" : "contract", next.anchorId);
    router.replace(`/bills/new?${params}`, { scroll: false });
  };

  // Only vendors with something to bill against in the chosen mode.
  const vendors = useMemo(() => {
    if (kind === "nmr") return options.vendors;
    const billable = new Set(
      kind === "po"
        ? options.pos.map((po) => po.vendor_id)
        : options.contracts.map((contract) => contract.vendor_id),
    );
    return options.vendors.filter((vendor) => billable.has(vendor.id));
  }, [options, kind]);
  const pos = options.pos.filter((po) => po.vendor_id === vendorId);
  const contracts = options.contracts.filter((contract) => contract.vendor_id === vendorId);
  const anchoredPo = kind === "po" ? pos.find((po) => po.id === anchorId) : undefined;
  const anchoredContract =
    kind === "contract" ? contracts.find((contract) => contract.id === anchorId) : undefined;
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
  const problem =
    kind === "nmr"
      ? !projectId
        ? "Choose the project."
        : missingProjectCode || missingScopeCode
          ? "That place has no short code yet."
          : undefined
      : !anchorId
        ? kind === "po"
          ? "Choose the purchase order."
          : "Choose the work order."
        : undefined;
  const linesProblem = billLinesProblem(drafts);
  const blocked =
    problem ??
    (!invoiceNo.trim()
      ? "Type the invoice number."
      : !invoiceDate
        ? "Pick the date."
        : linesProblem);

  const record = () =>
    startTransition(async () => {
      setError(undefined);
      // A success lands on the new bill, so only refusals come back.
      const result = await createBillWithLines({
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
      });
      if (result?.error) setError(result.error);
    });

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
            <option value="nmr">NMR — a muster roll not logged on site</option>
          </Select>
          {kind === "nmr" && (
            <p className="text-muted text-xs">
              Daily wages logged by the supervisors are billed from Bills → Labour, with Send to
              Bill.
            </p>
          )}
        </div>

        {kind !== "nmr" ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="bill-vendor">{kind === "po" ? "Vendor" : "Contractor"}</Label>
              <Select
                id="bill-vendor"
                value={vendorId}
                onChange={(event) => go({ kind, vendorId: event.target.value })}
              >
                <option value="" disabled>
                  {kind === "po" ? "Choose a vendor" : "Choose a contractor"}
                </option>
                {vendors.map((vendor) => (
                  <option key={vendor.id} value={vendor.id}>
                    {vendor.name}
                  </option>
                ))}
              </Select>
              <p className="text-muted text-xs">
                {kind === "po"
                  ? "Only vendors with an issued PO appear here."
                  : "Only contractors with an approved work order appear here."}
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bill-anchor">Against</Label>
              <Select
                id="bill-anchor"
                value={anchorId}
                onChange={(event) => go({ kind, vendorId, anchorId: event.target.value })}
                disabled={!vendorId}
              >
                <option value="" disabled>
                  {kind === "po" ? "Choose a purchase order" : "Choose a work order"}
                </option>
                {kind === "po"
                  ? pos.map((po) => (
                      <option key={po.id} value={po.id}>
                        {po.reference} — {po.project_name}
                      </option>
                    ))
                  : contracts.map((contract) => (
                      <option key={contract.id} value={contract.id}>
                        {contract.reference ? `${contract.reference} · ` : ""}
                        {contract.description} — {contract.project_name} ({contract.scope_name})
                      </option>
                    ))}
              </Select>
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
            ) : (
              project?.code && (
                <p className="text-muted text-xs">
                  Will be numbered BILL/{project.code}/{scopeCode ?? GENERAL_SCOPE}/… — the scope is
                  part of the number and can&apos;t change later.
                </p>
              )
            )}
            <div className="space-y-1.5">
              <Label htmlFor="bill-nmr-vendor">Labour contractor (optional)</Label>
              <Select
                id="bill-nmr-vendor"
                value={nmrVendorId}
                onChange={(event) => setNmrVendorId(event.target.value)}
              >
                <option value="">No vendor — paid directly</option>
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
              {kind === "nmr" ? "Muster roll / bill reference" : "Invoice number"}
            </Label>
            <Input
              id="bill-invoice-no"
              value={invoiceNo}
              onChange={(event) => setInvoiceNo(event.target.value)}
              placeholder={kind === "nmr" ? "e.g. NMR week 32" : "As printed on the bill"}
              autoComplete="off"
            />
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
          <h2 className="text-foreground text-lg font-bold tracking-tight">Lines</h2>
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
