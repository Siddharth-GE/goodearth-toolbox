import { EmptyState } from "@/components/ui/empty-state";
import { Figure, FigureBand, FigureBandCell } from "@/components/ui/figure";
import { ListToolbar } from "@/components/ui/list-toolbar";
import { HEALTH, HEALTH_FILTERS } from "@/lib/client-relations/next-steps";
import { getPlotBoard } from "@/lib/client-relations/next-steps-queries";
import { getHeadlines } from "@/lib/client-relations/queries";
import { formatCount, todayInIndia } from "@/lib/format";
import { MapPin } from "lucide-react";

import { FilterChips, SectionHead } from "../_components/board-parts";
import { LotCard } from "../_components/lot-card";

/**
 * Every plot as a lot card, grouped by project — the tracker's Plots view
 * (root plan.md, seventh piece). The headline band is the sheet's
 * hand-typed header, computed; the health chips say which plots need a
 * look, and only the ones with something in them show.
 */
export default async function PlotsPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    project?: string;
    who?: string;
    health?: string;
    side?: string;
  }>;
}) {
  const params = await searchParams;
  const [board, headlines] = await Promise.all([
    getPlotBoard(params),
    getHeadlines(params.project),
  ]);
  const today = todayInIndia();

  const href = (patch: Partial<typeof params>) => {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries({ ...params, ...patch })) {
      if (value) query.set(key, value);
    }
    const search = query.toString();
    return search ? `/client-relations/plots?${search}` : "/client-relations/plots";
  };

  const chips = [
    {
      key: "all",
      label: <>All {formatCount(board.counts.all)}</>,
      href: href({ health: undefined }),
      on: !params.health,
    },
    ...HEALTH_FILTERS.filter((health) => board.counts[health] > 0 || params.health === health).map(
      (health) => ({
        key: health,
        label: (
          <>
            {HEALTH[health].label}{" "}
            <span className="tabular-nums opacity-60">{formatCount(board.counts[health])}</span>
          </>
        ),
        href: href({ health: params.health === health ? undefined : health }),
        on: params.health === health,
      }),
    ),
  ];

  const projects = [...new Set(board.cards.map((card) => card.projectId))];
  const filtered = Boolean(
    params.q || params.project || params.who || params.health || params.side,
  );

  return (
    <div className="space-y-4">
      {/* The sheet's header row, computed. Every one of these was typed by
          hand — "Sale Count: 38", "Sale deed: 29", "Const Agmt: 23" — and
          went stale the moment a plot moved. */}
      <FigureBand>
        <FigureBandCell>
          <Figure label="Plots" value={formatCount(headlines.plots)} size="sm" />
        </FigureBandCell>
        <FigureBandCell>
          <Figure
            label="Sold"
            value={formatCount(headlines.sold)}
            hint={`${formatCount(headlines.reserved)} reserved, ${formatCount(headlines.available)} available`}
            size="sm"
          />
        </FigureBandCell>
        <FigureBandCell>
          <Figure
            label="Sale deeds signed"
            value={formatCount(headlines.saleDeedsSigned)}
            size="sm"
          />
        </FigureBandCell>
        <FigureBandCell>
          <Figure
            label="Agreements signed"
            value={formatCount(headlines.agreementsSigned)}
            size="sm"
          />
        </FigureBandCell>
        <FigureBandCell>
          <Figure
            label="For registration"
            value={formatCount(headlines.forRegistration)}
            size="sm"
          />
        </FigureBandCell>
        <FigureBandCell>
          <Figure
            label="Payments overdue"
            value={formatCount(headlines.overdue)}
            hint="plots"
            tone={headlines.overdue > 0 ? "bad" : undefined}
            size="sm"
          />
        </FigureBandCell>
      </FigureBand>

      <ListToolbar
        action="/client-relations/plots"
        values={params}
        keep={{ health: params.health }}
        search={{ placeholder: "Plot number or client…" }}
        filters={[
          {
            param: "project",
            label: "Project",
            allLabel: "All projects",
            options: board.projects.map((project) => ({ value: project.id, label: project.name })),
          },
          {
            // A plot's two sides each have their own owner; Interior lists only
            // plots with interior work (plotInList).
            param: "side",
            label: "Side",
            allLabel: "Both sides",
            options: [
              { value: "construction", label: "Construction" },
              { value: "interior", label: "Interior" },
            ],
          },
          {
            param: "who",
            label: "Whose",
            allLabel: board.seesAll ? "Everyone" : "All of mine",
            options: [
              ...board.team.map((person) => ({ value: person.id, label: person.name })),
              { value: "mgmt", label: "Waiting on management" },
            ],
          },
        ]}
      />

      <FilterChips label="How the plots are doing" items={chips} />

      {board.cards.length === 0 ? (
        <EmptyState
          icon={MapPin}
          title={board.seesAll || filtered ? "No plots match" : "No plots of yours yet"}
          description={
            board.seesAll || filtered
              ? "Try another chip, or clear the search."
              : "A plot shows here once you are its Construction or Interior owner, or hold an open action on it. A team lead gives plots out."
          }
        />
      ) : (
        projects.map((projectId) => {
          const cards = board.cards.filter((card) => card.projectId === projectId);
          return (
            <section key={projectId} className="space-y-3">
              {projects.length > 1 || !params.project ? (
                <SectionHead title={cards[0].projectName} count={cards.length} />
              ) : null}
              <div className="grid grid-cols-[repeat(auto-fill,minmax(15.5rem,1fr))] gap-3">
                {cards.map((card) => (
                  <LotCard key={card.engagementId} card={card} today={today} />
                ))}
              </div>
            </section>
          );
        })
      )}
    </div>
  );
}
