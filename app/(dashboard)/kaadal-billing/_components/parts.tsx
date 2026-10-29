import { LinkButton } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { chipClassName } from "@/components/ui/choice-chips";
import { Figure, FigureBand, FigureBandCell } from "@/components/ui/figure";
import { Heading } from "@/components/ui/heading";
import { Pill } from "@/components/ui/pill";
import { formatCrore, formatMoney, formatShortDate } from "@/lib/format";
import {
  rupees,
  shortPlot,
  type Order,
  type OrderView,
  type Totals,
} from "@/lib/kaadal-billing/ledger";
import { cn } from "@/lib/utils";
import { ArrowLeft, Minus, Plus, QrCode } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

/** Kaadal's part in burgundy, the client's in a lighter burgundy beside it; green once settled. */
export function PaidBar({
  kaadal,
  client,
  total,
  done = false,
  className,
}: {
  kaadal: number;
  client: number;
  total: number;
  done?: boolean;
  className?: string;
}) {
  const k = total > 0 ? Math.min(100, (kaadal / total) * 100) : 0;
  const c = total > 0 ? Math.max(0, Math.min(100 - k, (client / total) * 100)) : 0;
  return (
    <div
      role="img"
      aria-label={`${Math.round(k + c)}% paid`}
      className={cn("bg-foreground/[0.07] flex h-1.5 overflow-hidden rounded-full", className)}
    >
      <span
        className={cn("h-full", done ? "bg-success" : "bg-accent")}
        style={{ width: `${k}%` }}
      />
      <span
        className={cn("h-full", done ? "bg-success" : "bg-accent/40")}
        style={{ width: `${c}%` }}
      />
    </div>
  );
}

export function PaidLegend({ kaadal, client }: { kaadal: string; client: string }) {
  return (
    <span className="inline-flex flex-wrap gap-x-3 gap-y-0.5">
      <span className="inline-flex items-center gap-1.5">
        <span className="bg-accent size-2 rounded-full" aria-hidden />
        Kaadal <b className="text-foreground font-semibold">{kaadal}</b>
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="bg-accent/40 size-2 rounded-full" aria-hidden />
        Client <b className="text-foreground font-semibold">{client}</b>
      </span>
    </span>
  );
}

/** The band at the top of each tab: what was ordered, paid, and is left, for all plots or one. */
export function TotalsBand({ totals, scope }: { totals: Totals; scope: string }) {
  const pct = totals.net ? Math.min(100, (totals.paid / totals.net) * 100) : 0;
  return (
    <FigureBand>
      <FigureBandCell>
        <Figure
          size="lg"
          label={`Order value · ${scope}`}
          value={formatCrore(totals.net)}
          hint={`${formatMoney(totals.net)} across ${totals.orders} order${totals.orders === 1 ? "" : "s"}`}
        />
      </FigureBandCell>
      <FigureBandCell>
        <Figure
          size="lg"
          label="Paid to vendors"
          value={formatCrore(totals.paid)}
          hint={
            <PaidLegend
              kaadal={formatCrore(totals.byKaadal)}
              client={formatCrore(totals.byClient)}
            />
          }
        />
      </FigureBandCell>
      <FigureBandCell>
        <Figure
          size="lg"
          label="Balance to pay"
          value={formatCrore(totals.balance)}
          tone={totals.balance > 0.5 ? undefined : "good"}
          hint={`${formatMoney(totals.balance)} · ${totals.open} order${totals.open === 1 ? "" : "s"} open`}
        />
      </FigureBandCell>
      <FigureBandCell className="space-y-2">
        <Figure size="lg" label="Paid so far" value={`${pct.toFixed(1)}%`} />
        <PaidBar kaadal={totals.byKaadal} client={totals.byClient} total={totals.net} />
      </FigureBandCell>
    </FigureBand>
  );
}

/** All plots, then each plot an order names, as links that keep the rest of the address. */
export function PlotScope({
  plots,
  current,
  href,
}: {
  plots: string[];
  current: string;
  href: (plot: string) => string;
}) {
  return (
    <nav aria-label="Plot" className="flex flex-wrap gap-1.5">
      {["All", ...plots].map((plot) => (
        <Link
          key={plot}
          href={href(plot)}
          aria-current={current === plot ? "true" : undefined}
          className={cn(
            chipClassName(current === plot),
            plot !== "All" && "font-mono text-xs font-bold",
          )}
        >
          {plot === "All" ? "All plots" : shortPlot(plot)}
        </Link>
      ))}
    </nav>
  );
}

export function PlotPill({ plot }: { plot: string }) {
  return (
    <Pill className="bg-foreground/[0.05] text-foreground border-transparent font-mono font-bold">
      {shortPlot(plot)}
    </Pill>
  );
}

/** One vendor order on the Orders tab: the whole order, or its share of the plot being looked at. */
export function OrderCard({
  order,
  vendorName,
  v,
  plot,
}: {
  order: Order;
  vendorName: string;
  v: OrderView;
  plot: string;
}) {
  const paid = v.state === "paid";
  const last = v.last
    ? `Last paid ${rupees(v.last.amount)} on ${formatShortDate(v.last.paidOn)}`
    : v.count
      ? `${v.count} payment${v.count > 1 ? "s" : ""}, no date`
      : "No payments yet";
  return (
    <Card
      interactive
      className="relative grid gap-x-5 gap-y-3 p-4 sm:grid-cols-[minmax(0,1fr)_auto]"
    >
      <div className="min-w-0">
        <Link
          href={`/kaadal-billing/orders/${order.id}`}
          className="focus-visible:ring-accent/25 rounded-lg text-[17px] leading-tight font-semibold tracking-tight after:absolute after:inset-0 after:rounded-2xl focus-visible:ring-4 focus-visible:outline-none"
        >
          {vendorName}
          {order.item ? (
            <span className="text-muted ml-2 text-sm font-normal">{order.item}</span>
          ) : null}
        </Link>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {order.plots.map((p) => (
            <PlotPill key={p} plot={p} />
          ))}
          {v.byClient > 0 ? <Pill>Client paid {formatCrore(v.byClient)}</Pill> : null}
          {order.deduction ? (
            <Pill tone="warning">
              <Minus className="size-3" aria-hidden />
              Deduction {rupees(order.deduction)}
            </Pill>
          ) : null}
          {order.payNote ? (
            <Pill>
              <QrCode className="size-3" aria-hidden />
              {order.payNote}
            </Pill>
          ) : null}
          {v.over ? <Pill tone="danger">Overpaid {rupees(-v.balance)}</Pill> : null}
          {v.shared && plot !== "All" ? (
            <Pill>Share of a {order.plots.length}-plot order</Pill>
          ) : null}
        </div>
        {order.notes ? <p className="text-muted mt-2 text-xs">{order.notes}</p> : null}
      </div>
      <div className="flex flex-col gap-0.5 sm:items-end sm:text-right">
        <span
          className={cn(
            "text-xl font-semibold tracking-tight whitespace-nowrap tabular-nums",
            paid && "text-success",
          )}
        >
          {paid ? "Paid" : rupees(v.balance)}
        </span>
        <span className="text-muted text-xs whitespace-nowrap tabular-nums">
          {paid ? rupees(v.net) : `due of ${rupees(v.net)}`}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
        <PaidBar
          kaadal={v.byKaadal}
          client={v.byClient}
          total={v.net}
          done={paid}
          className="min-w-40 flex-1"
        />
        <span className="text-muted text-xs tabular-nums">{last}</span>
        {!paid ? (
          <LinkButton
            href={`/kaadal-billing/orders/${order.id}?pay=1`}
            size="sm"
            className="relative z-10"
          >
            <Plus className="size-3.5" aria-hidden />
            Record payment
          </LinkButton>
        ) : null}
      </div>
    </Card>
  );
}

/** An order's, vendor's or plot's own page sits under the tool's title, so it heads itself with a back link and a Heading. */
export function DetailHead({
  back,
  title,
  meta,
  actions,
}: {
  back: { href: string; label: string };
  title: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0 space-y-1">
        <Link
          href={back.href}
          className="text-muted hover:text-foreground inline-flex items-center gap-1 text-xs transition-colors"
        >
          <ArrowLeft className="size-3.5" aria-hidden />
          {back.label}
        </Link>
        <Heading>{title}</Heading>
        {meta ? (
          <div className="text-muted flex flex-wrap items-center gap-1.5 text-sm">{meta}</div>
        ) : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

/** The address of a list with one setting changed, the others kept. */
export function withParams(
  path: string,
  current: Record<string, string | undefined>,
  change: Record<string, string | undefined>,
) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...current, ...change })) if (v) params.set(k, v);
  const q = params.toString();
  return q ? `${path}?${q}` : path;
}
