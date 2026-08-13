import { Figure, FigureBand, FigureBandCell } from "@/components/ui/figure";
import { PageTitle } from "@/components/ui/page-title";
import { Section } from "@/components/ui/section";
import {
  getClientDetail,
  getFilterOptions,
  listAssignableUnits,
} from "@/lib/client-relations/queries";
import { formatDate, formatMoney } from "@/lib/format";
import { notFound } from "next/navigation";

import { AssignPlotDialog } from "../_components/assign-plot-dialog";
import { ClientFormDialog } from "../_components/client-form-dialog";
import { ClientStageBadge } from "../_components/crm-badges";
import { EngagementCard } from "../_components/engagement-card";

export default async function ClientDetailPage({
  params,
}: {
  params: Promise<{ clientId: string }>;
}) {
  const { clientId } = await params;

  const [detail, options] = await Promise.all([getClientDetail(clientId), getFilterOptions()]);
  if (!detail) notFound();

  const { client, engagements, totals } = detail;
  // Only fetched when it can actually be used — the dialog is the whole
  // reason this list exists.
  const assignable = engagements.length === 0 ? await listAssignableUnits() : [];

  return (
    <div className="space-y-4">
      <PageTitle
        title={client.name}
        backHref="/client-relations/clients"
        backLabel="Clients"
        description={client.stage === "lost" ? (client.lostReason ?? undefined) : undefined}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <ClientStageBadge stage={client.stage} />
            <ClientFormDialog client={client} owners={options.owners} />
          </div>
        }
      />

      <Section title="Contact">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {/* Saarang's imported clients carry a name and nothing else, so
              blanks here are normal rather than a failed read. */}
          <Detail label="Mobile" value={client.mobile} />
          <Detail label="Email" value={client.email} />
          <Detail label="Handled by" value={client.ownerName} />
          <Detail label="How they found us" value={client.source} />
          <Detail label="First contact" value={formatDate(client.firstContactOn)} />
          <Detail label="Became a client" value={formatDate(client.convertedOn)} />
          {client.notes && (
            <div className="sm:col-span-2 lg:col-span-4">
              <p className="text-muted text-xs font-semibold tracking-widest uppercase">Notes</p>
              <p className="text-foreground mt-1 text-sm whitespace-pre-line">{client.notes}</p>
            </div>
          )}
        </div>
      </Section>

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
          {/* Every plot's dues in one line. Each plot's schedule is worked
              out on its own ledger and only the answers are added — see
              combineSummaries. */}
          <FigureBand>
            <FigureBandCell>
              <Figure label="Scheduled" value={formatMoney(totals.scheduled)} size="sm" />
            </FigureBandCell>
            <FigureBandCell>
              <Figure label="Received" value={formatMoney(totals.received)} tone="good" size="sm" />
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

          {engagements.map((engagement) => (
            <EngagementCard
              key={engagement.id}
              engagement={engagement}
              owners={options.owners}
              // "Satheesh and Aruna" hold two villas, so a plot needs its
              // own heading whenever more than one is stacked up.
              heading={engagements.length > 1}
            />
          ))}
        </>
      )}
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <p className="text-muted text-xs font-semibold tracking-widest uppercase">{label}</p>
      <p className="text-foreground mt-1 text-sm">{value || "—"}</p>
    </div>
  );
}
