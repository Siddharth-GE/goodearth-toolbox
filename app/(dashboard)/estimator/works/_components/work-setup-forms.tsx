"use client";

import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/form-message";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchSelect } from "@/components/ui/search-select";
import { chosenUom, componentOptions } from "../../_components/component-options";
import { Checkbox } from "@/components/ui/checkbox";
import { addWorkComponent, copyWorkSetup, saveWorkInfo } from "@/lib/estimator/works-actions";
import { UomSelect } from "../../_components/uom-select";
import type { MixRow } from "@/lib/estimator/mixes-queries";
import type { MaterialItemRow } from "@/lib/estimator/shared";
import type { WorkSetup } from "@/lib/estimator/works-queries";
import { useActionState, useEffect, useMemo, useRef, useState, useTransition } from "react";

/**
 * The work's unit and labour rate.
 *
 * Changing the unit once estimate lines exist would silently change what
 * every one of those quantities means — 40 "cum" becoming 40 "sqm" is
 * the same number describing a different building — so the unit is
 * locked while any estimate uses the work (saveWorkInfo refuses it too).
 */
export function WorkInfoForm({ work, uoms }: { work: WorkSetup; uoms: string[] }) {
  const [state, formAction, pending] = useActionState(
    saveWorkInfo.bind(null, work.workItemId),
    undefined,
  );
  const [uom, setUom] = useState(work.uom ?? "");
  const locked = work.uom !== null && work.lineCount > 0;

  return (
    <form action={formAction} className="space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <div className="w-44 space-y-1.5">
          <Label htmlFor="uom">Measured in</Label>
          <UomSelect
            id="uom"
            name={locked ? undefined : "uom"}
            uoms={uoms}
            current={work.uom}
            value={uom}
            onChange={(event) => setUom(event.target.value)}
            disabled={locked}
            required
          />
          {/* A disabled select sends nothing; the locked unit still goes. */}
          {locked && <input type="hidden" name="uom" value={work.uom ?? ""} />}
        </div>
        <div className="w-44 space-y-1.5">
          <Label htmlFor="labour_rate">Labour rate</Label>
          <Input
            id="labour_rate"
            name="labour_rate"
            defaultValue={work.labourRate ?? ""}
            autoComplete="off"
            inputMode="decimal"
            placeholder="e.g. 900"
          />
        </div>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : work.uom === null ? "Set up" : "Save"}
        </Button>
      </div>
      <p className="text-muted text-xs">
        The labour rate is per {uom.trim() || "unit"}. Leave it blank if it isn&apos;t priced yet —
        estimates will say the cost is unknown rather than counting the labour as free.
      </p>
      {locked && (
        <p className="text-muted text-sm">
          Measured in {work.uom} on {work.lineCount} estimate{" "}
          {work.lineCount === 1 ? "line" : "lines"}, so the unit stays — changing it would change
          what those quantities mean.
        </p>
      )}
      <FormMessage error={state?.error} />
    </form>
  );
}

/** Add one thing to the recipe: a material, or a whole mix. */
export function AddWorkComponentForm({
  workItemId,
  workUom,
  materials,
  mixes,
}: {
  workItemId: string;
  workUom: string;
  materials: MaterialItemRow[];
  mixes: MixRow[];
}) {
  const [state, formAction, pending] = useActionState(
    addWorkComponent.bind(null, workItemId),
    undefined,
  );
  const formRef = useRef<HTMLFormElement>(null);
  const wasPending = useRef(false);
  const [choice, setChoice] = useState("");

  useEffect(() => {
    if (wasPending.current && !pending && !state?.error) {
      formRef.current?.reset();
      setChoice("");
    }
    wasPending.current = pending;
  }, [pending, state]);

  const options = useMemo(
    () =>
      componentOptions(
        materials.filter((material) => material.isActive),
        mixes.filter((mix) => mix.isActive),
      ),
    [materials, mixes],
  );
  const uomOfChoice = chosenUom(choice, materials, mixes);

  return (
    <form ref={formRef} action={formAction} className="space-y-2">
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-56 flex-1 space-y-1.5">
          <Label htmlFor="component">Material or mix</Label>
          <SearchSelect
            id="component"
            name="component"
            value={choice}
            onChange={setChoice}
            options={options}
            placeholder="Type to find a mix or material…"
          />
        </div>
        <div className="w-40 space-y-1.5">
          <Label htmlFor="qty_per_unit">Quantity</Label>
          <Input
            id="qty_per_unit"
            name="qty_per_unit"
            required
            autoComplete="off"
            inputMode="decimal"
            placeholder="e.g. 1"
          />
        </div>
        <Button type="submit" disabled={pending}>
          {pending ? "Adding…" : "Add"}
        </Button>
      </div>
      <p className="text-muted text-xs">
        {uomOfChoice
          ? `How many ${uomOfChoice} are needed for one ${workUom} of this work.`
          : `Quantities are per one ${workUom} of this work.`}
      </p>
      <FormMessage error={state?.error} />
    </form>
  );
}

/**
 * Copy this work's rate — unit, labour and materials — onto other works.
 * Its floor twins (the same work on another floor) come ticked; any other
 * work can be added by name.
 */
export function CopyRateForm({
  workItemId,
  twins,
  allWorks,
}: {
  workItemId: string;
  twins: { id: string; code: string; name: string; group: string | null }[];
  allWorks: { id: string; code: string; name: string; group: string | null }[];
}) {
  const [picked, setPicked] = useState<string[]>(twins.map((twin) => twin.id));
  const [extra, setExtra] = useState<typeof allWorks>([]);
  const [adding, setAdding] = useState("");
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<{ error?: string; done?: string }>();

  const listed = useMemo(() => [...twins, ...extra], [twins, extra]);
  const options = useMemo(
    () =>
      allWorks
        .filter((work) => work.id !== workItemId && !listed.some((row) => row.id === work.id))
        .map((work) => ({
          value: work.id,
          label: `${work.code} — ${work.name}`,
          hint: work.group ?? undefined,
        })),
    [allWorks, listed, workItemId],
  );

  const toggle = (id: string, on: boolean) =>
    setPicked((current) => (on ? [...current, id] : current.filter((row) => row !== id)));

  return (
    <div className="space-y-3">
      {listed.length > 0 && (
        <ul className="space-y-1.5">
          {listed.map((work) => (
            <li key={work.id}>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={picked.includes(work.id)}
                  onChange={(event) => toggle(work.id, event.target.checked)}
                />
                <span className="text-foreground">
                  {work.code} — {work.name}
                </span>
                {work.group && <span className="text-muted text-xs">{work.group}</span>}
              </label>
            </li>
          ))}
        </ul>
      )}
      <SearchSelect
        value={adding}
        onChange={(id) => {
          const work = allWorks.find((row) => row.id === id);
          if (work) {
            setExtra((current) => [...current, work]);
            setPicked((current) => [...current, work.id]);
          }
          setAdding("");
        }}
        options={options}
        placeholder="Add another work…"
        className="max-w-md"
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          disabled={pending || picked.length === 0}
          onClick={() =>
            startTransition(async () => {
              const outcome = await copyWorkSetup(workItemId, picked);
              setResult(
                outcome?.error
                  ? { error: outcome.error }
                  : {
                      done: `Copied to ${picked.length} ${picked.length === 1 ? "work" : "works"}.`,
                    },
              );
            })
          }
        >
          {pending
            ? "Copying…"
            : `Copy to ${picked.length} ${picked.length === 1 ? "work" : "works"}`}
        </Button>
        {result?.done && <span className="text-success text-sm">{result.done}</span>}
      </div>
      <p className="text-muted text-xs">
        Each ticked work gets this unit, labour rate and materials — its own materials are replaced,
        not added to.
      </p>
      <FormMessage error={result?.error} />
    </div>
  );
}
