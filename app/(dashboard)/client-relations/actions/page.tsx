import { chipClassName } from "@/components/ui/choice-chips";
import { getActionsBoard } from "@/lib/client-relations/next-steps-queries";
import { formatCount } from "@/lib/format";
import { Leaf } from "lucide-react";
import Link from "next/link";

import { BoardProvider } from "../_components/board-context";
import { FilterChips, Greeting, StepSections, TeamStrip } from "../_components/board-parts";
import { Composer } from "../_components/composer";

/**
 * The Saarang tracker's main screen: every promise to a client, with an
 * owner and a date, sorted by how late it is (root plan.md, seventh piece).
 *
 * A manager (an admin) opens on everyone, with the team strip; everyone
 * else opens on their own list, under a greeting, and can switch to
 * everyone's (founder, 2026-10-16: "anyone with access can see is ok").
 * Every filter lives in the URL.
 */
export default async function ActionsPage({
  searchParams,
}: {
  searchParams: Promise<{ project?: string; kaadal?: string; who?: string; done?: string }>;
}) {
  const params = await searchParams;
  const board = await getActionsBoard({
    project: params.project,
    kaadal: params.kaadal === "1",
    who: params.who,
    showDone: params.done === "1",
  });

  const defaultWho = board.me.isManager ? "all" : board.me.id;
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
    ? `Your actions${params.project || params.kaadal ? " here" : ""}. Stuck on something only a manager can clear? Use ••• → Waiting on management.`
    : board.who === "mgmt"
      ? "What is waiting on management"
      : viewing
        ? `${viewing.name.split(" ")[0]}'s actions`
        : "Everyone's actions";

  return (
    <BoardProvider
      today={board.today}
      team={board.team}
      plots={board.plots}
      openByOwner={openByOwner}
      meId={board.me.id}
    >
      <div className="space-y-4">
        {board.me.isManager ? (
          <TeamStrip
            loads={board.loads}
            management={board.management}
            who={board.who}
            hrefFor={hrefForWho}
            kpis={board.kpis}
          />
        ) : (
          <Greeting name={board.me.name} hour={board.hour} load={board.myLoad} />
        )}

        <div className="flex flex-wrap items-center justify-between gap-2">
          <FilterChips
            label="Which plots"
            items={[
              ...(board.projects.length > 1
                ? [
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
                  ]
                : []),
              {
                key: "kaadal",
                label: (
                  <>
                    <Leaf className="size-3.5" /> Kaadal only
                  </>
                ),
                href: href({ kaadal: params.kaadal === "1" ? undefined : "1" }),
                on: params.kaadal === "1",
              },
            ]}
          />
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
            {!mine && board.who !== defaultWho ? (
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
