import { Card } from "@/components/ui/card";
import { PageTitle } from "@/components/ui/page-title";
import { requireAdmin } from "@/lib/auth/access";
import { requireUser } from "@/lib/auth/dal";
import { readToolArrangement } from "@/lib/nav/queries";
import { TOOL_ICONS, TOOLS } from "@/lib/tools";
import { NewTeamDialog } from "../_components/new-team-dialog";
import { SettingsNav } from "../_components/settings-nav";
import { TeamRow } from "../_components/team-row";
import { ToolTeamSelect } from "../_components/tool-team-select";

// Reads with the throwing form: an empty list from a failed read would look like "no teams yet" and invite duplicates.
export default async function SettingsTeamsPage() {
  const user = await requireUser();
  await requireAdmin(user);

  const { teams, teamOf } = await readToolArrangement();
  const known = new Set(teams.map((team) => team.id));
  const toolCount = new Map<string, number>();
  for (const tool of TOOLS) {
    const teamId = teamOf[tool.href];
    if (teamId) toolCount.set(teamId, (toolCount.get(teamId) ?? 0) + 1);
  }

  return (
    <div className="space-y-4">
      <PageTitle
        title="Settings"
        description="Teams are the headings in everyone's sidebar. They only arrange the tools — what each person can open still comes from their apps and role."
      />
      <SettingsNav active="teams" />

      <Card className="space-y-3 p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="text-muted text-[11px] font-medium tracking-[0.14em] uppercase">Teams</p>
            <p className="text-muted mt-1 text-sm">
              In sidebar order — the arrows move a team up or down. A team with no tools is not
              shown in the sidebar.
            </p>
          </div>
          <NewTeamDialog />
        </div>

        {teams.length === 0 ? (
          <p className="text-muted text-sm">
            No teams yet — every tool sits under Other. Make one to start sorting.
          </p>
        ) : (
          <ul className="divide-border border-border divide-y rounded-xl border">
            {teams.map((team, index) => (
              <TeamRow
                key={team.id}
                team={team}
                toolCount={toolCount.get(team.id) ?? 0}
                isFirst={index === 0}
                isLast={index === teams.length - 1}
              />
            ))}
          </ul>
        )}
      </Card>

      <Card className="space-y-3 p-4">
        <div>
          <p className="text-muted text-[11px] font-medium tracking-[0.14em] uppercase">Tools</p>
          <p className="text-muted mt-1 text-sm">
            Pick the team each tool sits under — it saves straight away. A tool with no team sits
            under Other, at the bottom of the sidebar.
          </p>
        </div>

        <ul className="divide-border border-border divide-y rounded-xl border">
          {TOOLS.map((tool) => {
            const Icon = TOOL_ICONS[tool.icon];
            const teamId = teamOf[tool.href];
            return (
              <li
                key={tool.href}
                className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-3 py-2.5"
              >
                <span className="flex min-w-0 items-center gap-2.5">
                  <span className="bg-accent/10 text-accent flex size-8 shrink-0 items-center justify-center rounded-lg">
                    <Icon className="size-4" />
                  </span>
                  <span className="text-foreground truncate text-sm font-medium">{tool.name}</span>
                </span>
                <ToolTeamSelect
                  // Keyed by the saved team so a change made elsewhere resets the picker.
                  key={teamId ?? "other"}
                  app={tool.href}
                  toolName={tool.name}
                  // A row pointing at a gone team reads as Other, as the sidebar draws it.
                  teamId={teamId && known.has(teamId) ? teamId : null}
                  teams={teams}
                />
              </li>
            );
          })}
        </ul>
      </Card>
    </div>
  );
}
