"use client";

import { LinkButton } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { useState } from "react";

type Group = { id: string; name: string };
type Run = { id: string; name: string };
type Category = { id: string; run_id: string; name: string };
type Agent = { id: string; name: string };

export function AdminEntryFilters({
  groups,
  runs,
  categories,
  agents,
  initialGroup,
  initialRun,
  initialCategory,
  initialAgent,
  hasFilter,
}: {
  groups: Group[];
  runs: Run[];
  categories: Category[];
  agents: Agent[];
  initialGroup?: string;
  initialRun?: string;
  initialCategory?: string;
  initialAgent?: string;
  hasFilter: boolean;
}) {
  const [groupId, setGroupId] = useState(initialGroup ?? "");
  const [runId, setRunId] = useState(initialRun ?? "");
  const [categoryId, setCategoryId] = useState(initialCategory ?? "");
  const [agentId, setAgentId] = useState(initialAgent ?? "");

  // Same live-narrowing as the agent's My Entries filter: Category only
  // offers options that belong to the currently picked Race.
  const visibleCategories = runId ? categories.filter((c) => c.run_id === runId) : categories;

  function handleRunChange(value: string) {
    setRunId(value);
    if (!visibleCategories.some((c) => c.id === categoryId && c.run_id === value)) {
      setCategoryId("");
    }
  }

  return (
    <form method="GET" className="mb-4 space-y-2 rounded-2xl border border-border bg-surface p-3.5">
      <Select value={agentId} onChange={(e) => setAgentId(e.target.value)}>
        <option value="">All agents</option>
        {agents.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name}
          </option>
        ))}
      </Select>
      <Select value={groupId} onChange={(e) => setGroupId(e.target.value)}>
        <option value="">All groups</option>
        {groups.map((g) => (
          <option key={g.id} value={g.id}>
            {g.name}
          </option>
        ))}
      </Select>
      <Select value={runId} onChange={(e) => handleRunChange(e.target.value)}>
        <option value="">All races</option>
        {runs.map((r) => (
          <option key={r.id} value={r.id}>
            {r.name}
          </option>
        ))}
      </Select>
      <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
        <option value="">All categories</option>
        {visibleCategories.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </Select>

      {/*
        Same guard as the entry form and My Entries: the visible
        dropdowns are display-only, hidden fields (driven by the same
        state) are what actually submit.
      */}
      <input type="hidden" name="agent" value={agentId} />
      <input type="hidden" name="group" value={groupId} />
      <input type="hidden" name="run" value={runId} />
      <input type="hidden" name="category" value={categoryId} />

      <div className="flex gap-2 pt-1">
        <button type="submit" className="h-10 flex-1 rounded-xl bg-accent text-sm font-medium text-accent-foreground">
          Filter
        </button>
        {hasFilter && (
          <LinkButton href="/marathon/admin/entries" variant="secondary" className="h-10 px-4">
            Clear
          </LinkButton>
        )}
      </div>
    </form>
  );
}
