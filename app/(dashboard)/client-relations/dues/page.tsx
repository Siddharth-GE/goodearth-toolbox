import { unpricedNote } from "@/lib/client-relations/dues";
import { EmptyState } from "@/components/ui/empty-state";
import { Figure, FigureBand, FigureBandCell } from "@/components/ui/figure";
import { ListToolbar } from "@/components/ui/list-toolbar";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/components/ui/table";
import { addDays, dueLabel } from "@/lib/client-relations/next-steps";
import { getFilterOptions, listDues, type DueLine } from "@/lib/client-relations/queries";
import { milestoneLabel } from "@/lib/client-relations/stages";
import { formatCount, formatDate, formatMoney, todayInIndia } from "@/lib/format";
import { PiggyBank } from "lucide-react";
import Link from "next/link";

import { SectionHead } from "../_components/board-parts";
import { Pill, PlotChip } from "../_components/pill";

/** Amounts stay in a monospaced table: a column of money reads as one (DESIGN.md). */

type Group = "overdue" | "week" | "later" | "undated";

const GROUPS: { key: Group; title: string; tone?: "danger" | "info" | "muted"; hint?: string }[] = [
  {
    key: "overdue",
    title: "Overdue",
    tone: "danger",
    hint: "Past the due date with money still to come",
  },
  { key: "week", title: "Due in the next 7 days", tone: "info" },
  { key: "later", title: "Later" },
  {
    key: "undated",
    title: "No due date yet",
    tone: "muted",
    hint: "Give the instalment a date on the plot's schedule",
  },
];

function groupOf(line: DueLine, today: string): Group {
  if (line.isOverdue) return "overdue";
  if (!line.dueOn) return "undated";
  return line.dueOn <= addDays(today, 7) ? "week" : "later";
}

export default async function DuesPage({
  searchParams,
}: {
  searchParams: Promise<{ project?: string; overdue?: string }>;
}) {
  const { project, overdue } = await searchParams;
  const overdueOnly = overdue === "1";
  const today = todayInIndia();

  const [board, options] = await Promise.all([
    listDues({ project, overdueOnly }),
    getFilterOptions(),
  ]);

  const groups = GROUPS.map((group) => ({
    ...group,
    lines: board.lines.filter((line) => groupOf(line, today) === group.key),
  })).filter((group) => group.lines.length > 0);

  return (
    <div className="space-y-4">
      <FigureBand>
        <FigureBandCell>
          <Figure
            label="Scheduled"
            value={formatMoney(board.totals.scheduled)}
            hint={unpricedNote(board.totals.unpricedCount)}
            size="sm"
          />
        </FigureBandCell>
        <FigureBandCell>
          <Figure label="Invoiced" value={formatMoney(board.totals.invoiced)} size="sm" />
        </FigureBandCell>
        <FigureBandCell>
          <Figure
            label="Received"
            value={formatMoney(board.totals.received)}
            tone="good"
            size="sm"
          />
        </FigureBandCell>
        <FigureBandCell>
          <Figure
            label="Outstanding"
            value={formatMoney(board.totals.outstanding)}
            hint={`${formatCount(board.plotsOwing)} plots`}
            size="sm"
          />
        </FigureBandCell>
        <FigureBandCell>
          <Figure
            label="Overdue"
            value={formatMoney(board.totals.overdue)}
            hint={`${formatCount(board.totals.overdueCount)} instalments`}
            tone={board.totals.overdue > 0 ? "bad" : undefined}
            size="sm"
          />
        </FigureBandCell>
      </FigureBand>

      <ListToolbar
        action="/client-relations/dues"
        values={{ project, overdue }}
        filters={[
          {
            param: "project",
            label: "Project",
            allLabel: "All projects",
            options: options.projects.map((one) => ({ value: one.id, label: one.name })),
          },
          {
            param: "overdue",
            label: "Show",
            allLabel: "Everything outstanding",
            options: [{ value: "1", label: "Overdue only" }],
          },
        ]}
      />

      {groups.length === 0 ? (
        <EmptyState
          icon={PiggyBank}
          title={overdueOnly ? "Nothing is overdue" : "Nothing is outstanding"}
          description={
            board.totals.scheduled === 0
              ? "Set the amounts on a plot's payment schedule and they will show up here."
              : "Every instalment that has been scheduled has been received."
          }
        />
      ) : (
        groups.map((group) => (
          <section key={group.key} className="space-y-2">
            <SectionHead
              title={group.title}
              count={group.lines.length}
              hint={group.hint}
              tone={group.tone}
            />
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeaderCell className="min-w-[220px]">Plot</TableHeaderCell>
                  <TableHeaderCell>Instalment</TableHeaderCell>
                  <TableHeaderCell>Due</TableHeaderCell>
                  <TableHeaderCell>Invoiced</TableHeaderCell>
                  <TableHeaderCell className="text-right">Amount</TableHeaderCell>
                  <TableHeaderCell className="text-right">Outstanding</TableHeaderCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {group.lines.map((line) => {
                  const due = line.dueOn
                    ? dueLabel({ status: "open", dueOn: line.dueOn }, today)
                    : null;
                  return (
                    <TableRow key={`${line.engagementId}-${line.stage}`}>
                      <TableCell>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <PlotChip
                            number={line.plotNumber}
                            href={`/client-relations/plots/${line.engagementId}`}
                          />
                          {line.clientId ? (
                            <Link
                              href={`/client-relations/${line.clientId}`}
                              className="text-foreground text-sm hover:underline"
                            >
                              {line.clientName}
                            </Link>
                          ) : (
                            <span className="text-muted text-sm">No buyer</span>
                          )}
                        </div>
                        <span className="text-muted mt-0.5 block text-xs">{line.projectName}</span>
                      </TableCell>
                      <TableCell>{milestoneLabel(line.stage)}</TableCell>
                      <TableCell className="whitespace-nowrap">
                        {due ? (
                          <Pill
                            tone={
                              line.isOverdue ? "danger" : due.tone === "info" ? "info" : "plain"
                            }
                          >
                            {line.isOverdue ? due.text : formatDate(line.dueOn)}
                          </Pill>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-muted whitespace-nowrap">
                        {formatDate(line.invoicedOn)}
                      </TableCell>
                      <TableCell className="text-muted text-right font-mono text-xs">
                        {formatMoney(line.dueAmount)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs">
                        <span className={line.isOverdue ? "text-danger font-semibold" : undefined}>
                          {formatMoney(line.outstanding)}
                        </span>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </section>
        ))
      )}
    </div>
  );
}
