"use client";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FormMessage } from "@/components/ui/form-message";
import { IconButton } from "@/components/ui/icon-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { openTrail } from "@/lib/pusher/actions";
import { Plus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

type Leg = { label: string; assigneeId: string; expectedDays: number };

const BLANK_LEG: Leg = { label: "", assigneeId: "", expectedDays: 2 };

/**
 * Opening a trail. The whole design goal is thirty seconds for a repeat:
 * pick the activity, and its legs arrive prefilled from the last time
 * anyone ran it. Everything is editable before it opens; nothing is
 * editable behind the baton afterwards.
 */
export function OpenTrailForm({
  projects,
  units,
  activities,
  people,
  prefills,
}: {
  projects: { id: string; name: string }[];
  units: { id: string; name: string; project_id: string }[];
  activities: { id: string; name: string }[];
  people: { id: string; name: string }[];
  /** Last-run legs per activity, sent with the page so picking one is instant. */
  prefills: Record<string, Leg[]>;
}) {
  const router = useRouter();
  const [projectId, setProjectId] = useState("");
  const [unitId, setUnitId] = useState("");
  const [activityId, setActivityId] = useState("");
  const [title, setTitle] = useState("");
  const [legs, setLegs] = useState<Leg[]>([]);
  const [prefilled, setPrefilled] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const projectUnits = units.filter((u) => u.project_id === projectId);

  const pickActivity = (id: string) => {
    setActivityId(id);
    if (!id) {
      setLegs([]);
      setPrefilled(false);
      return;
    }
    const previous = prefills[id] ?? [];
    setLegs(previous.length > 0 ? previous.map((leg) => ({ ...leg })) : [{ ...BLANK_LEG }]);
    setPrefilled(previous.length > 0);
  };

  const setLeg = (index: number, patch: Partial<Leg>) =>
    setLegs((current) => current.map((leg, i) => (i === index ? { ...leg, ...patch } : leg)));

  const submit = () =>
    startTransition(async () => {
      setError(null);
      const result = await openTrail({
        projectId,
        unitId: unitId || null,
        activityId,
        title: title.trim() || null,
        note: null,
        legs,
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      router.push(`/pusher/trails/${result.chainId}`);
    });

  return (
    <Card className="space-y-4 p-5">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="project">Project</Label>
          <Select
            id="project"
            className="mt-1 w-full"
            value={projectId}
            onChange={(e) => {
              setProjectId(e.target.value);
              setUnitId("");
            }}
          >
            <option value="">Choose…</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </div>

        <div>
          <Label htmlFor="unit">Unit</Label>
          <Select
            id="unit"
            className="mt-1 w-full"
            value={unitId}
            disabled={!projectId}
            onChange={(e) => setUnitId(e.target.value)}
          >
            <option value="">The project as a whole</option>
            {projectUnits.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </Select>
        </div>

        <div>
          <Label htmlFor="activity">Activity</Label>
          <Select
            id="activity"
            className="mt-1 w-full"
            value={activityId}
            onChange={(e) => pickActivity(e.target.value)}
          >
            <option value="">Choose…</option>
            {activities.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </Select>
        </div>

        <div>
          <Label htmlFor="title">
            Title <span className="text-muted font-normal">(optional)</span>
          </Label>
          <Input
            id="title"
            className="mt-1 w-full"
            placeholder="e.g. R1 set"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>
      </div>

      {!activityId ? (
        <p className="text-muted border-border rounded-xl border border-dashed p-4 text-center text-sm">
          Pick an activity — the legs from the last time anyone ran it will fill in here.
        </p>
      ) : (
        <div className="space-y-3">
          {prefilled && (
            <p className="text-muted bg-background border-border rounded-xl border p-3 text-sm">
              Legs filled in from the last run of{" "}
              <b className="text-foreground font-semibold">
                {activities.find((a) => a.id === activityId)?.name}
              </b>
              . Change anything before you open it.
            </p>
          )}

          <div>
            <Label>Legs — what happens, who does it, how many days</Label>
            <div className="mt-2 space-y-2">
              {legs.map((leg, i) => (
                <div
                  key={i}
                  className="grid grid-cols-[1.5rem_1fr_2.5rem] items-center gap-2 sm:grid-cols-[1.5rem_minmax(0,1.4fr)_minmax(0,1fr)_4.5rem_2.5rem]"
                >
                  <span className="text-muted text-center font-mono text-xs">{i + 1}</span>
                  <Input
                    aria-label={`Leg ${i + 1} name`}
                    placeholder="What happens here"
                    value={leg.label}
                    onChange={(e) => setLeg(i, { label: e.target.value })}
                    className="col-span-2 sm:col-span-1"
                  />
                  <Select
                    aria-label={`Leg ${i + 1} person`}
                    value={leg.assigneeId}
                    onChange={(e) => setLeg(i, { assigneeId: e.target.value })}
                    className="col-start-2 sm:col-start-auto"
                  >
                    <option value="">Who?</option>
                    {people.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </Select>
                  <Input
                    aria-label={`Leg ${i + 1} expected days`}
                    type="number"
                    min={1}
                    step={1}
                    value={leg.expectedDays}
                    onChange={(e) => setLeg(i, { expectedDays: Number(e.target.value) })}
                    className="text-center font-mono"
                  />
                  <IconButton
                    aria-label={`Remove leg ${i + 1}`}
                    tone="danger"
                    onClick={() => setLegs((c) => c.filter((_, index) => index !== i))}
                    disabled={legs.length === 1}
                  >
                    <X className="size-4" />
                  </IconButton>
                </div>
              ))}
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="mt-2"
              onClick={() => setLegs((c) => [...c, { ...BLANK_LEG }])}
            >
              <Plus className="size-4" /> Add a leg
            </Button>
          </div>

          <FormMessage error={error} />

          <div className="flex justify-end">
            <Button onClick={submit} disabled={pending || legs.length === 0}>
              {pending ? "Opening…" : "Open the trail"}
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
