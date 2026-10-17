import { chipClassName } from "@/components/ui/choice-chips";
import { getDesignActions } from "@/lib/design-management/board-queries";
import { formatCount } from "@/lib/format";
import Link from "next/link";

import { ActionSections, FilterChips, Greeting, TeamStrip } from "../_components/board-parts";
import { DesignBoardProvider } from "../_components/board-context";
import { Composer } from "../_components/composer";

/**
 * The design team's to-do list (root plan.md, twelfth piece) — Client
 * Relations' Actions for design: every step with an owner and a date,
 * sorted by how late it is.
 *
 * An admin opens on everyone, with the team strip; everyone else on their
 * own list, under a greeting, with a switch to everyone's — the whole
 * team sees every villa (0125). Every filter lives in the URL.
 */
export default async function DesignActionsPage({
  searchParams,
}: {
  searchParams: Promise<{ project?: string; who?: string; done?: string }>;
}) {
  const params = await searchParams;
  const board = await getDesignActions({
    project: params.project,
    who: params.who,
    showDone: params.done === "1",
  });

  const defaultWho = board.me.isManager ? "all" : board.me.id;
  const href = (patch: Partial<typeof params>) => {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries({ ...params, ...patch })) {
      if (value) query.set(key, value);
    }
    const search = query.toString();
    return search ? `/design-management/actions?${search}` : "/design-management/actions";
  };
  const hrefForWho = (who: string) => href({ who: who === defaultWho ? undefined : who });

  const viewing = board.team.find((person) => person.id === board.who) ?? null;
  const onTeam = board.team.some((person) => person.id === board.me.id);
  const defaultOwner = viewing?.id ?? (onTeam ? board.me.id : null);
  const mine = board.who === board.me.id;

  const whoLine = mine
    ? "Your actions. Stuck on something only a manager can clear? Use ••• → Waiting on management."
    : board.who === "mgmt"
      ? "What is waiting on management"
      : viewing
        ? `${viewing.name.split(" ")[0]}'s actions`
        : "Everyone's actions";

  return (
    <DesignBoardProvider
      today={board.today}
      team={board.team}
      villas={board.villas}
      stages={board.stages}
      openByOwner={board.openByOwner}
      meId={board.me.id}
      isManager={board.me.isManager}
    >
      <div className="space-y-4">
        {board.me.isManager ? (
          <TeamStrip
            loads={board.loads}
            management={board.management}
            who={board.who}
            hrefFor={hrefForWho}
          />
        ) : (
          <Greeting
            name={board.me.name}
            hour={board.hour}
            load={board.myLoad}
            toConfirm={board.myToConfirm}
          />
        )}

        <div className="flex flex-wrap items-center justify-between gap-2">
          {board.projects.length > 1 ? (
            <FilterChips
              label="Which villas"
              items={[
                {
                  key: "all",
                  label: "All projects",
                  href: href({ project: undefined }),
                  on: !params.project,
                },
                ...board.projects.map((project) => ({
                  key: project.id,
                  label: project.name,
                  href: href({ project: project.id }),
                  on: params.project === project.id,
                })),
              ]}
            />
          ) : (
            <span />
          )}
          {board.me.isManager ? null : (
            <FilterChips
              label="Whose actions"
              items={[
                { key: "mine", label: "Mine", href: hrefForWho(board.me.id), on: mine },
                { key: "all", label: "Everyone", href: hrefForWho("all"), on: board.who === "all" },
              ]}
            />
          )}
        </div>

        <Composer key={board.who} defaultOwner={defaultOwner} />

        <div className="text-muted flex flex-wrap items-center justify-between gap-2 text-sm">
          <span>
            {whoLine}
            {board.who !== defaultWho ? (
              <>
                {" · "}
                <Link
                  href={hrefForWho(defaultWho)}
                  className="text-accent font-medium hover:underline"
                >
                  {board.me.isManager ? "Show everyone" : "Show mine"}
                </Link>
              </>
            ) : null}
          </span>
          <Link
            href={href({ done: params.done === "1" ? undefined : "1" })}
            className={chipClassName(params.done === "1")}
            scroll={false}
          >
            Show done{params.done === "1" ? ` · ${formatCount(board.doneCount)}` : ""}
          </Link>
        </div>

        <ActionSections
          actions={board.actions}
          today={board.today}
          hideWhenDone={params.done !== "1"}
          empty={
            mine
              ? {
                  title: "You're all clear",
                  description:
                    "Add the next action above. Every step for a villa gets an owner and a date.",
                }
              : {
                  title: "Nothing open here",
                  description:
                    "Add the next action above. Every step for a villa gets an owner and a date.",
                }
          }
        />
      </div>
    </DesignBoardProvider>
  );
}
