import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { PageTitle } from "@/components/ui/page-title";
import { Section } from "@/components/ui/section";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/components/ui/table";
import { formatDate, formatQuantity } from "@/lib/format";
import { listBrands } from "@/lib/masters/brands";
import { listItemCategories } from "@/lib/masters/item-categories";
import {
  getVillaDetail,
  listContractors,
  listWorkOptions,
  type IssueRequestRow,
} from "@/lib/supervisors/queries";
import { notFound } from "next/navigation";
import { DeleteLabourLogButton, LabourLogDialog } from "./_components/labour-forms";
import { RequestIssueDialog, WithdrawRequestButton } from "./_components/request-forms";

// One villa, one page — the supervisor's whole day lives here: log
// labour, request material, and see what every work has drawn against
// the official estimate. Phone-first: stacked cards, tappable dialogs,
// tables that scroll inside their own cards.
export default async function VillaPage({ params }: { params: Promise<{ plotId: string }> }) {
  const { plotId } = await params;
  const [villa, contractors, works, categories, brands] = await Promise.all([
    getVillaDetail(plotId),
    listContractors(),
    listWorkOptions(),
    listItemCategories(),
    listBrands(),
  ]);
  if (!villa) notFound();

  const pickerCategories = categories.map(({ id, name }) => ({ id, name }));
  const pickerBrands = brands.map(({ id, name }) => ({ id, name }));
  const openRequests = villa.requests.filter((request) => request.status === "requested");
  const answered = villa.requests.filter((request) => request.status !== "requested");

  return (
    <div className="space-y-4">
      <PageTitle
        title={villa.villaName}
        description={`Plot ${villa.plotName} · ${villa.projectName}`}
        backHref="/supervisors/villas"
        backLabel="Villas"
        actions={
          <div className="flex flex-wrap gap-2">
            <LabourLogDialog plotId={plotId} works={works} contractors={contractors} />
            <RequestIssueDialog
              plotId={plotId}
              works={works}
              quickPicks={villa.quickPicks}
              categories={pickerCategories}
              brands={pickerBrands}
            />
          </div>
        }
      />

      {villa.estimate ? (
        <p className="text-muted text-sm">
          Official estimate{" "}
          <span className="text-foreground font-medium">{villa.estimate.reference}</span>, submitted{" "}
          {formatDate(villa.estimate.submittedAt)} — materials below are checked against it.
        </p>
      ) : (
        <p className="text-muted text-sm">
          No official estimate for this villa yet — materials show what was drawn, with nothing to
          check against. The Estimator submits one.
        </p>
      )}

      <Section
        title="Labour"
        note={
          villa.labourLogs.length
            ? `Showing ${villa.labourLogs.length} of ${villa.labourTotal} entries, newest first.`
            : undefined
        }
      >
        {villa.labourLogs.length === 0 ? (
          <p className="text-muted text-sm">
            Nothing logged yet — Log labour records the first day.
          </p>
        ) : (
          <ul className="divide-border divide-y">
            {villa.labourLogs.map((log) => (
              <li key={log.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                <div>
                  <p className="text-foreground text-sm font-medium">
                    {formatDate(log.logDate)} · {log.contractorName}
                  </p>
                  <p className="text-muted text-xs">
                    {log.workLabel} — {countLine(log.masons, log.helpers, log.others)}
                    {log.note ? ` · ${log.note}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <LabourLogDialog
                    plotId={plotId}
                    works={works}
                    contractors={contractors}
                    log={log}
                    trigger={
                      <button className="text-accent text-sm font-medium" type="button">
                        Edit
                      </button>
                    }
                  />
                  <DeleteLabourLogButton logId={log.id} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section
        title="Requests"
        note={openRequests.length ? `${openRequests.length} waiting at the store.` : undefined}
      >
        {villa.requests.length === 0 ? (
          <p className="text-muted text-sm">
            No requests yet — Request material sends the first one to the store-keeper.
          </p>
        ) : (
          <ul className="divide-border divide-y">
            {[...openRequests, ...answered].map((request) => (
              <li
                key={request.id}
                className="flex flex-wrap items-center justify-between gap-2 py-2.5"
              >
                <div>
                  <p className="text-foreground text-sm font-medium">
                    {formatQuantity(request.quantity)} {request.itemUom} · {request.itemName}
                  </p>
                  <p className="text-muted text-xs">
                    {request.workLabel} · asked {formatDate(request.createdAt)}
                    {request.status === "declined" && request.declinedReason
                      ? ` · ${request.declinedReason}`
                      : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <RequestBadge status={request.status} />
                  {request.status === "requested" && (
                    <WithdrawRequestButton requestId={request.id} />
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <div className="space-y-3">
        <h2 className="text-foreground text-base font-semibold">Materials, work by work</h2>
        {villa.workGroups.length === 0 && villa.untagged.length === 0 ? (
          <Card className="p-5">
            <p className="text-muted text-sm">
              Nothing has reached this plot yet — store issues and site deliveries will appear here
              under the work they were for.
            </p>
          </Card>
        ) : (
          villa.workGroups.map((group) => (
            <Section
              key={group.workItemId}
              title={group.workLabel}
              note={group.categoryName}
              collapsible
              defaultOpen={group.rows.some((row) => row.over) || group.unplanned.length > 0}
            >
              <div className="overflow-x-auto">
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableHeaderCell>Material</TableHeaderCell>
                      <TableHeaderCell className="text-right">Estimate</TableHeaderCell>
                      <TableHeaderCell className="text-right">Drawn</TableHeaderCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {group.rows.map((row) => (
                      <TableRow key={`${row.workItemId}-${row.materialName}`}>
                        <TableCell>{row.materialName}</TableCell>
                        <TableCell className="text-right">
                          {formatQuantity(row.estimated)} {row.uom}
                        </TableCell>
                        <TableCell
                          className={`text-right ${row.over ? "text-danger font-medium" : ""}`}
                        >
                          {row.issued !== null
                            ? `${formatQuantity(row.issued)} ${row.uom}`
                            : row.issuedRaw
                              ? `${formatQuantity(row.issuedRaw.quantity)} ${row.issuedRaw.uom} (units differ)`
                              : "—"}
                          {row.over ? " · over" : ""}
                        </TableCell>
                      </TableRow>
                    ))}
                    {group.unplanned.map((entry) => (
                      <TableRow key={`extra-${entry.itemName}`}>
                        <TableCell>
                          {entry.itemName}{" "}
                          <Badge variant="warning" className="ml-1">
                            Outside the estimate
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">—</TableCell>
                        <TableCell className="text-right">
                          {formatQuantity(entry.quantity)} {entry.uom}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </Section>
          ))
        )}

        {villa.untagged.length > 0 && (
          <Section
            title="No work recorded"
            note="Older movements made before issues named their work."
            collapsible
            defaultOpen={false}
          >
            <ul className="divide-border divide-y">
              {villa.untagged.map((entry) => (
                <li key={entry.itemName} className="flex justify-between py-2 text-sm">
                  <span>{entry.itemName}</span>
                  <span className="text-muted">
                    {formatQuantity(entry.quantity)} {entry.uom}
                  </span>
                </li>
              ))}
            </ul>
          </Section>
        )}
      </div>
    </div>
  );
}

function countLine(masons: number, helpers: number, others: number): string {
  const parts: string[] = [];
  if (masons) parts.push(`${masons} mason${masons === 1 ? "" : "s"}`);
  if (helpers) parts.push(`${helpers} helper${helpers === 1 ? "" : "s"}`);
  if (others) parts.push(`${others} other${others === 1 ? "" : "s"}`);
  return parts.join(" · ");
}

function RequestBadge({ status }: { status: IssueRequestRow["status"] }) {
  if (status === "fulfilled") return <Badge variant="success">Issued</Badge>;
  if (status === "declined") return <Badge variant="danger">Declined</Badge>;
  return <Badge variant="info">Waiting</Badge>;
}
