import { chipClassName } from "@/components/ui/choice-chips";
import { getActionsBoard } from "@/lib/client-relations/next-steps-queries";
import { trackForSide } from "@/lib/client-relations/stages";
import { formatCount } from "@/lib/format";
import Link from "next/link";

import { BoardProvider } from "../_components/board-context";
import { FilterChips, Greeting, StepSections, TeamStrip } from "../_components/board-parts";
import { Composer } from "../_components/composer";
import { SideMark } from "../_components/side-mark";

/**
 * The Saarang tracker's main screen: every promise to a client, with an
 * owner and a date, sorted by how late it is (root plan.md, seventh piece).
 *
 * An admin or a team lead opens on everyone, with the team strip; everyone
 * else sees only the work assigned to them (0123) and opens on their own
 * list, under a greeting, with a switch to everything they can see — what
 * they set for others and what sits on their plots. Every filter lives in
 * the URL — the side too: each plot has a Construction and an Interior
 * side, with their own owners and their own actions.
 */
export default async function ActionsPage({
  searchParams,
}: {
  searchParams: Promise<{ project?: string; side?: string; who?: string; done?: string }>;
}) {
  const params = await searchParams;
  const side = trackForSide(params.side);
  const board = await getActionsBoard({
    project: params.project,
    side,
    who: params.who,
    showDone: params.done === "1",
  });

  const defaultWho = board.me.seesAll ? "all" : board.me.id;
  const href = (patch: Partial<typeof params>) => {
    const next = { ...params, ...patch };
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(next)) if (value) query.set(key, value);
    const search = query.toString();
    return search ? `/client-relations/actions?${search}` : "/client-relations/actions";
  };
  const hrefForWho = (who: string) => href({ who: who === defaultWho ? undefined : who });

  const openByOwner = Object.fromEntries(
    board.loads.map(({ person, load }) => [person.id, load.open]),
  );
  const viewing = board.team.find((person) => person.id === board.who) ?? null;
  const onTeam = board.team.some((person) => person.id === board.me.id);
  const defaultOwner = viewing?.id ?? (onTeam ? board.me.id : null);
  const mine = board.who === board.me.id;

  const whoLine = mine
    ? `Your actions${params.project || side ? " here" : ""}. Stuck on something only a manager can clear? Use ••• → Waiting on management.`
    : board.who === "mgmt"
      ? "What is waiting on management"
      : viewing
        ? `${viewing.name.split(" ")[0]}'s actions`
        : board.me.seesAll
          ? "Everyone's actions"
          : "Everything you can see: your actions, the ones you set, and those on your plots";

  return (
    <BoardProvider
      today={board.today}
      team={board.team}
      plots={board.plots}
      openByOwner={openByOwner}
      meId={board.me.id}
      isManager={board.me.isManager}
      seesAll={board.me.seesAll}
    >
      <div className="space-y-4">
        {board.me.seesAll ? (
          <TeamStrip
            loads={board.loads}
            management={board.management}
            who={board.who}
            hrefFor={hrefForWho}
            kpis={board.kpis}
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
          <div className="flex flex-wrap items-center gap-2">
            {board.projects.length > 1 ? (
              <FilterChips
                label="Which plots"
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
            ) : null}
            <FilterChips
              label="Which side"
              items={[
                { key: "both", label: "Both sides", href: href({ side: undefined }), on: !side },
                {
                  key: "construction",
                  label: <SideMark track="sales" />,
                  href: href({ side: "construction" }),
                  on: side === "sales",
                },
                {
                  key: "interior",
                  label: <SideMark track="kaadal" />,
                  href: href({ side: "interior" }),
                  on: side === "kaadal",
                },
              ]}
            />
          </div>
          {board.me.seesAll ? null : (
            <FilterChips
              label="Whose actions"
              items={[
                { key: "mine", label: "Mine", href: hrefForWho(board.me.id), on: mine },
                {
                  key: "all",
                  label: "All I see",
                  href: hrefForWho("all"),
                  on: board.who === "all",
                },
              ]}
            />
          )}
        </div>

        <Composer
          key={`${board.who}-${side ?? "both"}`}
          defaultOwner={defaultOwner}
          defaultTrack={side ?? "sales"}
        />

        <div className="text-muted flex flex-wrap items-center justify-between gap-2 text-sm">
          <span>
            {whoLine}
            {!mine && board.who !== defaultWho ? (
              <>
                {" · "}
                <Link
                  href={hrefForWho(defaultWho)}
                  className="text-accent font-medium hover:underline"
                >
                  {board.me.seesAll ? "Show everyone" : "Show mine"}
                </Link>
              </>
            ) : null}
          </span>
          <Link
            href={href({ done: params.done === "1" ? undefined : "1" })}
            className={chipClassName(params.done === "1")}
            scroll={false}
          >
            Show done · {formatCount(board.doneCount)}
          </Link>
        </div>

        <StepSections
          steps={board.steps}
          today={board.today}
          hideWhenDone={params.done !== "1"}
          empty={
            mine
              ? {
                  title: "You're all clear",
                  description:
                    "Add the next action above. Every promise to a client gets an owner and a date.",
                }
              : {
                  title: "Nothing open here",
                  description:
                    "Add the next action above. Every promise to a client gets an owner and a date.",
                }
          }
        />
      </div>
    </BoardProvider>
  );
}
