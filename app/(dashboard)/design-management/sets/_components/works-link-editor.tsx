"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FormMessage } from "@/components/ui/form-message";
import { setDrawingSetWorks } from "@/lib/design-management/actions";
import type { WorksTreeCategory } from "@/lib/masters/works";
import { useMemo, useState, useTransition } from "react";

import { WorksCheckboxTree } from "../../_components/works-checkbox-tree";

/**
 * The set's default work links: a checkbox tree over the works
 * vocabulary (lib/masters/works.ts — categories, groups and their
 * items), written as one whole-list diff on Save
 * (setDrawingSetWorks — insert/delete, there is no update).
 *
 * These are the *default* links a new revision copies from; the plan's
 * "customizable on release" happens on the revision itself while it's
 * still a draft (step 4), not here.
 */
export function WorksLinkEditor({
  setId,
  tree,
  linkedWorkItemIds,
}: {
  setId: string;
  tree: WorksTreeCategory[];
  linkedWorkItemIds: string[];
}) {
  const [checked, setChecked] = useState<Set<string>>(() => new Set(linkedWorkItemIds));
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();
  const [justSaved, setJustSaved] = useState(false);

  const dirty = useMemo(() => {
    const original = new Set(linkedWorkItemIds);
    if (original.size !== checked.size) return true;
    for (const id of checked) if (!original.has(id)) return true;
    return false;
  }, [checked, linkedWorkItemIds]);

  const toggle = (id: string) => {
    setJustSaved(false);
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // The category ticker: set the whole list one way, never toggle each —
  // toggling a mixed selection would invert it instead of completing it.
  const setMany = (ids: string[], check: boolean) => {
    setJustSaved(false);
    setChecked((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (check) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  };

  const save = () => {
    setError(undefined);
    startTransition(async () => {
      const result = await setDrawingSetWorks(setId, [...checked]);
      if (result?.error) setError(result.error);
      else setJustSaved(true);
    });
  };

  return (
    <Card className="space-y-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-muted text-xs font-semibold tracking-widest uppercase">
            Works this set serves
          </p>
          <p className="text-muted mt-1 text-sm">
            A new revision starts from this list — still editable per villa while a revision is a
            draft.
          </p>
        </div>
        <Badge variant="neutral">{checked.size} picked</Badge>
      </div>

      <WorksCheckboxTree
        tree={tree}
        checked={checked}
        onToggle={toggle}
        onSetMany={setMany}
        disabled={pending}
      />

      <div className="flex items-center gap-3">
        <Button type="button" disabled={!dirty || pending} onClick={save}>
          {pending ? "Saving…" : "Save work links"}
        </Button>
        {justSaved && !dirty && <FormMessage success="Saved." />}
        <FormMessage error={error} />
      </div>
    </Card>
  );
}
