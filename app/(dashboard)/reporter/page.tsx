import Link from "next/link";
import { FileChartColumn, Sparkles } from "lucide-react";

import { Attribution } from "@/components/ui/attribution";
import { Badge } from "@/components/ui/badge";
import { LinkButton } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageTitle } from "@/components/ui/page-title";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/components/ui/table";
import { formatDate } from "@/lib/format";
import { listReports } from "@/lib/reporter/queries";
import { STARTERS } from "@/lib/reporter/starters";

/**
 * The way in: the starting points, then everything the team has saved.
 *
 * Starters are code constants, not rows — they cannot be edited or
 * deleted, only copied. A saved report is a question, not a snapshot:
 * opening one re-runs it against live data through the opener's own
 * access.
 */
export default async function ReporterPage() {
  const reports = await listReports();

  return (
    <div className="space-y-8">
      <PageTitle
        title="Reporter"
        description="Build a report over any data — pick columns, filter, group, and total. Save the ones worth keeping."
        actions={<LinkButton href="/reporter/new">New report</LinkButton>}
      />

      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <Sparkles className="text-muted size-4" />
          <h2 className="text-foreground text-sm font-semibold">Starting points</h2>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {STARTERS.map((starter) => (
            <Link
              key={starter.id}
              href={`/reporter/${starter.id}`}
              className="focus-visible:ring-accent focus-visible:ring-offset-background rounded-2xl focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
            >
              <Card className="hover:border-accent h-full p-4 transition-colors">
                <p className="text-foreground text-sm font-medium">{starter.name}</p>
                <p className="text-muted mt-1 text-xs">{starter.description}</p>
              </Card>
            </Link>
          ))}
        </div>
        <p className="text-muted text-xs">
          More starting points arrive with the data behind them — spend against budget, sales and
          collections, stock, and design progress.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-foreground text-sm font-semibold">Saved reports</h2>
        {reports.length === 0 ? (
          <EmptyState
            icon={FileChartColumn}
            title="Nothing saved yet"
            description="Open a starting point or build a report from scratch, then save it by name. A saved report keeps the question, not the numbers — everyone who opens it sees figures from their own access."
            action={
              <LinkButton href="/reporter/new" variant="secondary">
                Start a report
              </LinkButton>
            }
          />
        ) : (
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>Report</TableHeaderCell>
                <TableHeaderCell>Data set</TableHeaderCell>
                <TableHeaderCell>Last saved</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {reports.map((report) => (
                <TableRow key={report.id}>
                  <TableCell>
                    <Link
                      href={`/reporter/${report.id}`}
                      className="text-foreground hover:text-accent font-medium"
                    >
                      {report.name}
                    </Link>
                    {report.description && (
                      <div className="text-muted text-xs">{report.description}</div>
                    )}
                  </TableCell>
                  <TableCell className="text-muted">
                    {report.datasetExists ? (
                      report.datasetLabel
                    ) : (
                      // The report still opens — the parser drops what it
                      // cannot resolve and says so — but the list should
                      // not pretend the data set is still there.
                      <Badge variant="warning">No longer available</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-muted">
                    <div className="flex items-center gap-2">
                      <span>{formatDate(report.updated_at)}</span>
                      <Attribution name={report.updated_by_name} label="Last saved by" />
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>
    </div>
  );
}
