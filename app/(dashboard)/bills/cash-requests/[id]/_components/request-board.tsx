"use client";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { FormMessage } from "@/components/ui/form-message";
import { IconButton } from "@/components/ui/icon-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableFoot,
  TableHead,
  TableHeaderCell,
  TableRow,
  TableTotalCell,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { lineLeftToPay, paymentProblem } from "@/lib/bills/ledger";
import {
  addAdvanceToCashRequest,
  addBillsToCashRequest,
  closeCashRequest,
  recordAdvance,
  recordBillPayment,
  releaseCashRequest,
  removeCashRequestItem,
  sendBackCashRequest,
  setCashRequestAmount,
  setCashRequestNote,
  submitCashRequest,
} from "@/lib/bills/payment-actions";
import type { CashRequestDetail, CashRequestItem, PayableBill } from "@/lib/bills/payment-queries";
import { formatDate, formatMoney } from "@/lib/format";
import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

type Result = { error?: string } | undefined;
type Option = { id: string; name: string };

/** Runs an action, shows its refusal, refreshes the page on success. */
function useRun() {
  const router = useRouter();
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();
  const run = (action: () => Promise<Result>, after?: () => void) =>
    startTransition(async () => {
      setError(undefined);
      const result = await action();
      if (result?.error) {
        setError(result.error);
        return;
      }
      after?.();
      router.refresh();
    });
  return { run, error, pending };
}

/**
 * The lines of one week's request, and what can be done with them at
 * its stage: asked amounts while drafting, released amounts while with
 * the approver, payments once released.
 */
export function RequestLines({
  request,
  isApprover,
}: {
  request: CashRequestDetail;
  isApprover: boolean;
}) {
  const drafting = request.status === "draft";
  const deciding = request.status === "submitted" && isApprover;
  const paying = request.status === "released";

  return (
    <Table>
      <TableHead>
        <TableRow>
          <TableHeaderCell>For</TableHeaderCell>
          <TableHeaderCell className="text-right">Bill / pending</TableHeaderCell>
          <TableHeaderCell className="w-36 text-right">Asked for</TableHeaderCell>
          <TableHeaderCell className="w-36 text-right">Released</TableHeaderCell>
          <TableHeaderCell className="text-right">Paid</TableHeaderCell>
          <TableHeaderCell className="min-w-48"></TableHeaderCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {request.items.map((item) => (
          <LineRow
            key={item.id}
            item={item}
            drafting={drafting}
            deciding={deciding}
            paying={paying}
          />
        ))}
      </TableBody>
      <TableFoot>
        <TableRow>
          <TableTotalCell colSpan={2}>Week&apos;s total</TableTotalCell>
          <TableTotalCell className="text-right font-mono">
            {formatMoney(request.figures.requested)}
          </TableTotalCell>
          <TableTotalCell className="text-right font-mono">
            {drafting || request.status === "submitted"
              ? "—"
              : formatMoney(request.figures.released)}
          </TableTotalCell>
          <TableTotalCell className="text-right font-mono">
            {formatMoney(request.figures.paid)}
          </TableTotalCell>
          <TableTotalCell className="text-muted text-right text-xs font-normal">
            {paying ? `${formatMoney(request.figures.toPay)} still to pay` : ""}
          </TableTotalCell>
        </TableRow>
      </TableFoot>
    </Table>
  );
}

function LineRow({
  item,
  drafting,
  deciding,
  paying,
}: {
  item: CashRequestItem;
  drafting: boolean;
  deciding: boolean;
  paying: boolean;
}) {
  const { run, error, pending } = useRun();
  const [requested, setRequested] = useState(String(item.requested));
  const [released, setReleased] = useState(String(item.released ?? item.requested));
  const [payOpen, setPayOpen] = useState(false);
  const leftToPay = lineLeftToPay(item);
  const payable =
    item.kind === "bill" ? Math.min(leftToPay, item.bill_pending ?? leftToPay) : leftToPay;

  return (
    <>
      <TableRow className="align-top">
        <TableCell>
          {item.kind === "bill" ? (
            <>
              <span className="text-foreground font-mono font-medium">{item.bill_reference}</span>
              <div className="text-muted text-xs">{`${item.vendor_name} · ${item.project_name}`}</div>
            </>
          ) : (
            <>
              <span className="text-foreground font-medium">{`Advance — ${item.vendor_name}`}</span>
              <div className="text-muted text-xs">
                {`${item.project_name}${item.work_order ? ` · ${item.work_order}` : ""}`}
              </div>
            </>
          )}
          {item.note && <div className="text-muted text-xs">{item.note}</div>}
        </TableCell>
        <TableCell className="text-right font-mono text-xs whitespace-nowrap">
          {item.kind === "bill" ? (
            <>
              {formatMoney(item.bill_total)}
              <div className="text-muted">{`${formatMoney(item.bill_pending)} pending`}</div>
            </>
          ) : (
            "—"
          )}
        </TableCell>
        <TableCell className="text-right">
          {drafting ? (
            <Input
              type="number"
              step="0.01"
              min="0.01"
              value={requested}
              onChange={(event) => setRequested(event.target.value)}
              onBlur={() => {
                if (Number(requested) !== item.requested) {
                  run(() => setCashRequestAmount(item.id, { requested: Number(requested) }));
                }
              }}
              className="h-9 text-right"
              aria-label="Amount asked for"
            />
          ) : (
            <span className="font-mono">{formatMoney(item.requested)}</span>
          )}
        </TableCell>
        <TableCell className="text-right">
          {deciding ? (
            <Input
              type="number"
              step="0.01"
              min="0"
              value={released}
              onChange={(event) => setReleased(event.target.value)}
              onBlur={() => {
                if (Number(released) !== (item.released ?? item.requested)) {
                  run(() => setCashRequestAmount(item.id, { released: Number(released) }));
                }
              }}
              className="h-9 text-right"
              aria-label="Amount released"
            />
          ) : (
            <span className="font-mono">
              {item.released === null ? "—" : formatMoney(item.released)}
            </span>
          )}
        </TableCell>
        <TableCell className="text-right font-mono">{formatMoney(item.paid)}</TableCell>
        <TableCell className="text-right">
          <div className="flex items-center justify-end gap-2">
            {drafting && (
              <IconButton
                aria-label="Remove this line"
                tone="danger"
                disabled={pending}
                onClick={() => run(() => removeCashRequestItem(item.id))}
              >
                <Trash2 className="size-4" />
              </IconButton>
            )}
            {paying && payable > 0 && !payOpen && (
              <Button size="sm" onClick={() => setPayOpen(true)}>
                {item.kind === "bill" ? "Pay" : "Give the advance"}
              </Button>
            )}
            {paying && payable <= 0 && <span className="text-muted text-xs">Done</span>}
          </div>
          <FormMessage error={error} size="xs" />
        </TableCell>
      </TableRow>
      {payOpen && (
        <TableRow>
          <TableCell colSpan={6}>
            <PayForm item={item} cap={payable} onDone={() => setPayOpen(false)} />
          </TableCell>
        </TableRow>
      )}
    </>
  );
}

/** Paying a released line: a bill payment, or the advance itself. */
function PayForm({
  item,
  cap,
  onDone,
}: {
  item: CashRequestItem;
  cap: number;
  onDone: () => void;
}) {
  const { run, error, pending } = useRun();
  const [amount, setAmount] = useState(String(cap));
  const [paidOn, setPaidOn] = useState(() => new Date().toISOString().slice(0, 10));
  const [reference, setReference] = useState("");
  const value = Number(amount);
  const problem = paymentProblem({
    amount: value,
    reference,
    pending: item.kind === "bill" ? (item.bill_pending ?? 0) : cap,
    cap,
  });

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="space-y-1.5">
        <Label htmlFor={`amount-${item.id}`}>Amount (₹)</Label>
        <Input
          id={`amount-${item.id}`}
          type="number"
          step="0.01"
          min="0.01"
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          className="w-36"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`on-${item.id}`}>Paid on</Label>
        <Input
          id={`on-${item.id}`}
          type="date"
          value={paidOn}
          onChange={(event) => setPaidOn(event.target.value)}
          className="w-40"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`ref-${item.id}`}>UTR / cheque / UPI ref</Label>
        <Input
          id={`ref-${item.id}`}
          value={reference}
          onChange={(event) => setReference(event.target.value)}
          className="w-56"
          autoComplete="off"
        />
      </div>
      <Button variant="ghost" size="sm" onClick={onDone}>
        Cancel
      </Button>
      <Button
        size="sm"
        disabled={pending || Boolean(problem)}
        onClick={() =>
          run(
            () =>
              item.kind === "bill" && item.bill_id
                ? recordBillPayment(item.bill_id, {
                    amount: value,
                    paidOn,
                    reference,
                    note: null,
                    cashRequestItemId: item.id,
                  })
                : recordAdvance({
                    vendorId: item.vendor_id ?? "",
                    projectId: item.project_id ?? "",
                    labourContractId: null,
                    amount: value,
                    paidOn,
                    reference,
                    note: item.note,
                    cashRequestItemId: item.id,
                  }),
            onDone,
          )
        }
      >
        {pending ? "Saving…" : "Record it"}
      </Button>
      {!error && problem && <p className="text-muted text-xs">{problem}</p>}
      <FormMessage error={error} size="xs" />
    </div>
  );
}

/** Approved bills with something pending, ticked onto a draft request. */
export function AddBills({ requestId, bills }: { requestId: string; bills: PayableBill[] }) {
  const { run, error, pending } = useRun();
  const [picked, setPicked] = useState<Record<string, string>>({});
  const entries = Object.entries(picked);

  if (bills.length === 0) {
    return (
      <p className="text-muted text-sm">
        Every approved bill with something pending is already on this request — or there are none.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <Table>
        <TableHead>
          <TableRow>
            <TableHeaderCell className="w-10"></TableHeaderCell>
            <TableHeaderCell>Bill</TableHeaderCell>
            <TableHeaderCell>Invoice date</TableHeaderCell>
            <TableHeaderCell className="text-right">Total</TableHeaderCell>
            <TableHeaderCell className="text-right">Pending</TableHeaderCell>
            <TableHeaderCell className="w-40 text-right">Ask for</TableHeaderCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {bills.map((bill) => {
            const on = picked[bill.id] != null;
            return (
              <TableRow key={bill.id}>
                <TableCell>
                  <Checkbox
                    checked={on}
                    onChange={(event) =>
                      setPicked((current) => {
                        const next = { ...current };
                        if (event.target.checked) next[bill.id] = String(bill.pending);
                        else delete next[bill.id];
                        return next;
                      })
                    }
                    aria-label={`Add ${bill.reference}`}
                  />
                </TableCell>
                <TableCell>
                  <span className="font-mono font-medium">{bill.reference}</span>
                  <div className="text-muted text-xs">{`${bill.vendor_name} · ${bill.project_name}`}</div>
                </TableCell>
                <TableCell className="text-muted">{formatDate(bill.invoice_date)}</TableCell>
                <TableCell className="text-right font-mono">{formatMoney(bill.total)}</TableCell>
                <TableCell className="text-right font-mono">{formatMoney(bill.pending)}</TableCell>
                <TableCell className="text-right">
                  {on && (
                    <Input
                      type="number"
                      step="0.01"
                      min="0.01"
                      value={picked[bill.id]}
                      onChange={(event) =>
                        setPicked((current) => ({ ...current, [bill.id]: event.target.value }))
                      }
                      className="h-9 text-right"
                      aria-label={`Ask for, ${bill.reference}`}
                    />
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      <div className="flex flex-wrap items-center justify-end gap-3">
        <FormMessage error={error} size="xs" />
        <Button
          size="sm"
          disabled={pending || entries.length === 0}
          onClick={() =>
            run(
              () =>
                addBillsToCashRequest(
                  requestId,
                  entries.map(([billId, amount]) => ({ billId, amount: Number(amount) })),
                ),
              () => setPicked({}),
            )
          }
        >
          {entries.length === 0 ? "Tick bills to add" : `Add ${entries.length} to the request`}
        </Button>
      </div>
    </div>
  );
}

/** An advance onto a draft request: contractor, project, optionally a work order. */
export function AddAdvance({
  requestId,
  contractors,
  projects,
  workOrders,
}: {
  requestId: string;
  contractors: Option[];
  projects: Option[];
  workOrders: {
    id: string;
    reference: string | null;
    vendor_id: string;
    project_id: string;
    description: string;
  }[];
}) {
  const { run, error, pending } = useRun();
  const [vendorId, setVendorId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [workOrderId, setWorkOrderId] = useState("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const orders = workOrders.filter(
    (order) => order.vendor_id === vendorId && order.project_id === projectId,
  );

  return (
    <div className="grid gap-3 sm:grid-cols-5">
      <div className="space-y-1.5">
        <Label htmlFor="advance-vendor">Contractor</Label>
        <Select
          id="advance-vendor"
          value={vendorId}
          onChange={(event) => setVendorId(event.target.value)}
        >
          <option value="">Pick…</option>
          {contractors.map((option) => (
            <option key={option.id} value={option.id}>
              {option.name}
            </option>
          ))}
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="advance-project">Project</Label>
        <Select
          id="advance-project"
          value={projectId}
          onChange={(event) => setProjectId(event.target.value)}
        >
          <option value="">Pick…</option>
          {projects.map((option) => (
            <option key={option.id} value={option.id}>
              {option.name}
            </option>
          ))}
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="advance-wo">Work order (optional)</Label>
        <Select
          id="advance-wo"
          value={workOrderId}
          onChange={(event) => setWorkOrderId(event.target.value)}
        >
          <option value="">None</option>
          {orders.map((order) => (
            <option key={order.id} value={order.id}>
              {order.reference ?? order.description}
            </option>
          ))}
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="advance-amount">Amount (₹)</Label>
        <Input
          id="advance-amount"
          type="number"
          step="0.01"
          min="0.01"
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="advance-note">Note</Label>
        <Input
          id="advance-note"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          autoComplete="off"
        />
      </div>
      <div className="flex flex-wrap items-center justify-end gap-3 sm:col-span-5">
        <FormMessage error={error} size="xs" />
        <Button
          size="sm"
          variant="secondary"
          disabled={pending || !vendorId || !projectId || !(Number(amount) > 0)}
          onClick={() =>
            run(
              () =>
                addAdvanceToCashRequest(requestId, {
                  vendorId,
                  projectId,
                  labourContractId: workOrderId || null,
                  amount: Number(amount),
                  note: note || null,
                }),
              () => {
                setAmount("");
                setNote("");
              },
            )
          }
        >
          Add the advance
        </Button>
      </div>
    </div>
  );
}

/** The request's next step: submit, release or send back, close. */
export function RequestActions({
  request,
  isApprover,
}: {
  request: CashRequestDetail;
  isApprover: boolean;
}) {
  const { run, error, pending } = useRun();
  const [note, setNote] = useState(request.note ?? "");
  const [sendingBack, setSendingBack] = useState(false);
  const [backNote, setBackNote] = useState("");

  return (
    <div className="space-y-3">
      {request.status === "draft" && (
        <div className="space-y-1.5">
          <Label htmlFor="request-note">Note for the approver (optional)</Label>
          <Textarea
            id="request-note"
            rows={2}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            onBlur={() => {
              if (note !== (request.note ?? "")) run(() => setCashRequestNote(request.id, note));
            }}
          />
        </div>
      )}
      {sendingBack && (
        <div className="space-y-1.5">
          <Label htmlFor="send-back">What needs changing</Label>
          <Textarea
            id="send-back"
            rows={2}
            value={backNote}
            onChange={(event) => setBackNote(event.target.value)}
          />
        </div>
      )}
      <div className="flex flex-wrap items-center justify-end gap-3">
        <FormMessage error={error} size="xs" />
        {request.status === "draft" && (
          <Button
            disabled={pending || request.items.length === 0}
            onClick={() => run(() => submitCashRequest(request.id))}
          >
            {pending ? "Submitting…" : "Submit to an approver"}
          </Button>
        )}
        {request.status === "submitted" && isApprover && !sendingBack && (
          <>
            <Button variant="secondary" disabled={pending} onClick={() => setSendingBack(true)}>
              Send back
            </Button>
            <Button disabled={pending} onClick={() => run(() => releaseCashRequest(request.id))}>
              {pending ? "Releasing…" : "Release"}
            </Button>
          </>
        )}
        {sendingBack && (
          <>
            <Button variant="ghost" onClick={() => setSendingBack(false)}>
              Cancel
            </Button>
            <Button
              disabled={pending || !backNote.trim()}
              onClick={() =>
                run(
                  () => sendBackCashRequest(request.id, backNote),
                  () => setSendingBack(false),
                )
              }
            >
              Send it back
            </Button>
          </>
        )}
        {request.status === "submitted" && !isApprover && (
          <p className="text-muted text-sm">Waiting for a bill approver to release it.</p>
        )}
        {request.status === "released" && (
          <Button
            variant="secondary"
            disabled={pending}
            onClick={() => run(() => closeCashRequest(request.id))}
          >
            Close the week
          </Button>
        )}
      </div>
    </div>
  );
}
