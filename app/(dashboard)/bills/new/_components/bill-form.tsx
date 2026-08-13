"use client";

import { SitePicker } from "@/components/masters/site-picker";
import { Button, LinkButton } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/form-message";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { createBill, createNmrBill } from "@/lib/bills/actions";
import type { BillFormOptions } from "@/lib/bills/queries";
import { buildSiteOptions, decodeSite } from "@/lib/masters/site-options";
import { GENERAL_SCOPE, resolveScopeCode } from "@/lib/bills/reference";
import { exceedsAnchor } from "@/lib/bills/workflow";
import { formatMoney } from "@/lib/format";
import { useMemo, useState, useTransition } from "react";

type FormKind = "po" | "contract" | "nmr";

/**
 * What is this bill for? A purchase order, an approved labour
 * contract, or NMR — daily wages (no anchor at all, vendor optional).
 * PO/contract: vendor first, then that vendor's anchors. NMR: the
 * project and plot/unit are picked directly and enter the number.
 * Over-billing WARNS, never blocks (founder decision); NMR has nothing
 * to compare against, so it never warns.
 */
export function BillForm({ options }: { options: BillFormOptions }) {
  const [kind, setKind] = useState<FormKind>("po");
  const [vendorId, setVendorId] = useState("");
  const [anchorId, setAnchorId] = useState("");
  // The NMR branch's own scope pick.
  const [projectId, setProjectId] = useState("");
  const [scope, setScope] = useState("");
  const [invoiceNo, setInvoiceNo] = useState("");
  const [invoiceDate, setInvoiceDate] = useState("");
  const [taxable, setTaxable] = useState("");
  const [gst, setGst] = useState("");
  const [total, setTotal] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string>();
  const [recording, startTransition] = useTransition();

  const switchKind = (next: FormKind) => {
    setKind(next);
    setVendorId("");
    setAnchorId("");
    setProjectId("");
    setScope("");
    setError(undefined);
  };

  // Only vendors with something to bill against in the chosen mode —
  // others would dead-end at an empty anchor select.
  const vendors = useMemo(() => {
    if (kind === "nmr") return options.vendors;
    const billable = new Set(
      kind === "po"
        ? options.pos.map((po) => po.vendor_id)
        : options.contracts.map((contract) => contract.vendor_id),
    );
    return options.vendors.filter((vendor) => billable.has(vendor.id));
  }, [options, kind]);

  const pos = useMemo(
    () => options.pos.filter((po) => po.vendor_id === vendorId),
    [options.pos, vendorId],
  );
  const contracts = useMemo(
    () => options.contracts.filter((contract) => contract.vendor_id === vendorId),
    [options.contracts, vendorId],
  );

  const anchoredPo = kind === "po" ? pos.find((po) => po.id === anchorId) : undefined;
  const anchoredContract =
    kind === "contract" ? contracts.find((contract) => contract.id === anchorId) : undefined;

  const anchorTotal = anchoredPo?.ordered_total ?? anchoredContract?.contract_value ?? null;
  const alreadyBilled = anchoredPo?.billed_total ?? anchoredContract?.billed_total ?? 0;

  // The NMR scope, the po-form way: one SitePicker, unit:<id> /
  // plot:<id> / "" (general); a code-less pick warns and blocks
  // submission — the database would refuse anyway, this just says so
  // sooner.
  const project = options.projects.find((candidate) => candidate.id === projectId);
  const nmrSiteOptions = useMemo(
    () => buildSiteOptions(options.units, options.plots, projectId),
    [options.units, options.plots, projectId],
  );
  const { plotId: scopePlotId, unitId: scopeUnitId } = decodeSite(scope);
  const scopedSite = nmrSiteOptions.find((option) => option.value === scope);
  const missingProjectCode = kind === "nmr" && Boolean(project) && !project?.code;
  const scopeCode = resolveScopeCode(
    scopedSite?.code ?? null,
    scopedSite?.code ?? null,
    scopeUnitId ? "unit" : scopePlotId ? "plot" : "general",
  );
  const missingScopeCode = kind === "nmr" && scope !== "" && scopeCode === null;

  const taxableNum = Number(taxable);
  const gstNum = Number(gst);
  const totalNum = Number(total);
  const amountsValid =
    taxable !== "" &&
    gst !== "" &&
    total !== "" &&
    Number.isFinite(taxableNum) &&
    taxableNum >= 0 &&
    Number.isFinite(gstNum) &&
    gstNum >= 0 &&
    Number.isFinite(totalNum) &&
    totalNum > 0;

  const overBilled =
    amountsValid && anchorId !== "" && exceedsAnchor(anchorTotal, alreadyBilled, totalNum);
  // A gentle nudge, not a rule: real invoices round their own way, and
  // the founder's decision is to record the paper as printed.
  const sumsDisagree = amountsValid && Math.abs(taxableNum + gstNum - totalNum) > 1;

  const readyToRecord =
    amountsValid &&
    invoiceNo.trim() !== "" &&
    invoiceDate !== "" &&
    (kind === "nmr"
      ? projectId !== "" && !missingProjectCode && !missingScopeCode
      : anchorId !== "");

  const record = () =>
    startTransition(async () => {
      // A success redirects to the new bill, so only errors come back.
      const shared = {
        invoiceNo,
        invoiceDate,
        taxableAmount: taxableNum,
        gstAmount: gstNum,
        totalAmount: totalNum,
        note: note || null,
      };
      const result =
        kind === "nmr"
          ? await createNmrBill({
              vendorId: vendorId || null,
              projectId,
              plotId: scopePlotId,
              unitId: scopeUnitId,
              ...shared,
            })
          : await createBill({
              poId: kind === "po" ? anchorId : null,
              labourContractId: kind === "contract" ? anchorId : null,
              ...shared,
            });
      if (result?.error) setError(result.error);
    });

  return (
    <div className="border-border bg-surface max-w-xl space-y-4 rounded-2xl border p-5">
      <div className="space-y-1.5">
        <Label htmlFor="bill-kind">This bill is for</Label>
        <Select
          id="bill-kind"
          value={kind}
          onChange={(event) => switchKind(event.target.value as FormKind)}
        >
          <option value="po">A purchase order</option>
          <option value="contract">A labour contract</option>
          <option value="nmr">NMR — daily wages</option>
        </Select>
        {kind === "contract" && (
          <p className="text-muted text-xs">
            Only approved, active contracts can take bills — manage them under Bills → Labour
            contracts.
          </p>
        )}
      </div>

      {kind !== "nmr" ? (
        <>
          <div className="space-y-1.5">
            <Label htmlFor="bill-vendor">Vendor</Label>
            <Select
              id="bill-vendor"
              value={vendorId}
              onChange={(event) => {
                setVendorId(event.target.value);
                setAnchorId("");
              }}
            >
              <option value="" disabled>
                Choose a vendor
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
                : "Only contractors with an approved, active contract appear here."}
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="bill-anchor">Against</Label>
            <Select
              id="bill-anchor"
              value={anchorId}
              onChange={(event) => setAnchorId(event.target.value)}
              disabled={!vendorId}
            >
              <option value="" disabled>
                {kind === "po" ? "Choose a purchase order" : "Choose a contract"}
              </option>
              {kind === "po"
                ? pos.map((po) => (
                    <option key={po.id} value={po.id}>
                      {po.reference} — {po.project_name}
                    </option>
                  ))
                : contracts.map((contract) => (
                    <option key={contract.id} value={contract.id}>
                      {contract.description} — {contract.project_name} ({contract.scope_name})
                    </option>
                  ))}
            </Select>
            {anchorId !== "" && (
              <p className="text-muted text-xs">
                {anchoredPo
                  ? `PO value ${formatMoney(anchoredPo.ordered_total)} · billed so far ${formatMoney(alreadyBilled)}`
                  : anchoredContract
                    ? `Contract value ${formatMoney(anchoredContract.contract_value)} · billed so far ${formatMoney(alreadyBilled)}`
                    : null}
              </p>
            )}
          </div>
        </>
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
              value={vendorId}
              onChange={(event) => setVendorId(event.target.value)}
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
          <Label htmlFor="bill-invoice-date">{kind === "nmr" ? "Bill date" : "Invoice date"}</Label>
          <Input
            id="bill-invoice-date"
            type="date"
            value={invoiceDate}
            onChange={(event) => setInvoiceDate(event.target.value)}
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="bill-taxable">Taxable (₹)</Label>
          <Input
            id="bill-taxable"
            type="number"
            min="0"
            step="0.01"
            value={taxable}
            onChange={(event) => setTaxable(event.target.value)}
            autoComplete="off"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="bill-gst">GST (₹)</Label>
          <Input
            id="bill-gst"
            type="number"
            min="0"
            step="0.01"
            value={gst}
            onChange={(event) => setGst(event.target.value)}
            autoComplete="off"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="bill-total">Total (₹)</Label>
          <Input
            id="bill-total"
            type="number"
            min="0.01"
            step="0.01"
            value={total}
            onChange={(event) => setTotal(event.target.value)}
            autoComplete="off"
          />
        </div>
      </div>
      <p className="text-muted text-xs">
        The figures exactly as printed — nothing is computed or corrected.
      </p>
      {sumsDisagree && (
        <p className="text-muted text-xs">
          Heads up: taxable + GST is {formatMoney(taxableNum + gstNum)}, not {formatMoney(totalNum)}
          . If that&apos;s what the paper says, record it as is.
        </p>
      )}
      {overBilled && anchorTotal !== null && (
        <p className="text-warning text-xs font-medium" role="alert">
          This takes billing against {anchoredPo?.reference ?? "this contract"} to{" "}
          {formatMoney(alreadyBilled + totalNum)} — past its {formatMoney(anchorTotal)} value. You
          can still record it; someone approving should know why.
        </p>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="bill-note">Note (optional)</Label>
        <Textarea
          id="bill-note"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="Anything the approver should know"
          rows={2}
        />
      </div>

      <FormMessage error={error} />

      <div className="flex items-center justify-end gap-2">
        <LinkButton href="/bills/list" variant="ghost">
          Cancel
        </LinkButton>
        <Button onClick={record} disabled={recording || !readyToRecord}>
          {recording ? "Recording…" : "Record bill"}
        </Button>
      </div>
    </div>
  );
}
