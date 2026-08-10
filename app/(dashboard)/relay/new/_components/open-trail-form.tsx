"use client";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FormMessage } from "@/components/ui/form-message";
import { IconButton } from "@/components/ui/icon-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { openTrail } from "@/lib/relay/actions";
import { Plus, X } from "lucide-react";

import { DepartmentPicker } from "../../_components/department-picker";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

type Leg = { activityId: string; assigneeId: string; expectedDays: number };

const BLANK_LEG: Leg = { activityId: "", assigneeId: "", expectedDays: 2 };

/**
 * Opening a trail.
 *
 * A trail is an ordered list of ACTIVITIES (0043), each with a person and
 * a number of days — the leg IS the activity, so there is nothing to
 * type. Pick a trail type and the whole list arrives, staffed from
 * whoever last carried each activity; or build one activity at a time.
 *
 * Everything is editable before it opens. Nothing behind the baton is
 * editable afterwards.
 */
export function OpenTrailForm({
  projects,
  units,
  activities,
  departments,
  people,
  trailSets,
  activityDefaults,
  initialProjectId,
  initialUnitId,
}: {
  projects: { id: string; name: string }[];
  units: { id: string; name: string; project_id: string }[];
  activities: { id: string; name: string }[];
  departments: { id: string; name: string }[];
  people: { id: string; name: string }[];
  /** The named trail types, each with its fixed activities in order. */
  trailSets: {
    id: string;
    name: string;
    activities: { activityId: string; activityName: string; expectedDays: number }[];
  }[];
  /** Per activity: who normally carries it and for how long. Sent up front so picking is instant. */
  activityDefaults: Record<string, { assigneeId: string; expectedDays: number }>;
  /** Set when the form is opened from a house, so the two pickers arrive answered. */
  initialProjectId?: string;
  initialUnitId?: string;
}) {
  const router = useRouter();
  const [projectId, setProjectId] = useState(initialProjectId ?? "");
  const [unitId, setUnitId] = useState(initialUnitId ?? "");
  const [trailSetId, setTrailSetId] = useState("");
  const [title, setTitle] = useState("");
  const [legs, setLegs] = useState<Leg[]>([{ ...BLANK_LEG }]);
  const [departmentIds, setDepartmentIds] = useState<string[]>([]);
  const [startNow, setStartNow] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const projectUnits = units.filter((u) => u.project_id === projectId);

  /** Picking a type replaces the whole list; picking none leaves it alone. */
  const pickTrailSet = (id: string) => {
    setTrailSetId(id);
    if (!id) return;
    const set = trailSets.find((s) => s.id === id);
    if (!set || set.activities.length === 0) return;
    setLegs(
      set.activities.map((a) => ({
        activityId: a.activityId,
        // Whoever last carried this activity anywhere — better evidence
        // than the last whole trail that happened to mention it.
        assigneeId: activityDefaults[a.activityId]?.assigneeId ?? "",
        expectedDays: a.expectedDays,
      })),
    );
    if (!title) setTitle(set.name);
  };

  /** Choosing an activity fills in who normally does it, and for how long. */
  const pickActivityForLeg = (index: number, activityId: string) => {
    const preset = activityDefaults[activityId];
    setLegs((current) =>
      current.map((leg, i) =>
        i === index
          ? {
              activityId,
              assigneeId: leg.assigneeId || (preset?.assigneeId ?? ""),
              expectedDays: preset?.expectedDays ?? leg.expectedDays,
            }
          : leg,
      ),
    );
  };

  const setLeg = (index: number, patch: Partial<Leg>) =>
    setLegs((current) => current.map((leg, i) => (i === index ? { ...leg, ...patch } : leg)));

  const submit = () =>
    startTransition(async () => {
      setError(null);
      const result = await openTrail({
        projectId,
        unitId: unitId || null,
        // A one-step trail still has a single activity worth recording;
        // anything longer has no one answer, and the column is nullable
        // for exactly that reason.
        activityId: legs.length === 1 ? legs[0].activityId : null,
        trailSetId: trailSetId || null,
        title: title.trim() || null,
        note: null,
        legs,
        departmentIds,
        start: startNow,
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      router.push(`/relay/trails/${result.chainId}`);
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
          <Label htmlFor="trail-type">
            Trail type <span className="text-muted font-normal">(optional)</span>
          </Label>
          <Select
            id="trail-type"
            className="mt-1 w-full"
            value={trailSetId}
            onChange={(e) => pickTrailSet(e.target.value)}
          >
            <option value="">Build it activity by activity</option>
            {trailSets.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.activities.length})
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

      <div className="space-y-3">
        {trailSetId && (
          <p className="text-muted bg-background border-border rounded-xl border p-3 text-sm">
            Filled in from{" "}
            <b className="text-foreground font-semibold">
              {trailSets.find((s) => s.id === trailSetId)?.name}
            </b>
            , with whoever last carried each activity. Change anything before you open it.
          </p>
        )}

        <div>
          <Label>Departments</Label>
          <p className="text-muted mt-0.5 mb-2 text-xs">
            Pick every department this touches — a trail can cross more than one.
          </p>
          <DepartmentPicker
            departments={departments}
            selected={departmentIds}
            onChange={setDepartmentIds}
          />
        </div>

        <div>
          <Label>Activities — what happens, who does it, how many days</Label>
          <div className="mt-2 space-y-2">
            {legs.map((leg, i) => (
              <div
                key={i}
                className="grid grid-cols-[1.5rem_1fr_2.5rem] items-center gap-2 sm:grid-cols-[1.5rem_minmax(0,1.4fr)_minmax(0,1fr)_4.5rem_2.5rem]"
              >
                <span className="text-muted text-center font-mono text-xs">{i + 1}</span>
                <Select
                  aria-label={`Step ${i + 1} activity`}
                  value={leg.activityId}
                  onChange={(e) => pickActivityForLeg(i, e.target.value)}
                  className="col-span-2 sm:col-span-1"
                >
                  <option value="">Which activity?</option>
                  {activities.map((a) => (
                    <option
                      key={a.id}
                      value={a.id}
                      // The same activity twice would send the baton
                      // through identical steps; the action refuses it
                      // and this stops it being offered in the first place.
                      disabled={a.id !== leg.activityId && legs.some((l) => l.activityId === a.id)}
                    >
                      {a.name}
                    </option>
                  ))}
                </Select>
                <Select
                  aria-label={`Step ${i + 1} person`}
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
                  aria-label={`Step ${i + 1} expected days`}
                  type="number"
                  min={1}
                  step={1}
                  value={leg.expectedDays}
                  onChange={(e) => setLeg(i, { expectedDays: Number(e.target.value) })}
                  className="text-center font-mono"
                />
                <IconButton
                  aria-label={`Remove step ${i + 1}`}
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
            <Plus className="size-4" /> Add an activity
          </Button>
        </div>

        <FormMessage error={error} />

        <div className="flex flex-wrap items-center justify-end gap-3">
          {/* The queue, kept by the founder: lay a house's trail out
                now and begin it when the site is actually ready. */}
          <label className="text-muted flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={startNow}
              onChange={(e) => setStartNow(e.target.checked)}
              className="accent-accent size-4"
            />
            Start it now
          </label>
          <Button onClick={submit} disabled={pending || legs.length === 0}>
            {pending ? "Opening…" : startNow ? "Open the trail" : "Lay it out"}
          </Button>
        </div>
      </div>
    </Card>
  );
}
