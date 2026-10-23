import { WORK_CLASS_LABEL } from "@/lib/masters/work-classes";
import { Badge } from "@/components/ui/badge";
import { LinkButton } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Section } from "@/components/ui/section";
import { SectionHead } from "@/components/ui/section-head";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/components/ui/table";
import { UndoBarProvider } from "@/components/ui/undo-bar";
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
import { ChevronLeft, ExternalLink, FileText } from "lucide-react";
import { notFound } from "next/navigation";
import {
  listChecklistTemplates,
  listTemplateGroups,
  listVillaChecklists,
} from "@/lib/supervisors/checklist-queries";
import { getVillaProgramme, storeStock } from "@/lib/supervisors/programme-queries";
import Link from "next/link";
import { listVillaDeliveries, type VillaDelivery } from "@/lib/supervisors/site-receipt-queries";
import { isShort } from "@/lib/supervisors/site-receipt";
import { StartChecklistDialog } from "./_components/checklist-forms";
import { ConfirmDeliveryDialog } from "./_components/delivery-forms";
import { DrawingHistory } from "./_components/drawing-history";
import { DeleteLabourLogButton, LabourLogDialog } from "./_components/labour-forms";
import {
  NextCard,
  NowCard,
  ProgrammeList,
  StageHistory,
  VillaHeader,
  stageReadiness,
} from "./_components/programme-sections";
import { RequestIssueDialog, WithdrawRequestButton } from "./_components/request-forms";

// One villa, phone-first: where it stands, the stages being worked and what comes next, then the full records folded away below.
export default async function VillaPage({ params }: { params: Promise<{ plotId: string }> }) {
  const { plotId } = await params;
  const [
    villa,
    contractors,
    works,
    categories,
    brands,
    checklists,
    templates,
    templateGroups,
    deliveries,
  ] = await Promise.all([
    getVillaDetail(plotId),
    listContractors(),
    listWorkOptions(),
    listItemCategories(),
    listBrands(),
    listVillaChecklists(plotId),
    listChecklistTemplates(),
    listTemplateGroups(),
    listVillaDeliveries(plotId),
  ]);
  if (!villa) notFound();

  const programme = await getVillaProgramme({
    plotId,
    unitId: villa.unitId,
    checklists,
    templates,
    templateGroups,
    deliveries,
    contractors,
  });
  const nextItemIds = [
    ...new Set(
      programme.next.flatMap((stage) =>
        stageReadiness(stage, villa, new Map()).flatMap((row) =>
          row.pick ? [row.pick.itemId] : [],
        ),
      ),
    ),
  ];
  const stock = await storeStock(nextItemIds);

  const pickerCategories = categories.map(({ id, name }) => ({ id, name }));
  const pickerBrands = brands.map(({ id, name }) => ({ id, name }));
  const startable = templates
    .filter((template) => template.isActive)
    .map((template) => ({
      id: template.id,
      name: template.name,
      itemCount: template.items.filter((item) => item.isActive).length,
    }))
    .filter((template) => template.itemCount > 0);
  const openRequests = villa.requests.filter((request) => request.status === "requested");
  const answered = villa.requests.filter((request) => request.status !== "requested");
  const toConfirm = deliveries.filter(
    (delivery) => !delivery.confirmedAt && delivery.lines.length > 0,
  );

  return (
    <UndoBarProvider>
      <div className="space-y-4">
        <Link
          href="/supervisors/villas"
          className="text-muted hover:text-foreground inline-flex items-center gap-1 text-sm"
        >
          <ChevronLeft className="size-4" aria-hidden /> Villas
        </Link>

        <VillaHeader villa={villa} programme={programme} plotId={plotId} />

        <section className="space-y-2">
          <SectionHead
            title="Now"
            count={programme.now.length}
            hint="Working or waiting"
            aside={
              <LabourLogDialog
                plotId={plotId}
                works={works}
                contractors={contractors}
                trigger={
                  <button type="button" className="text-accent text-sm font-medium">
                    Log other labour
                  </button>
                }
              />
            }
          />
          {programme.now.length === 0 ? (
            <Card className="p-5">
              <p className="text-muted text-sm">
                Nothing is being worked. The first labour logged on a stage starts it — or tap
                Working on the next stage below.
              </p>
            </Card>
          ) : (
            programme.now.map((stage) => (
              <NowCard
                key={stage.id}
                plotId={plotId}
                stage={stage}
                works={works}
                contractors={contractors}
                villa={villa}
                categories={pickerCategories}
                brands={pickerBrands}
                templates={startable}
              />
            ))
          )}
        </section>

        {programme.next.length > 0 && (
          <section className="space-y-2">
            <SectionHead
              title="Next up"
              hint="Line up the crew and the material before it starts"
            />
            {programme.next.map((stage) => (
              <NextCard
                key={stage.id}
                plotId={plotId}
                stage={stage}
                readiness={stageReadiness(stage, villa, stock)}
                works={works}
                contractors={contractors}
                villa={villa}
                categories={pickerCategories}
                brands={pickerBrands}
              />
            ))}
          </section>
        )}

        {toConfirm.length > 0 && (
          <section className="space-y-2">
            <SectionHead title="Deliveries to confirm" count={toConfirm.length} tone="info" />
            <Card className="p-5">
              <DeliveryList deliveries={toConfirm} />
            </Card>
          </section>
        )}

        {programme.stages.length > 0 && (
          <section className="space-y-2">
            <SectionHead
              title="Programme"
              count={programme.stages.length}
              hint="Tap a stage to change it"
            />
            <ProgrammeList plotId={plotId} stages={programme.stages} contractors={contractors} />
          </section>
        )}

        <div className="space-y-3 pt-2">
          <Section
            title="Labour"
            note={
              villa.labourLogs.length
                ? `Showing ${villa.labourLogs.length} of ${villa.labourTotal} entries, newest first.`
                : undefined
            }
            collapsible
            defaultOpen={false}
          >
            <LabourList villa={villa} plotId={plotId} works={works} contractors={contractors} />
          </Section>

          <Section
            title="Requests"
            note={openRequests.length ? `${openRequests.length} waiting at the store.` : undefined}
            aside={
              <RequestIssueDialog
                plotId={plotId}
                works={works}
                hasEstimate={villa.estimate !== null}
                quickPicks={villa.quickPicks}
                categories={pickerCategories}
                brands={pickerBrands}
                trigger={
                  <button type="button" className="text-accent text-sm font-medium">
                    New request
                  </button>
                }
              />
            }
            collapsible
            defaultOpen={false}
          >
            {villa.requests.length === 0 ? (
              <p className="text-muted text-sm">
                No requests yet — Material on a stage sends the first one to the store-keeper.
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
            aside={<StartChecklistDialog plotId={plotId} templates={startable} />}
            collapsible
            defaultOpen={false}
          >
            {checklists.length === 0 ? (
              <p className="text-muted text-sm">
                No checklists yet — a stage being worked offers its own.
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
                        <Badge variant={checklist.failed > 0 ? "warning" : "success"}>
                          Signed off
                        </Badge>
                      ) : (
                        <Badge variant="info">Open</Badge>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section
            title="Deliveries to this villa"
            note={deliveries.length ? `${toConfirm.length} waiting for you to confirm.` : undefined}
            collapsible
            defaultOpen={false}
          >
            {deliveries.length === 0 ? (
              <p className="text-muted text-sm">
                Nothing has been issued or delivered to this villa yet.
              </p>
            ) : (
              <DeliveryList deliveries={deliveries} />
            )}
          </Section>

          <Section
            title="Materials, work by work"
            note={
              villa.estimate
                ? `Drawn against official estimate ${villa.estimate.reference}, submitted ${formatDate(villa.estimate.submittedAt)}.`
                : "No official estimate yet — what was drawn, with nothing to check against."
            }
            collapsible
            defaultOpen={false}
          >
            <MaterialsByWork villa={villa} />
          </Section>

          <div id="drawings" className="scroll-mt-4">
            <Section
              title="Drawings"
              note={
                villa.drawings.length
                  ? `${villa.drawings.length} set${villa.drawings.length === 1 ? "" : "s"} released to site.`
                  : undefined
              }
              collapsible
              defaultOpen={false}
            >
              <Drawings villa={villa} />
            </Section>
          </div>

          <Section title="History" collapsible defaultOpen={false}>
            <StageHistory events={programme.history} />
          </Section>
        </div>
      </div>
    </UndoBarProvider>
  );
}

function LabourList({
  villa,
  plotId,
  works,
  contractors,
}: {
  villa: VillaDetail;
  plotId: string;
  works: Awaited<ReturnType<typeof listWorkOptions>>;
  contractors: Awaited<ReturnType<typeof listContractors>>;
}) {
  if (villa.labourLogs.length === 0) {
    return (
      <p className="text-muted text-sm">
        Nothing logged yet — Log labour on a stage records the first day.
      </p>
    );
  }
  return (
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
  );
}

function DeliveryList({ deliveries }: { deliveries: VillaDelivery[] }) {
  return (
    <ul className="divide-border divide-y">
      {deliveries.map((delivery) => {
        const short = delivery.lines.filter(isShort);
        return (
          <li key={`${delivery.kind}-${delivery.id}`} className="space-y-1 py-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-foreground text-sm font-medium">
                  {`${delivery.reference} · ${delivery.kind === "issue" ? "from the store" : "straight to site"}`}
                </p>
                <p className="text-muted text-xs">
                  {`${formatDate(delivery.on)} · ${delivery.lines.length} ${delivery.lines.length === 1 ? "item" : "items"}${delivery.label ? ` · ${delivery.label}` : ""}`}
                </p>
              </div>
              {delivery.confirmedAt ? (
                <Badge variant={short.length ? "warning" : "success"}>
                  {short.length ? "Short" : "Arrived"}
                </Badge>
              ) : delivery.lines.length > 0 ? (
                <ConfirmDeliveryDialog delivery={delivery} />
              ) : null}
            </div>
            {delivery.confirmedAt && (
              <p className="text-muted text-xs">
                {`Confirmed ${formatDate(delivery.confirmedAt)}${delivery.confirmedByName ? ` by ${delivery.confirmedByName}` : ""}`}
                {short.length > 0 &&
                  ` — ${short.map((line) => `${line.itemName}: ${formatQuantity(line.received)} of ${formatQuantity(line.sent)} ${line.uom}`).join("; ")}`}
                {delivery.note ? ` · ${delivery.note}` : ""}
              </p>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function MaterialsByWork({ villa }: { villa: VillaDetail }) {
  if (villa.workGroups.length === 0 && villa.untagged.length === 0) {
    return (
      <p className="text-muted text-sm">
        Nothing has reached this plot yet — store issues and site deliveries will appear here under
        the work they were for.
      </p>
    );
  }
  return (
    <div className="space-y-5">
      {villa.workGroups.map((group) => (
        <div key={group.workItemId} className="space-y-1.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-foreground text-sm font-semibold">{group.workLabel}</p>
            {drawingChip(group.workItemId, villa.drawings)}
          </div>
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
        </div>
      ))}
      {villa.untagged.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-foreground text-sm font-semibold">No work recorded</p>
          <p className="text-muted text-xs">Older movements made before issues named their work.</p>
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
        </div>
      )}
    </div>
  );
}

function Drawings({ villa }: { villa: VillaDetail }) {
  if (villa.drawings.length === 0) {
    return <p className="text-muted text-sm">No drawings have been released for this villa yet.</p>;
  }
  return (
    <ul className="divide-border divide-y">
      {villa.drawings.map((set) => (
        <li key={set.setId} className="space-y-2 py-3">
          <div>
            <p className="text-foreground text-sm font-medium">
              {set.setCode ? `${set.setCode} · ${set.setName}` : set.setName} · R
              {set.revision.revisionNo}
            </p>
            <p className="text-muted text-xs">Released {formatDate(set.revision.releasedAt)}</p>
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
