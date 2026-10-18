import { unpricedNote } from "@/lib/client-relations/dues";
import { Avatar } from "@/components/ui/avatar";
import { Card } from "@/components/ui/card";
import { Figure, FigureBand, FigureBandCell } from "@/components/ui/figure";
import { Section } from "@/components/ui/section";
import { compareDone, compareOpen } from "@/lib/client-relations/next-steps";
import { getBoardBasics } from "@/lib/client-relations/next-steps-queries";
import {
  getClientDetail,
  getFilterOptions,
  listAssignableUnits,
} from "@/lib/client-relations/queries";
import { formatDate, formatMoney } from "@/lib/format";
import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AssignPlotDialog } from "../_components/assign-plot-dialog";
import { BoardProvider } from "../_components/board-context";
import { ClientFormDialog } from "../_components/client-form-dialog";
import { ClientStageBadge } from "../_components/crm-badges";
import { Composer } from "../_components/composer";
import { LotCard } from "../_components/lot-card";
import { NotYours } from "../_components/not-yours";
import { Pill } from "../_components/pill";
import { StepCard } from "../_components/step-card";

export default async function ClientDetailPage({
  params,
}: {
  params: Promise<{ clientId: string }>;
}) {
  const { clientId } = await params;

  const [detail, options, basics] = await Promise.all([
    getClientDetail(clientId),
    getFilterOptions(),
    getBoardBasics(),
  ]);
  if (!detail) {
    if (!basics.seesAll) return <NotYours kind="client" />;
    notFound();
  }

  const { client, engagements, totals } = detail;
  // Fetched only when the dialog can use it.
  const assignable = engagements.length === 0 ? await listAssignableUnits() : [];

  const steps = engagements.flatMap((engagement) => engagement.steps);
  const open = steps
    .filter((step) => step.status !== "done")
    .sort((a, b) => compareOpen({ dueOn: a.dueOn }, { dueOn: b.dueOn }));
  const done = steps.filter((step) => step.status === "done").sort(compareDone);
  const onTeam = (id: string | null) => Boolean(id && basics.team.some((p) => p.id === id));
  const plotOwner = engagements.find((engagement) => onTeam(engagement.ownerId))?.ownerId ?? null;
  const defaultOwner = plotOwner ?? (onTeam(basics.meId) ? basics.meId : null);

  const facts = [
    ["Mobile", client.mobile],
    ["Email", client.email],
    ["Handled by", client.ownerName],
    ["How they found us", client.source],
    ["First contact", client.firstContactOn ? formatDate(client.firstContactOn) : null],
    ["Became a client", client.convertedOn ? formatDate(client.convertedOn) : null],
  ] as const;

  return (
    <BoardProvider {...basics}>
      <div className="space-y-4">
        <Link
          href="/client-relations/clients"
          className="text-muted hover:text-foreground inline-flex items-center gap-1 text-sm"
        >
          <ChevronLeft className="size-4" /> Clients
        </Link>

        <Card className="space-y-4 p-5">
          <div className="flex flex-wrap items-start gap-4">
            <Avatar name={client.name} size={52} />
            <div className="min-w-0 flex-1 basis-56">
              <h2 className="text-2xl font-semibold tracking-tight text-balance">{client.name}</h2>
              {client.stage === "lost" && client.lostReason ? (
                <p className="text-muted mt-0.5 text-sm">{client.lostReason}</p>
              ) : null}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <ClientStageBadge stage={client.stage} />
              <ClientFormDialog client={client} owners={options.owners} />
            </div>
          </div>
          {/* Imported clients carry a name and nothing else, so blanks are normal. */}
          <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-3 lg:grid-cols-6">
            {facts.map(([label, value]) => (
              <div key={label} className="min-w-0">
                <dt className="text-muted text-[11px] font-medium tracking-[0.14em] uppercase">
                  {label}
                </dt>
                <dd className="text-foreground mt-0.5 truncate text-sm">{value || "—"}</dd>
              </div>
            ))}
          </dl>
          {client.notes ? (
            <p className="text-foreground/80 text-sm whitespace-pre-line">{client.notes}</p>
          ) : null}
        </Card>

        {engagements.length === 0 ? (
          <Section
            title="Plots"
            note="Nothing assigned yet."
            aside={<AssignPlotDialog clientId={client.id} units={assignable} />}
          >
            <p className="text-muted text-sm">
              {client.stage === "prospect"
                ? "Give them a plot when they buy — that is what adds them to the master."
                : "This person holds no plot at the moment."}
            </p>
          </Section>
        ) : (
          <>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(15.5rem,1fr))] gap-3">
              {engagements.map((engagement) => (
                <LotCard key={engagement.id} card={engagement.card} today={basics.today} />
              ))}
            </div>

            <Section
              title="Next steps"
              note={engagements.length > 1 ? "Across every plot they hold." : undefined}
              aside={<Pill>{open.length} open</Pill>}
            >
              <div className="space-y-2">
                {open.length + done.length === 0 ? (
                  <p className="text-muted text-sm">No actions yet. Add the next step below.</p>
                ) : (
                  [...open, ...done].map((step) => (
                    <StepCard key={step.id} step={step} showPlot={engagements.length > 1} />
                  ))
                )}
                <div className="pt-1">
                  <Composer
                    fixedPlot={engagements.length === 1 ? engagements[0].id : undefined}
                    defaultOwner={defaultOwner}
                  />
                </div>
              </div>
            </Section>

            {/* Each plot's dues are worked out on its own ledger; only the answers are added (combineSummaries). */}
            <FigureBand>
              <FigureBandCell>
                <Figure
                  label="Scheduled"
                  value={formatMoney(totals.scheduled)}
                  hint={unpricedNote(totals.unpricedCount)}
                  size="sm"
                />
              </FigureBandCell>
              <FigureBandCell>
                <Figure
                  label="Received"
                  value={formatMoney(totals.received)}
                  tone="good"
                  size="sm"
                />
              </FigureBandCell>
              <FigureBandCell>
                <Figure
                  label="Outstanding"
                  value={formatMoney(totals.outstanding)}
                  hint={totals.nextDueOn ? `Next ${formatDate(totals.nextDueOn)}` : undefined}
                  size="sm"
                />
              </FigureBandCell>
              <FigureBandCell>
                <Figure
                  label="Overdue"
                  value={formatMoney(totals.overdue)}
                  tone={totals.overdue > 0 ? "bad" : undefined}
                  size="sm"
                />
              </FigureBandCell>
            </FigureBand>
          </>
        )}
      </div>
    </BoardProvider>
  );
}
