"use client";

import { AnimatedReveal } from "@/components/ui/animated-reveal";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { createEntry, type EntryState } from "@/lib/marathon/actions";
import { useActionState, useState } from "react";
import { CategoryBadge } from "./category-badge";

type Group = { id: string; name: string };
type Run = { id: string; name: string; distance_km: number | null };
type Category = {
  id: string;
  run_id: string;
  name: string;
  gender: "male" | "female" | null;
  min_age: number | null;
  max_age: number | null;
  bib_prefix: string;
  color: string;
};

function matchCategory(categories: Category[], runId: string, age: number, gender: string) {
  return (
    categories.find(
      (c) =>
        c.run_id === runId &&
        (c.gender === null || c.gender === gender) &&
        (c.min_age === null || age >= c.min_age) &&
        (c.max_age === null || age <= c.max_age),
    ) ?? null
  );
}

export function EntryForm({
  groups,
  runs,
  categories,
}: {
  groups: Group[];
  runs: Run[];
  categories: Category[];
}) {
  const [state, formAction, pending] = useActionState<EntryState, FormData>(createEntry, undefined);

  // Every field is controlled: React resets a form's uncontrolled fields
  // after any action submission (including a "duplicate, confirm?" reply
  // that isn't really an error), so an uncontrolled field would visibly
  // clear right when the agent needs to tap Save a second time.
  const [groupId, setGroupId] = useState("");
  const [name, setName] = useState("");
  const [mobile, setMobile] = useState("");
  const [runId, setRunId] = useState("");
  const [age, setAge] = useState("");
  const [gender, setGender] = useState("");
  const [teeSize, setTeeSize] = useState("");

  const [confirmed, setConfirmed] = useState(false);
  // Sync `confirmed` from the action's result without an Effect: react to
  // the state object changing during render, not after commit, so a fresh
  // duplicate warning always shows the confirm step exactly once.
  const [handledState, setHandledState] = useState(state);
  if (state !== handledState) {
    setHandledState(state);
    setConfirmed(Boolean(state?.duplicate));
  }

  const ageNum = Number(age);
  const category =
    runId && gender && Number.isInteger(ageNum) && ageNum >= 3 && ageNum <= 99
      ? matchCategory(categories, runId, ageNum, gender)
      : null;
  const showNoMatch = runId && gender && Number.isInteger(ageNum) && ageNum >= 3 && ageNum <= 99 && !category;

  return (
    <form action={formAction} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="group">Group</Label>
        <Select id="group" required value={groupId} onChange={(e) => setGroupId(e.target.value)}>
          <option value="" disabled>
            Select a group
          </option>
          {groups.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="name">Full Name</Label>
        <Input
          id="name"
          name="name"
          required
          maxLength={80}
          autoComplete="off"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="mobile">Mobile Number</Label>
        <Input
          id="mobile"
          name="mobile"
          inputMode="numeric"
          maxLength={10}
          required
          autoComplete="off"
          value={mobile}
          onChange={(e) => {
            setMobile(e.target.value);
            setConfirmed(false);
          }}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="age">Age</Label>
          <Input
            id="age"
            name="age"
            type="number"
            min={3}
            max={99}
            required
            value={age}
            onChange={(e) => setAge(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="gender">Gender</Label>
          <Select id="gender" required value={gender} onChange={(e) => setGender(e.target.value)}>
            <option value="" disabled>
              Select
            </option>
            <option value="male">Male</option>
            <option value="female">Female</option>
          </Select>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="teeSize">T-Shirt Size</Label>
        <Select id="teeSize" required value={teeSize} onChange={(e) => setTeeSize(e.target.value)}>
          <option value="" disabled>
            Select a size
          </option>
          {["XS", "S", "M", "L", "XL", "XXL"].map((size) => (
            <option key={size} value={size}>
              {size}
            </option>
          ))}
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="run">Run Type</Label>
        <Select id="run" required value={runId} onChange={(e) => setRunId(e.target.value)}>
          <option value="" disabled>
            Select a run
          </option>
          {runs.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </Select>
      </div>

      <AnimatedReveal show={Boolean(category)}>
        {category && (
          <Card className="p-4">
            <CategoryBadge name={category.name} color={category.color} />
            <p className="mt-2 text-sm text-muted">
              Bib will start with <span className="font-bold text-foreground">{category.bib_prefix}</span> —
              exact number assigned when you save.
            </p>
          </Card>
        )}
      </AnimatedReveal>
      <AnimatedReveal show={Boolean(showNoMatch)}>
        {showNoMatch && (
          <Card className="p-4">
            <p className="text-sm text-muted">No matching category — check age and gender.</p>
          </Card>
        )}
      </AnimatedReveal>

      <AnimatedReveal show={Boolean(state?.error)}>
        {state?.error && (
          <p className={`text-sm font-medium ${state.duplicate ? "text-warning" : "text-danger"}`}>
            {state.error}
          </p>
        )}
      </AnimatedReveal>

      {/*
        The four dropdowns above are display-only (no `name`) — what
        actually gets submitted comes only from React state via these
        hidden fields. That's deliberate: a stray tap or scroll on a
        <select> right before saving must never change the bib category
        that gets recorded. State already drives the live preview above,
        so the agent sees exactly what these fields will submit.
      */}
      <input type="hidden" name="group" value={groupId} />
      <input type="hidden" name="gender" value={gender} />
      <input type="hidden" name="teeSize" value={teeSize} />
      <input type="hidden" name="run" value={runId} />
      {confirmed && <input type="hidden" name="confirmed" value="1" />}

      {/*
        Sticky, not fixed: stays pinned to the bottom of the viewport as
        the form scrolls (registering a runner is the single most-repeated
        action in the app), but still sits inside normal document flow so
        it doesn't need extra bottom padding tricks elsewhere on the page.
      */}
      <div className="sticky bottom-0 -mx-5 border-t border-border bg-background/95 px-5 py-3 backdrop-blur">
        <Button type="submit" disabled={pending} className="w-full">
          {pending ? "Saving…" : confirmed ? "Yes, Save Anyway" : "Save & Get Bib"}
        </Button>
      </div>
    </form>
  );
}
