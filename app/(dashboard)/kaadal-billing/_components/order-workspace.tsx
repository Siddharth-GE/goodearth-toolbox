"use client";

import { Card } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Figure } from "@/components/ui/figure";
import { HealthPill } from "@/components/ui/health-pill";
import { Pill } from "@/components/ui/pill";
import { Section } from "@/components/ui/section";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/components/ui/table";
import { useUndoBar } from "@/components/ui/undo-bar";
import { formatDate } from "@/lib/format";
import { deleteOrder, restoreOrder } from "@/lib/kaadal-billing/actions";
import {
  allocLabel,
  allocOf,
  figures,
  rupees,
  shares,
  shortPlot,
  type Order,
  type Payment,
} from "@/lib/kaadal-billing/ledger";
import { draftFrom, newPaymentDraft, type PaymentDraft } from "@/lib/kaadal-billing/rules";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { BankBlock } from "./copy-button";
import { OrderDetails } from "./order-details";
import { PaidLegend } from "./parts";
import { PaymentForm } from "./payment-form";

export function OrderWorkspace({
  order,
  pays,
  vendor,
  vendors,
  plots,
  today,
  editPaymentId,
  focusPay,
}: {
  order: Order;
  pays: Payment[];
  vendor: { id: string; name: string; bank: string };
  vendors: { id: string; name: string; bank: string }[];
  plots: string[];
  today: string;
  editPaymentId: string | null;
  focusPay: boolean;
}) {
  const router = useRouter();
  const show = useUndoBar();
  const f = figures(order, pays);
  const multi = order.plots.length > 1;
  const sh = multi ? shares(order, pays) : null;
  const opening = editPaymentId ? pays.find((p) => p.id === editPaymentId) : undefined;
  const [draft, setDraft] = useState<PaymentDraft>(() =>
    opening ? draftFrom(opening) : newPaymentDraft(order, pays, today),
  );

  const edit = (p: Payment) => {
    setDraft(draftFrom(p));
    document.getElementById("pay")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="space-y-4">
      <Card className="space-y-4 p-5">
        <div className="grid grid-cols-3 gap-3">
          <Figure size="lg" label="Order value" value={rupees(f.net)} />
          <Figure size="lg" label="Paid" value={rupees(f.paid)} />
          <Figure
            size="lg"
            label={f.over ? "Overpaid" : "Balance"}
            value={f.state === "paid" ? "Paid" : rupees(Math.abs(f.balance))}
            tone={f.state === "paid" ? "good" : f.over ? "bad" : undefined}
          />
        </div>
        {f.byClient > 0 ? (
          <p className="text-muted text-xs">
            <PaidLegend kaadal={rupees(f.byKaadal)} client={rupees(f.byClient)} />
          </p>
        ) : null}
        {sh ? (
          <Table>
            <TableHead>
              <tr>
                <TableHeaderCell>Plot</TableHeaderCell>
                <TableHeaderCell className="text-right">Value</TableHeaderCell>
                <TableHeaderCell className="text-right">Deduction</TableHeaderCell>
                <TableHeaderCell className="text-right">Paid</TableHeaderCell>
                <TableHeaderCell className="text-right">Balance</TableHeaderCell>
              </tr>
            </TableHead>
            <TableBody>
              {order.plots.map((p) => {
                const x = sh[p];
                return (
                  <TableRow key={p}>
                    <TableCell className="text-accent font-mono text-xs font-bold">
                      {shortPlot(p)}
                    </TableCell>
                    <TableCell className="text-right font-mono whitespace-nowrap">
                      {rupees(x.value)}
                    </TableCell>
                    <TableCell className="text-right font-mono whitespace-nowrap">
                      {x.deduction ? rupees(x.deduction) : "—"}
                    </TableCell>
                    <TableCell className="text-right font-mono whitespace-nowrap">
                      {rupees(x.paid)}
                    </TableCell>
                    <TableCell
                      className={cn(
                        "text-right font-mono whitespace-nowrap",
                        x.balance < -0.5 && "text-danger",
                      )}
                    >
                      {Math.abs(x.balance) < 0.5 ? "—" : rupees(x.balance)}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        ) : null}
      </Card>

      <PaymentForm
        key={draft.id ?? "new"}
        order={order}
        pays={pays}
        today={today}
        draft={draft}
        setDraft={setDraft}
        focusAmount={focusPay}
      />

      <Section
        title="Payments"
        aside={
          <span className="text-muted text-xs tabular-nums">
            {pays.length} · {rupees(f.paid)}
          </span>
        }
      >
        {pays.length ? (
          <div className="space-y-2">
            {pays
              .slice()
              .reverse()
              .map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => edit(p)}
                  className={cn(
                    "bg-background focus-visible:ring-accent/25 grid w-full grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1.5 rounded-xl border p-3 text-left focus-visible:ring-4 focus-visible:outline-none",
                    draft.id === p.id
                      ? "border-accent"
                      : "border-border hover:border-foreground/20",
                  )}
                >
                  <span className="text-base font-semibold tabular-nums">{rupees(p.amount)}</span>
                  <span className="self-center text-right font-mono text-xs">
                    {p.paidOn ? (
                      formatDate(p.paidOn)
                    ) : (
                      <HealthPill label="No date" tone="warning" />
                    )}
                  </span>
                  <span className="text-muted col-span-2 flex flex-wrap items-center gap-1.5 text-xs">
                    <Pill>{p.kind}</Pill>
                    <Pill tone={p.paidBy === "Client" ? "plain" : "ink"}>{p.paidBy}</Pill>
                    {multi && allocOf(p) ? (
                      <Pill className="font-mono">{allocLabel(p)}</Pill>
                    ) : null}
                    {p.reference ? <span>{p.reference}</span> : null}
                    {p.notes ? <span>{p.notes}</span> : null}
                  </span>
                </button>
              ))}
            <p className="text-muted text-xs">Tap a payment to edit or delete it.</p>
          </div>
        ) : (
          <p className="text-muted text-sm">No payments yet.</p>
        )}
      </Section>

      <OrderDetails order={order} pays={pays} vendors={vendors} plots={plots} today={today} />

      <Section
        title={`Bank details · ${vendor.name}`}
        aside={
          <Link
            href={`/kaadal-billing/vendors/${vendor.id}`}
            className="text-accent text-sm font-medium hover:underline"
          >
            Edit vendor
          </Link>
        }
      >
        <BankBlock bank={vendor.bank} />
      </Section>

      <div className="flex justify-end">
        <ConfirmDialog
          trigger={<Button variant="danger">Delete order</Button>}
          title="Delete this order?"
          description={`${vendor.name}'s order and its ${pays.length} payment${pays.length === 1 ? "" : "s"} will be deleted. You can undo it for a few seconds afterwards.`}
          confirmLabel={`Delete order and ${pays.length} payment${pays.length === 1 ? "" : "s"}`}
          pendingLabel="Deleting…"
          onConfirm={async () => {
            const result = await deleteOrder(order.id);
            if (result?.error) return result;
            router.push("/kaadal-billing/orders");
            show(`Deleted ${vendor.name} order`, async () => {
              const back = await restoreOrder(order, pays);
              if (back?.error) show(back.error);
              else router.push(`/kaadal-billing/orders/${order.id}`);
            });
            return undefined;
          }}
        />
      </div>
    </div>
  );
}
