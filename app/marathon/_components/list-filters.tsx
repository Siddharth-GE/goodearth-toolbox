"use client";

import { Button, LinkButton } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { useState } from "react";

type Group = { id: string; name: string };
type Run = { id: string; name: string };
type Category = { id: string; run_id: string; name: string };

export function ListFilters({
  groups,
  runs,
  categories,
  initialGroup,
  initialRun,
  initialCategory,
  hasFilter,
}: {
  groups: Group[];
  runs: Run[];
  categories: Category[];
  initialGroup?: string;
  initialRun?: string;
  initialCategory?: string;
  hasFilter: boolean;
}) {
  const [groupId, setGroupId] = useState(initialGroup ?? "");
  const [runId, setRunId] = useState(initialRun ?? "");
  const [categoryId, setCategoryId] = useState(initialCategory ?? "");

  // Only offer categories that belong to the currently picked race — the
  // Fun Run only ever has "Open", so the rest would just be noise (and
  // couldn't match anything). Live, so it updates as soon as Race is
  // picked, before Filter is even tapped.
  const visibleCategories = runId ? categories.filter((c) => c.run_id === runId) : categories;

  function handleRunChange(value: string) {
    setRunId(value);
    if (!visibleCategories.some((c) => c.id === categoryId && c.run_id === value)) {
      setCategoryId("");
    }
  }

  return (
    <form method="GET" className="mb-4 space-y-2 rounded-2xl border border-border bg-surface p-3.5">
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
        Same guard as the registration form: the visible dropdowns above
        are display-only, and these hidden fields (driven by the same
        state) are what actually get submitted, so a stray tap on a
        <select> can't change what's filtered.
      */}
      <input type="hidden" name="group" value={groupId} />
      <input type="hidden" name="run" value={runId} />
      <input type="hidden" name="category" value={categoryId} />

      <div className="flex gap-2 pt-1">
        <Button type="submit" className="flex-1">
          Filter
        </Button>
        {hasFilter && (
          <LinkButton href="/marathon/list" variant="secondary" className="h-10 px-4">
            Clear
          </LinkButton>
        )}
      </div>
    </form>
  );
}
