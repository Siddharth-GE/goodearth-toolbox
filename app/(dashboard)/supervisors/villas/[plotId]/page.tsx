import { WORK_CLASS_LABEL } from "@/lib/masters/work-classes";
import { Badge } from "@/components/ui/badge";
import { LinkButton } from "@/components/ui/button";
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
import { describeLabour } from "@/lib/supervisors/labour";
import {
  getVillaDetail,
  listContractors,
  listWorkOptions,
  type IssueRequestRow,
  type VillaDetail,
} from "@/lib/supervisors/queries";
import { ExternalLink, FileText } from "lucide-react";
import { notFound } from "next/navigation";
import { listChecklistTemplates, listVillaChecklists } from "@/lib/supervisors/checklist-queries";
import Link from "next/link";
import { StartChecklistDialog } from "./_components/checklist-forms";
import { DrawingHistory } from "./_components/drawing-history";
import { DeleteLabourLogButton, LabourLogDialog } from "./_components/labour-forms";
import { RequestIssueDialog, WithdrawRequestButton } from "./_components/request-forms";

// One villa, one page: labour, material requests and drawn-vs-estimate. Phone-first: stacked cards, tables scroll inside their cards.
export default async function VillaPage({ params }: { params: Promise<{ plotId: string }> }) {
  const { plotId } = await params;
  const [villa, contractors, works, categories, brands, checklists, templates] = await Promise.all([
    getVillaDetail(plotId),
    listContractors(),
    listWorkOptions(),
    listItemCategories(),
    listBrands(),
    listVillaChecklists(plotId),
    listChecklistTemplates(),
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
              hasEstimate={villa.estimate !== null}
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

      <div id="drawings" className="scroll-mt-4">
        <Section
          title="Drawings"
          note={
            villa.drawings.length
              ? `${villa.drawings.length} set${villa.drawings.length === 1 ? "" : "s"} released to site.`
              : undefined
          }
        >
          {villa.drawings.length === 0 ? (
            <p className="text-muted text-sm">No drawings have been released for this villa yet.</p>
          ) : (
            <ul className="divide-border divide-y">
              {villa.drawings.map((set) => (
                <li key={set.setId} className="space-y-2 py-3">
                  <div>
                    <p className="text-foreground text-sm font-medium">
                      {set.setCode ? `${set.setCode} · ${set.setName}` : set.setName} · R
                      {set.revision.revisionNo}
                    </p>
                    <p className="text-muted text-xs">
                      Released {formatDate(set.revision.releasedAt)}
                    </p>
                  </div>
                  {/* The drawings are a WorkDrive folder (0124); sheets held when issued are listed by name. */}
                  {set.drawingsUrl && (
                    <div className="space-y-1.5">
                      <LinkButton
                        href={set.drawingsUrl}
                        newTab
                        variant="secondary"
                        className="w-full sm:w-auto"
                      >
                        <ExternalLink className="size-4" aria-hidden />
                        Open drawings
                        {set.folderSheets.length > 0 &&
                          ` · ${set.folderSheets.length} ${set.folderSheets.length === 1 ? "sheet" : "sheets"}`}
                      </LinkButton>
                      {set.folderSheets.length > 0 && (
                        <ol className="text-muted space-y-0.5 text-xs">
                          {set.folderSheets.map((sheet, index) => (
                            <li key={sheet.id} className="break-words">
                              {index + 1}. {sheet.name}
                            </li>
                          ))}
                        </ol>
                      )}
                    </div>
                  )}
                  {set.files.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {set.files.map((file) => (
                        <a
                          key={file.id}
                          href={`/design-management/files/${file.id}`}
                          target="_blank"
                          rel="noreferrer"
                          className="border-border bg-background text-foreground hover:border-accent hover:text-accent inline-flex min-h-11 max-w-full items-center gap-1.5 rounded-xl border px-3 text-sm font-medium break-all"
                        >
                          <FileText className="size-4 shrink-0" aria-hidden />
                          {file.displayName}
                        </a>
                      ))}
                    </div>
                  )}
                  <DrawingHistory
                    history={[
                      {
                        revisionNo: set.revision.revisionNo,
                        note: set.revision.note,
                        releasedAt: set.revision.releasedAt,
                      },
                      ...set.history,
                    ]}
                  />
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>

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
                    {`${log.workLabel} — ${describeLabour(log)}${log.workClass !== "standard" ? ` · ${WORK_CLASS_LABEL[log.workClass]}` : ""}${log.note ? ` · ${log.note}` : ""}`}
                  </p>
                </div>
                {log.billId ? (
                  <Badge variant="neutral">{`Billed · ${log.billReference ?? "on a bill"}`}</Badge>
                ) : (
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
                )}
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
                    {request.workLabel}
                    {request.workClass !== "standard" &&
                      ` · ${WORK_CLASS_LABEL[request.workClass]}`}{" "}
                    · asked {formatDate(request.createdAt)}
                    {request.status === "declined" && request.declinedReason
                      ? ` · ${request.declinedReason}`
                      : ""}
                  </p>
                  {request.offEstimateReason && (
                    <p className="text-muted text-xs">
                      {`Not on the estimate — ${request.offEstimateReason}`}
                    </p>
                  )}
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

      <Section
        title="Checklists"
        note={
          checklists.length
            ? `${checklists.filter((checklist) => checklist.status === "open").length} open, ${checklists.filter((checklist) => checklist.status === "signed_off").length} signed off.`
            : undefined
        }
        aside={
          <StartChecklistDialog
            plotId={plotId}
            templates={templates
              .filter((template) => template.isActive)
              .map((template) => ({
                id: template.id,
                name: template.name,
                itemCount: template.items.filter((item) => item.isActive).length,
              }))
              .filter((template) => template.itemCount > 0)}
          />
        }
      >
        {checklists.length === 0 ? (
          <p className="text-muted text-sm">
            No checklists yet — Start a checklist before an inspection, and tick each check on site.
          </p>
        ) : (
          <ul className="divide-border divide-y">
            {checklists.map((checklist) => (
              <li key={checklist.id}>
                <Link
                  href={`/supervisors/villas/${plotId}/checklists/${checklist.id}`}
                  className="hover:bg-foreground/[0.03] -mx-2 flex min-h-11 flex-wrap items-center justify-between gap-2 rounded-lg px-2 py-2.5"
                >
                  <div>
                    <p className="text-foreground text-sm font-medium">
                      {checklist.templateName}
                      {checklist.location ? ` · ${checklist.location}` : ""}
                    </p>
                    <p className="text-muted text-xs">
                      {checklist.status === "signed_off"
                        ? `Signed off ${formatDate(checklist.signedOffAt)}`
                        : `Started ${formatDate(checklist.startedOn)} · ${checklist.answered} of ${checklist.total} checked`}
                      {checklist.failed > 0 ? ` · ${checklist.failed} failed` : ""}
                    </p>
                  </div>
                  {checklist.status === "signed_off" ? (
                    <Badge variant={checklist.failed > 0 ? "warning" : "success"}>Signed off</Badge>
                  ) : (
                    <Badge variant="info">Open</Badge>
                  )}
                </Link>
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
              aside={drawingChip(group.workItemId, villa.drawings)}
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

function RequestBadge({ status }: { status: IssueRequestRow["status"] }) {
  if (status === "fulfilled") return <Badge variant="success">Issued</Badge>;
  if (status === "declined") return <Badge variant="danger">Declined</Badge>;
  return <Badge variant="info">Waiting</Badge>;
}

// A work can carry several released drawing sets: the chip names the first and counts the rest, and always points at the Drawings section.
function drawingChip(workItemId: string, drawings: VillaDetail["drawings"]) {
  const matches = drawings.filter((set) => set.workItemIds.includes(workItemId));
  if (matches.length === 0) return null;
  const [first, ...rest] = matches;
  return (
    <a
      href="#drawings"
      className="border-border bg-background text-accent hover:border-accent inline-flex min-h-9 items-center gap-1 rounded-lg border px-2.5 text-xs font-medium"
    >
      <FileText className="size-3.5 shrink-0" aria-hidden />
      Drawing · R{first.revision.revisionNo}
      {rest.length > 0 ? ` +${rest.length} more` : ""}
    </a>
  );
}
