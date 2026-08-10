"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { FormMessage } from "@/components/ui/form-message";
import { IconButton } from "@/components/ui/icon-button";
import { Select } from "@/components/ui/select";
import { setTrailSetActive, setTrailSetActivities } from "@/lib/relay/actions";
import type { TrailSet } from "@/lib/relay/queries";
import { ArrowDown, ArrowUp, Plus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * One standard set and its ordered activities.
 *
 * The order matters and is not cosmetic: it is the order the trails land
 * on a house, which is the order someone will work down the queue.
 *
 * Every change writes the WHOLE list (setTrailSetActivities), so adding,
 * removing and reordering are one code path with one failure mode. A
 * diff would have to reason about a row that both moved and changed,
 * which is exactly where an ordering bug hides.
 */
export function SetEditor({
  set,
  activities,
}: {
  set: TrailSet;
  activities: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [adding, setAdding] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const items = set.activities.map((a) => ({
    activityId: a.activityId,
    expectedDays: a.expectedDays,
  }));
  const unused = activities.filter((a) => !items.some((i) => i.activityId === a.id));

  const save = async (next: { activityId: string; expectedDays: number }[]) => {
    setBusy(true);
    setError(null);
    const result = await setTrailSetActivities(set.id, next);
    setBusy(false);
    if (result?.error) {
      setError(result.error);
      return;
    }
    router.refresh();
  };

  const move = (from: number, to: number) => {
    if (to < 0 || to >= items.length) return;
    const next = [...items];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    void save(next);
  };

  const setDays = (activityId: string, expectedDays: number) =>
    void save(items.map((i) => (i.activityId === activityId ? { ...i, expectedDays } : i)));

  const toggleActive = async () => {
    setBusy(true);
    setError(null);
    const result = await setTrailSetActive(set.id, !set.isActive);
    setBusy(false);
    if (result?.error) {
      setError(result.error);
      return;
    }
    router.refresh();
  };

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="text-foreground text-base font-bold tracking-tight">{set.name}</h2>
        <span className="text-muted text-xs">
          {set.activities.length} activit{set.activities.length === 1 ? "y" : "ies"}
        </span>
        <span className="ml-auto flex items-center gap-2">
          {!set.isActive && <Badge variant="neutral">Switched off</Badge>}
          <Button size="sm" variant="ghost" disabled={busy} onClick={toggleActive}>
            {set.isActive ? "Switch off" : "Switch on"}
          </Button>
        </span>
      </div>

      <FormMessage error={error} />

      {set.activities.length === 0 ? (
        <p className="text-muted border-border mt-3 rounded-xl border border-dashed p-4 text-center text-sm">
          Nothing in this type yet. Add the activities a house normally goes through, in the order
          they happen.
        </p>
      ) : (
        <ol className="divide-border mt-3 divide-y">
          {set.activities.map((item, i) => (
            <li key={item.itemId} className="flex items-center gap-2 py-2">
              <span className="text-muted w-5 text-center font-mono text-xs">{i + 1}</span>
              <span className="text-foreground min-w-0 flex-1 text-sm">{item.activityName}</span>
              {/* Days per activity, so picking a type fills in a plan
                  and not just a list of names. Editable again on the
                  trail itself before it starts. */}
              <Input
                aria-label={`${item.activityName} days`}
                type="number"
                min={1}
                step={1}
                defaultValue={item.expectedDays}
                disabled={busy}
                onBlur={(e) => {
                  const days = Number(e.target.value);
                  if (days !== item.expectedDays) setDays(item.activityId, days);
                }}
                className="w-16 text-center font-mono"
              />
              <span className="text-muted text-xs">days</span>
              <IconButton
                aria-label={`Move ${item.activityName} up`}
                disabled={busy || i === 0}
                onClick={() => move(i, i - 1)}
              >
                <ArrowUp className="size-4" />
              </IconButton>
              <IconButton
                aria-label={`Move ${item.activityName} down`}
                disabled={busy || i === set.activities.length - 1}
                onClick={() => move(i, i + 1)}
              >
                <ArrowDown className="size-4" />
              </IconButton>
              <IconButton
                tone="danger"
                aria-label={`Remove ${item.activityName}`}
                disabled={busy}
                onClick={() => void save(items.filter((i) => i.activityId !== item.activityId))}
              >
                <X className="size-4" />
              </IconButton>
            </li>
          ))}
        </ol>
      )}

      {unused.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Select
            aria-label={`Add an activity to ${set.name}`}
            value={adding}
            onChange={(e) => setAdding(e.target.value)}
            disabled={busy}
          >
            <option value="">Add an activity…</option>
            {unused.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </Select>
          <Button
            size="sm"
            variant="secondary"
            disabled={!adding || busy}
            onClick={() => {
              void save([...items, { activityId: adding, expectedDays: 2 }]);
              setAdding("");
            }}
          >
            <Plus className="size-4" /> Add
          </Button>
        </div>
      )}
    </Card>
  );
}
