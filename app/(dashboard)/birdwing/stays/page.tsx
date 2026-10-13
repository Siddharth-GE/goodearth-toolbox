import { LinkButton } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ListToolbar } from "@/components/ui/list-toolbar";
import { Pagination } from "@/components/ui/pagination";
import { NavTabs } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/components/ui/table";
import { isSettled } from "@/lib/birdwing/money";
import {
  STAYS_PAGE_SIZE,
  STAY_TABS,
  listStays,
  type StayListRow,
  type StayTab,
} from "@/lib/birdwing/queries";
import { CHANNELS, CHANNEL_LABELS, STAY_USES, USE_LABELS, oneOf } from "@/lib/birdwing/shared";
import { formatDate, formatMoney } from "@/lib/format";
import { searchParam } from "@/lib/list-params";
import { BedDouble } from "lucide-react";
import Link from "next/link";
import { StayStatusBadge, UseBadge } from "../_components/stay-badges";

const TAB_LABELS: Record<StayTab, string> = {
  upcoming: "Upcoming",
  "in-house": "In the house",
  past: "Past",
  cancelled: "Cancelled",
};

export default async function StaysPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const tab = oneOf(STAY_TABS, params.tab) ?? "upcoming";
  const use = oneOf(STAY_USES, params.use) ?? undefined;
  const channel = oneOf(CHANNELS, params.channel) ?? undefined;
  const month = params.month && /^\d{4}-\d{2}$/.test(params.month) ? params.month : undefined;
  const q = searchParam(params.q);
  const page = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);

  const { rows, total } = await listStays({ tab, use, channel, month, q, page });
  const pageCount = Math.max(1, Math.ceil(total / STAYS_PAGE_SIZE));

  const hrefFor = (target: number) => {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries({ tab, use, channel, month, q })) {
      if (value) query.set(key, value);
    }
    if (target > 1) query.set("page", String(target));
    return `/birdwing/stays?${query.toString()}`;
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <NavTabs
          active={tab}
          tabs={STAY_TABS.map((key) => ({
            key,
            href: `/birdwing/stays?tab=${key}`,
            label: TAB_LABELS[key],
          }))}
        />
        <LinkButton href="/birdwing/stays/new">New stay</LinkButton>
      </div>

      <ListToolbar
        action="/birdwing/stays"
        keep={{ tab }}
        values={{ q, use, channel, month }}
        search={{ placeholder: "Guest, phone or BW- number" }}
        filters={[
          {
            param: "use",
            label: "Who for",
            allLabel: "Everyone",
            options: STAY_USES.map((value) => ({ value, label: USE_LABELS[value] })),
          },
          {
            param: "channel",
            label: "Booked through",
            allLabel: "Any channel",
            options: CHANNELS.map((value) => ({ value, label: CHANNEL_LABELS[value] })),
          },
          {
            param: "month",
            label: "Month",
            allLabel: "Any month",
            options: recentMonths(),
          },
        ]}
      />

      {rows.length === 0 ? (
        <EmptyState
          icon={BedDouble}
          title={
            q || use || channel || month
              ? "No stays match"
              : `No ${TAB_LABELS[tab].toLowerCase()} stays`
          }
          description={
            tab === "upcoming" ? "Book one from the calendar, or with New stay." : undefined
          }
        />
      ) : (
        <>
          <Table>
            <TableHead>
              <tr>
                <TableHeaderCell>Stay</TableHeaderCell>
                <TableHeaderCell>Dates</TableHeaderCell>
                <TableHeaderCell className="hidden md:table-cell">Rooms</TableHeaderCell>
                <TableHeaderCell className="text-right">Billed</TableHeaderCell>
                <TableHeaderCell className="text-right">Pending</TableHeaderCell>
              </tr>
            </TableHead>
            <TableBody>
              {rows.map((row) => (
                <StayRow key={row.id} row={row} />
              ))}
            </TableBody>
          </Table>
          <Pagination
            page={page}
            pageCount={pageCount}
            total={total}
            pageSize={STAYS_PAGE_SIZE}
            unit="stays"
            prevHref={page > 1 ? hrefFor(page - 1) : null}
            nextHref={page < pageCount ? hrefFor(page + 1) : null}
          />
        </>
      )}
    </div>
  );
}

function StayRow({ row }: { row: StayListRow }) {
  const pending = row.money.pending;
  return (
    <TableRow>
      <TableCell>
        <Link
          href={`/birdwing/stays/${row.id}`}
          className="text-foreground hover:text-accent font-medium"
        >
          {row.isBlock ? "Room block" : (row.guestName ?? "—")}
        </Link>
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          <span className="text-muted font-mono text-xs">{row.ref}</span>
          <StayStatusBadge status={row.status} />
          <UseBadge use={row.use} />
          {row.flagged && <span className="text-warning text-xs font-medium">To review</span>}
        </div>
      </TableCell>
      <TableCell className="whitespace-nowrap">
        {formatDate(row.arrival)}
        <div className="text-muted text-xs">
          {row.nights === 0 ? "Day visit" : `${row.nights} night${row.nights === 1 ? "" : "s"}`}
          {row.guests > 0 ? ` · ${row.guests} guest${row.guests === 1 ? "" : "s"}` : ""}
        </div>
      </TableCell>
      <TableCell className="text-muted hidden md:table-cell">
        {row.roomCodes.length ? row.roomCodes.join(", ") : "—"}
      </TableCell>
      <TableCell className="text-right font-mono whitespace-nowrap">
        {row.isBlock ? "—" : formatMoney(row.money.billed)}
        {row.invoiceNumber && (
          <div className="text-muted font-sans text-xs">{row.invoiceNumber}</div>
        )}
      </TableCell>
      <TableCell className="text-right font-mono whitespace-nowrap">
        {row.isBlock ? (
          "—"
        ) : isSettled(pending) ? (
          <span className="text-success font-sans text-xs font-medium">Settled</span>
        ) : (
          <span className={pending > 0 ? "text-warning" : "text-foreground"}>
            {formatMoney(pending)}
          </span>
        )}
      </TableCell>
    </TableRow>
  );
}

/** The last eighteen months and the next six, newest first. */
function recentMonths(): { value: string; label: string }[] {
  const now = new Date();
  const months: { value: string; label: string }[] = [];
  for (let offset = 6; offset >= -18; offset -= 1) {
    const at = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, 1));
    months.push({
      value: at.toISOString().slice(0, 7),
      label: at.toLocaleDateString("en-IN", { month: "short", year: "numeric", timeZone: "UTC" }),
    });
  }
  return months;
}
