import { EmptyState } from "@/components/ui/empty-state";
import { ListToolbar } from "@/components/ui/list-toolbar";
import { Section } from "@/components/ui/section";
import { HEALTH_FILTERS, VILLA_HEALTH } from "@/lib/design-management/board";
import { getDesignBoard } from "@/lib/design-management/board-queries";
import { formatCount } from "@/lib/format";
import { ChevronRight, HardHat, LayoutGrid } from "lucide-react";
import Link from "next/link";

import { BoardColumns } from "../_components/board-columns";
import { FilterChips } from "../_components/board-parts";

/** One column per board stage; a villa sits in the furthest stage it has started and a stage sent back shows on its card, never moving it back. Columns stack on a phone. The address is the old Villas screen's, so links keep working. */
export default async function DesignBoardPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; project?: string; who?: string; health?: string }>;
}) {
  const params = await searchParams;
  const board = await getDesignBoard(params);

  const href = (patch: Partial<typeof params>) => {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries({ ...params, ...patch })) {
      if (value) query.set(key, value);
    }
    const search = query.toString();
    return search ? `/design-management/villas?${search}` : "/design-management/villas";
  };

  if (board.villas.length === 0) {
    return (
      <EmptyState
        icon={HardHat}
        title="No villas yet"
        description="Villas come from Masters — once units exist there, they show up here."
      />
    );
  }

  const healthChips = [
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
            {VILLA_HEALTH[health].label}{" "}
            <span className="tabular-nums opacity-60">{formatCount(board.counts[health])}</span>
          </>
        ),
        href: href({ health: params.health === health ? undefined : health }),
        on: params.health === health,
      }),
    ),
  ];

  const filtered = Boolean(params.q || params.project || params.health);

  return (
    <div className="space-y-4">
      <ListToolbar
        action="/design-management/villas"
        values={params}
        keep={{ health: params.health, who: params.who }}
        search={{ placeholder: "Plot number, villa or client…" }}
        filters={
          board.projects.length > 1
            ? [
                {
                  param: "project",
                  label: "Project",
                  allLabel: "All projects",
                  options: board.projects.map((project) => ({
                    value: project.id,
                    label: project.name,
                  })),
                },
              ]
            : []
        }
      />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <FilterChips label="How the villas are doing" items={healthChips} />
        <FilterChips
          label="Whose villas"
          items={[
            { key: "mine", label: "Mine", href: href({ who: "mine" }), on: board.who === "mine" },
            { key: "all", label: "Everyone", href: href({ who: "all" }), on: board.who === "all" },
          ]}
        />
      </div>

      {board.stages.length === 0 ? (
        <EmptyState
          icon={LayoutGrid}
          title="No stage is on the board"
          description="Open Design stages and tick On the board for the stages a villa moves through."
        />
      ) : board.cards.length === 0 ? (
        <EmptyState
          icon={LayoutGrid}
          title={
            filtered
              ? "No villas match"
              : board.who === "mine"
                ? "No villas of yours yet"
                : "No villa has started yet"
          }
          description={
            filtered
              ? "Try another chip, or clear the search."
              : board.who === "mine"
                ? "A villa shows here once you are on one of its stages, or hold an action on it. Switch to Everyone to see the whole board."
                : "Open a villa below and press Set where it is — the stage it has reached and who is on it."
          }
        />
      ) : (
        <BoardColumns stages={board.stages} cards={board.cards} today={board.today} />
      )}

      {board.notStarted.length > 0 ? (
        <Section
          title={`Not started · ${formatCount(board.notStarted.length)}`}
          note="Open a villa and press Set where it is, or start its first stage."
          collapsible
          defaultOpen={board.cards.length === 0 && !filtered}
        >
          <ul className="divide-border grid divide-y sm:grid-cols-2 sm:gap-x-6 lg:grid-cols-3">
            {board.notStarted.map((villa) => (
              <li key={villa.unitId}>
                <Link
                  href={`/design-management/villas/${villa.unitId}`}
                  className="hover:bg-foreground/[0.025] -mx-2 flex items-center gap-3 rounded-lg px-2 py-2"
                >
                  <span className="text-foreground min-w-12 font-mono text-sm font-bold">
                    {villa.number}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="text-foreground block truncate text-sm">
                      {villa.clientName ?? "No buyer yet"}
                    </span>
                    <span className="text-muted block truncate text-xs">
                      {villa.villaName}
                      {board.projects.length > 1 ? ` · ${villa.projectName}` : ""}
                    </span>
                  </span>
                  <ChevronRight className="text-muted size-4 shrink-0" />
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}
    </div>
  );
}
