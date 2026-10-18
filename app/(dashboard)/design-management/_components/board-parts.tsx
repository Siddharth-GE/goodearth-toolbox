import { Avatar } from "@/components/ui/avatar";
import { chipClassName } from "@/components/ui/choice-chips";
import { EmptyState } from "@/components/ui/empty-state";
import { Figure } from "@/components/ui/figure";
import type { DesignAction, Person } from "@/lib/design-management/board-queries";
import { formatCount } from "@/lib/format";
import {
  BUCKET_ORDER,
  actionBucket,
  greetingFor,
  type ActionBucket,
  type Load,
} from "@/lib/next-steps/rules";
import { cn } from "@/lib/utils";
import { CheckCircle2, Flag } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { ActionCard } from "./action-card";

/** Every filter is a link, so a screen is a bookmarkable URL and works before any script loads. */

export function SectionHead({
  title,
  count,
  hint,
  tone,
}: {
  title: string;
  count?: number;
  hint?: string;
  tone?: "danger" | "info" | "muted";
}) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5 px-0.5 pt-4 pb-1">
      <h3
        className={cn(
          "text-[15px] font-semibold tracking-tight",
          tone === "danger" && "text-danger",
          tone === "info" && "text-info",
          tone === "muted" && "text-muted",
          !tone && "text-foreground",
        )}
      >
        {title}
      </h3>
      {count !== undefined ? (
        <span className="text-muted text-xs font-semibold tabular-nums">{count}</span>
      ) : null}
      {hint ? (
        <span className="text-muted ml-auto text-xs max-sm:ml-0 max-sm:w-full">{hint}</span>
      ) : null}
    </div>
  );
}

const SECTIONS: Record<
  ActionBucket,
  { title: string; tone?: "danger" | "info" | "muted"; hint?: string }
> = {
  confirm: {
    title: "Waiting to confirm",
    tone: "info",
    hint: "Finished by their owner. Tick to close, or send back with •••",
  },
  management: { title: "Needs management", tone: "danger", hint: "Only a manager can clear these" },
  overdue: {
    title: "Overdue",
    tone: "danger",
    hint: "Clear it, or tap the date and set a real one",
  },
  week: { title: "Next 7 days", tone: "info" },
  later: { title: "Later" },
  done: { title: "Done", tone: "muted", hint: "The latest, newest first" },
};

export function ActionSections({
  actions,
  today,
  hideWhenDone,
  showVilla = true,
  empty,
}: {
  actions: DesignAction[];
  today: string;
  hideWhenDone: boolean;
  showVilla?: boolean;
  empty: { title: string; description: string };
}) {
  const groups = new Map<ActionBucket, DesignAction[]>();
  for (const action of actions) {
    const bucket = actionBucket(action, today);
    groups.set(bucket, [...(groups.get(bucket) ?? []), action]);
  }
  const shown = BUCKET_ORDER.filter((bucket) => groups.get(bucket)?.length);
  if (shown.length === 0) {
    return <EmptyState icon={CheckCircle2} title={empty.title} description={empty.description} />;
  }

  return (
    <div className="space-y-1">
      {shown.map((bucket) => {
        const list = groups.get(bucket)!;
        const section = SECTIONS[bucket];
        return (
          <section key={bucket} className="space-y-2">
            <SectionHead
              title={section.title}
              count={list.length}
              hint={section.hint}
              tone={section.tone}
            />
            {list.map((action) => (
              <ActionCard
                key={action.id}
                action={action}
                showVilla={showVilla}
                hideWhenDone={hideWhenDone}
              />
            ))}
          </section>
        );
      })}
    </div>
  );
}

export function FilterChips({
  label,
  items,
}: {
  label: string;
  items: { label: ReactNode; href: string; on: boolean; key: string }[];
}) {
  return (
    <nav aria-label={label} className="flex flex-wrap gap-1.5">
      {items.map((item) => (
        <Link
          key={item.key}
          href={item.href}
          aria-current={item.on ? "true" : undefined}
          className={chipClassName(item.on)}
          scroll={false}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}

function LoadBar({ load }: { load: Load }) {
  const total = Math.max(load.open, 1);
  const parts = [
    { value: load.overdue, className: "bg-danger" },
    { value: load.management, className: "bg-foreground" },
    { value: load.week, className: "bg-info" },
    { value: load.later, className: "bg-foreground/20" },
  ].filter((part) => part.value > 0);
  return (
    <div
      aria-hidden="true"
      className="bg-foreground/[0.06] flex h-2 gap-0.5 overflow-hidden rounded-full"
    >
      {parts.map((part, index) => (
        <span
          key={index}
          className={cn("h-full", part.className)}
          style={{ width: `${(part.value / total) * 100}%` }}
        />
      ))}
    </div>
  );
}

function Legend({ load }: { load: Load }) {
  const items = [
    { label: "overdue", value: load.overdue, dot: "bg-danger" },
    { label: "this week", value: load.week, dot: "bg-info" },
    { label: "later", value: load.later, dot: "bg-foreground/20" },
  ];
  return (
    <p className="text-muted flex flex-wrap gap-x-3 gap-y-0.5 text-xs tabular-nums">
      {items.map((item) => (
        <span key={item.label} className="inline-flex items-center gap-1.5">
          <span aria-hidden="true" className={cn("size-1.5 rounded-full", item.dot)} />
          <b className="text-foreground/80 font-semibold">{item.value}</b> {item.label}
        </span>
      ))}
      {load.management ? (
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden="true" className="bg-foreground size-1.5 rounded-full" />
          <b className="text-foreground/80 font-semibold">{load.management}</b> waiting on
          management
        </span>
      ) : null}
    </p>
  );
}

export function TeamStrip({
  loads,
  management,
  who,
  hrefFor,
}: {
  loads: { person: Person; load: Load }[];
  management: number;
  who: string;
  hrefFor: (who: string) => string;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <Link
        href={hrefFor(who === "mgmt" ? "all" : "mgmt")}
        aria-current={who === "mgmt" ? "true" : undefined}
        className={cn(
          "bg-foreground text-background border-foreground focus-visible:ring-accent/25 flex flex-col gap-3 rounded-2xl border p-4 focus-visible:ring-4 focus-visible:outline-none",
          who === "mgmt" && "ring-accent ring-offset-background ring-2 ring-offset-2",
        )}
      >
        <div className="flex items-center gap-3">
          <span
            className={cn(
              "grid size-10 shrink-0 place-items-center rounded-full",
              management ? "bg-danger text-danger-foreground" : "bg-background/15",
            )}
          >
            <Flag className="size-5" />
          </span>
          <div className="min-w-0">
            <p className="text-[17px] leading-tight font-semibold tracking-tight">Needs you</p>
            <p className="text-xs opacity-70">waiting on management</p>
          </div>
          <span className="ml-auto text-3xl font-semibold tracking-tight tabular-nums">
            {formatCount(management)}
          </span>
        </div>
        <p className="text-xs opacity-75">
          {management
            ? "Tap to see what the team is stuck on."
            : "Nothing waiting. The team flags an action here when only a manager can clear it."}
        </p>
      </Link>

      {loads.map(({ person, load }) => {
        const on = who === person.id;
        return (
          <Link
            key={person.id}
            href={hrefFor(on ? "all" : person.id)}
            aria-current={on ? "true" : undefined}
            className={cn(
              "border-border bg-surface hover:border-foreground/20 focus-visible:ring-accent/25 flex min-w-0 flex-col gap-3 rounded-2xl border p-4 focus-visible:ring-4 focus-visible:outline-none",
              on && "border-foreground ring-foreground ring-1",
            )}
          >
            <div className="flex items-center gap-3">
              <Avatar name={person.name} size={40} letters={2} />
              <div className="min-w-0">
                <p className="truncate text-[17px] leading-tight font-semibold tracking-tight">
                  {person.name.split(" ")[0]}
                </p>
                <p className="text-muted text-xs">{formatCount(load.open)} open</p>
              </div>
              <span
                title="overdue"
                className={cn(
                  "ml-auto text-3xl font-semibold tracking-tight tabular-nums",
                  load.overdue ? "text-danger" : "text-muted",
                )}
              >
                {formatCount(load.overdue)}
              </span>
            </div>
            <LoadBar load={load} />
            <Legend load={load} />
          </Link>
        );
      })}
    </div>
  );
}

export function Greeting({
  name,
  hour,
  load,
  toConfirm = 0,
}: {
  name: string;
  hour: number;
  load: Load;
  toConfirm?: number;
}) {
  const overdue = load.overdue;
  const first = name.split(" ")[0];
  return (
    <div className="border-border bg-surface flex flex-wrap items-end justify-between gap-5 rounded-2xl border p-5 md:p-6">
      <div className="min-w-0">
        <h2 className="font-display text-3xl font-medium text-balance">
          {greetingFor(hour)}
          {first ? `, ${first}` : ""}.
        </h2>
        <p className="text-muted mt-1 text-sm">
          {overdue
            ? `Start with the ${overdue} overdue item${overdue === 1 ? "" : "s"}. Clear each one, or set a real date.`
            : "Nothing overdue. Keep the dates honest and it stays that way."}
          {toConfirm
            ? ` ${toConfirm} finished action${toConfirm === 1 ? " waits" : "s wait"} for you to confirm.`
            : ""}
        </p>
      </div>
      <div className="flex gap-7">
        <Figure
          label="Overdue"
          value={formatCount(overdue)}
          tone={overdue ? "bad" : undefined}
          size="hero"
        />
        <Figure label="This week" value={formatCount(load.week)} size="hero" />
        <Figure label="Later" value={formatCount(load.later)} size="hero" />
      </div>
    </div>
  );
}
