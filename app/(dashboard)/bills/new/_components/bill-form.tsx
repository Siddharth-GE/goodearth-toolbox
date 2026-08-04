"use client";

import { Button, LinkButton } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/form-message";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { createBill } from "@/lib/bills/actions";
import type { BillFormOptions } from "@/lib/bills/queries";
import { exceedsAnchor } from "@/lib/bills/workflow";
import { formatMoney } from "@/lib/format";
import { useMemo, useState, useTransition } from "react";

/**
 * Vendor → that vendor's PO or labour contract → the invoice's figures.
 * One anchor select encodes po:<id> / contract:<id>, so picking both is
 * structurally impossible — the same exactly-one rule the DB CHECK
 * enforces. Over-billing WARNS, never blocks (founder decision).
 */
export function BillForm({ options }: { options: BillFormOptions }) {
  const [vendorId, setVendorId] = useState("");
  const [anchor, setAnchor] = useState("");
  const [invoiceNo, setInvoiceNo] = useState("");
  const [invoiceDate, setInvoiceDate] = useState("");
  const [taxable, setTaxable] = useState("");
  const [gst, setGst] = useState("");
  const [total, setTotal] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string>();
  const [recording, startTransition] = useTransition();

  // Only vendors with something to bill against: a billable PO or an
  // active contract. Others would dead-end at an empty anchor select.
  const vendors = useMemo(() => {
    const billable = new Set([
      ...options.pos.map((po) => po.vendor_id),
      ...options.contracts.map((contract) => contract.vendor_id),
    ]);
    return options.vendors.filter((vendor) => billable.has(vendor.id));
  }, [options]);

  const pos = useMemo(
    () => options.pos.filter((po) => po.vendor_id === vendorId),
    [options.pos, vendorId],
  );
  const contracts = useMemo(
    () => options.contracts.filter((contract) => contract.vendor_id === vendorId),
    [options.contracts, vendorId],
  );

  const [anchorKind, anchorId]: ["po" | "contract" | "", string] = anchor
    ? (anchor.split(":") as ["po" | "contract", string])
    : ["", ""];
  const anchoredPo = anchorKind === "po" ? pos.find((po) => po.id === anchorId) : undefined;
  const anchoredContract =
    anchorKind === "contract"
      ? contracts.find((contract) => contract.id === anchorId)
      : undefined;

  const anchorTotal = anchoredPo?.ordered_total ?? anchoredContract?.contract_value ?? null;
  const alreadyBilled = anchoredPo?.billed_total ?? anchoredContract?.billed_total ?? 0;

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
    amountsValid && anchor !== "" && exceedsAnchor(anchorTotal, alreadyBilled, totalNum);
  // A gentle nudge, not a rule: real invoices round their own way, and
  // the founder's decision is to record the paper as printed.
  const sumsDisagree = amountsValid && Math.abs(taxableNum + gstNum - totalNum) > 1;

  const record = () =>
    startTransition(async () => {
      // A success redirects to the new bill, so only errors come back.
      const result = await createBill({
        poId: anchorKind === "po" ? anchorId : null,
        labourContractId: anchorKind === "contract" ? anchorId : null,
        invoiceNo,
        invoiceDate,
        taxableAmount: taxableNum,
        gstAmount: gstNum,
        totalAmount: totalNum,
        note: note || null,
      });
      if (result?.error) setError(result.error);
    });

  return (
    <div className="border-border bg-surface max-w-xl space-y-4 rounded-2xl border p-5">
      <div className="space-y-1.5">
        <Label htmlFor="bill-vendor">Vendor</Label>
        <Select
          id="bill-vendor"
          value={vendorId}
          onChange={(event) => {
            setVendorId(event.target.value);
            setAnchor("");
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
          Only vendors with an issued PO or an active labour contract appear here.
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="bill-anchor">Against</Label>
        <Select
          id="bill-anchor"
          value={anchor}
          onChange={(event) => setAnchor(event.target.value)}
          disabled={!vendorId}
        >
          <option value="" disabled>
            Choose a purchase order or contract
          </option>
          {pos.length > 0 && (
            <optgroup label="Purchase orders">
              {pos.map((po) => (
                <option key={po.id} value={`po:${po.id}`}>
                  {po.reference} — {po.project_name}
                </option>
              ))}
            </optgroup>
          )}
          {contracts.length > 0 && (
            <optgroup label="Labour contracts">
              {contracts.map((contract) => (
                <option key={contract.id} value={`contract:${contract.id}`}>
                  {contract.description} — {contract.project_name} ({contract.scope_name})
                </option>
              ))}
            </optgroup>
          )}
        </Select>
        {anchor !== "" && (
          <p className="text-muted text-xs">
            {anchoredPo
              ? `PO value ${formatMoney(anchoredPo.ordered_total)} · billed so far ${formatMoney(alreadyBilled)}`
              : anchoredContract
                ? `Contract value ${formatMoney(anchoredContract.contract_value)} · billed so far ${formatMoney(alreadyBilled)}`
                : null}
          </p>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="bill-invoice-no">Invoice number</Label>
          <Input
            id="bill-invoice-no"
            value={invoiceNo}
            onChange={(event) => setInvoiceNo(event.target.value)}
            placeholder="As printed on the bill"
            autoComplete="off"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="bill-invoice-date">Invoice date</Label>
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
        The vendor&apos;s figures, exactly as printed — nothing is computed or corrected.
      </p>
      {sumsDisagree && (
        <p className="text-muted text-xs">
          Heads up: taxable + GST is {formatMoney(taxableNum + gstNum)}, not{" "}
          {formatMoney(totalNum)}. If that&apos;s what the paper says, record it as is.
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
        <LinkButton href="/bills" variant="ghost">
          Cancel
        </LinkButton>
        <Button
          onClick={record}
          disabled={recording || !anchor || !invoiceNo.trim() || !invoiceDate || !amountsValid}
        >
          {recording ? "Recording…" : "Record bill"}
        </Button>
      </div>
    </div>
  );
}
