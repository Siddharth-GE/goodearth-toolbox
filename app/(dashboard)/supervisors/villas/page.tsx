import { chipClassName } from "@/components/ui/choice-chips";
import { EmptyState } from "@/components/ui/empty-state";
import { ListToolbar } from "@/components/ui/list-toolbar";
import { formatCount } from "@/lib/format";
import { BOARD_HEALTH, getSiteBoard } from "@/lib/supervisors/board-queries";
import { HardHat, LayoutGrid } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { BoardColumns } from "./_components/villa-card";

const HEALTH_LABEL: Record<(typeof BOARD_HEALTH)[number], string> = {
  waiting: "Waiting",
  late: "Past its finish",
  idle: "No labour",
  failed_check: "Failed check",
  delivery: "Delivery to confirm",
  on_track: "On track",
  not_started: "Not started",
  finished: "Done",
};

function Chips({
  label,
  items,
}: {
  label: string;
  items: { key: string; label: ReactNode; href: string; on: boolean }[];
}) {
  return (
    <nav aria-label={label} className="flex flex-wrap gap-1.5">
      {items.map((item) => (
        <Link
          key={item.key}
          href={item.href}
          aria-current={item.on ? "true" : undefined}
          className={chipClassName(item.on)}
          scroll={false}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}

/** The site board: every villa as a card, placed by the furthest stage family begun, with its health. Mine is the villas a
 * supervisor runs — a filter, not a permission; everyone sees every villa. */
export default async function SiteBoardPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; project?: string; who?: string; health?: string }>;
}) {
  const params = await searchParams;
  const board = await getSiteBoard(params);

  const href = (patch: Partial<typeof params>) => {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries({ ...params, who: board.who, ...patch })) {
      if (value) query.set(key, value);
    }
    return `/supervisors/villas?${query.toString()}`;
  };

  if (board.projects.length === 0) {
    return (
      <EmptyState
        icon={HardHat}
        title="No villas yet"
        description="Villas come from Masters — once units exist there, they show up here."
      />
    );
  }

  const filtered = Boolean(params.q || params.project || params.health);

  return (
    <div className="space-y-4">
      <ListToolbar
        action="/supervisors/villas"
        values={params}
        keep={{ health: params.health, who: board.who }}
        search={{ placeholder: "Plot number or villa…" }}
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
        <Chips
          label="How the villas are doing"
          items={[
            {
              key: "all",
              label: <>All {formatCount(board.counts.all)}</>,
              href: href({ health: undefined }),
              on: !params.health,
            },
            ...BOARD_HEALTH.filter(
              (health) => board.counts[health] > 0 || params.health === health,
            ).map((health) => ({
              key: health,
              label: (
                <>
                  {HEALTH_LABEL[health]}{" "}
                  <span className="tabular-nums opacity-60">
                    {formatCount(board.counts[health])}
                  </span>
                </>
              ),
              href: href({ health: params.health === health ? undefined : health }),
              on: params.health === health,
            })),
          ]}
        />
        <Chips
          label="Whose villas"
          items={[
            { key: "mine", label: "Mine", href: href({ who: "mine" }), on: board.who === "mine" },
            { key: "all", label: "Everyone", href: href({ who: "all" }), on: board.who === "all" },
          ]}
        />
      </div>

      {board.cards.length === 0 ? (
        <EmptyState
          icon={LayoutGrid}
          title={
            filtered
              ? "No villas match"
              : board.who === "mine"
                ? "No villas of yours yet"
                : "No villas"
          }
          description={
            filtered
              ? "Try another chip, or clear the search."
              : board.who === "mine"
                ? "A villa shows here once you run it — set Who runs it on the villa's page. Switch to Everyone to see every villa."
                : "Villas come from Masters."
          }
        />
      ) : (
        <BoardColumns columns={board.columns} cards={board.cards} />
      )}
    </div>
  );
}
