"use client";

import { Select } from "@/components/ui/select";
import type { ToolTeam } from "@/lib/nav/arrange";
import { setToolTeam } from "@/lib/settings/teams-actions";
import { useActionRunner } from "@/lib/hooks/use-action-runner";
import { useState } from "react";

const OTHER = "";

export function ToolTeamSelect({
  app,
  toolName,
  teamId,
  teams,
}: {
  app: string;
  toolName: string;
  teamId: string | null;
  teams: ToolTeam[];
}) {
  const { pending: isPending, error, run } = useActionRunner();
  const [value, setValue] = useState(teamId ?? OTHER);

  return (
    <div className="flex w-full flex-col gap-1 sm:w-56">
      <Select
        aria-label={`Team for ${toolName}`}
        value={value}
        disabled={isPending}
        className="h-10"
        onChange={async (event) => {
          const next = event.target.value;
          const previous = value;
          setValue(next);

          const result = await run(() => setToolTeam(app, next === OTHER ? null : next));
          if (result?.error) {
            setValue(previous);
          }
        }}
      >
        {teams.map((team) => (
          <option key={team.id} value={team.id}>
            {team.name}
          </option>
        ))}
        <option value={OTHER}>No team (Other)</option>
      </Select>
      {error && (
        <span role="alert" className="text-danger text-xs">
          {error}
        </span>
      )}
    </div>
  );
}
