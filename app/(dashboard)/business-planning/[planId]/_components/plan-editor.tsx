"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { savePlan } from "@/lib/business-planning/actions";
import type { PlanInputs, ScenarioIndex } from "@/lib/business-planning/inputs";
import { runPlan } from "@/lib/business-planning/model";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CashflowTable } from "./cashflow-table";
import { LinesTab } from "./lines-tab";
import { SetupTab } from "./setup-tab";
import { SummaryStrip } from "./summary-strip";
import { SummaryTab } from "./summary-tab";

/**
 * The plan editor: one client component that owns the whole document.
 *
 * Every figure on this page comes from `runPlan(inputs)` recomputed on
 * each keystroke, before anything is saved. That is the point of the
 * tool — the founder's workbook recalculated instantly and any version
 * of this that made you press Save to see the answer would be worse than
 * the spreadsheet it replaces.
 *
 * The engine is pure and imported directly, so the number here and the
 * number the list page renders come from the same code and cannot
 * disagree.
 */

/** Long enough not to save mid-word, short enough to survive a closed tab. */
const SAVE_DELAY_MS = 800;

export function PlanEditor({ planId, initial }: { planId: string; initial: PlanInputs }) {
  const [inputs, setInputs] = useState(initial);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");

  const result = useMemo(() => runPlan(inputs), [inputs]);

  // ---- Autosave -----------------------------------------------------
  // A timer rather than save-on-blur: the fields here are dozens of tiny
  // numbers tabbed through in a run, and a round trip per tab-out makes
  // fast editing feel slow (the same call Budgets' pricing grid makes,
  // in the other direction — there a row is a unit of work, here the
  // whole document is).
  //
  // `pending` holds the newest document; the timer always sends that,
  // never a stale closure. `inFlight` stops two saves overlapping and
  // landing out of order.
  const pending = useRef(inputs);
  const inFlight = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dirty = useRef(false);

  const flush = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      // A loop, not a recursive call: anything typed while a save is in
      // the air marks the document dirty again, and this sends the newer
      // version rather than leaving it behind.
      while (dirty.current) {
        dirty.current = false;
        const snapshot = pending.current;
        setSaveState("saving");
        const outcome = await savePlan(planId, snapshot);
        if (outcome?.error) {
          // Back in the queue. The document is still on screen, and the
          // next keystroke or the unmount will try again.
          dirty.current = true;
          setSaveState("error");
          return;
        }
        setSaveState("saved");
      }
    } finally {
      inFlight.current = false;
    }
  }, [planId]);

  const update = useCallback(
    (patch: Partial<PlanInputs>) => {
      // `pending` is the source of truth for the next save, so it is
      // written here rather than inside a setState updater — an updater
      // runs during render, and mutating a ref there is exactly the kind
      // of thing that misbehaves under Strict Mode's double invoke.
      const next = { ...pending.current, ...patch };
      pending.current = next;
      dirty.current = true;
      setInputs(next);

      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void flush(), SAVE_DELAY_MS);
    },
    [flush],
  );

  // Leaving the page mid-edit must not lose the last few keystrokes.
  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
      if (dirty.current) void flush();
    };
  }, [flush]);

  // Same for closing the tab. Best-effort — the browser may not wait —
  // but the 800ms window is the only exposure and this closes most of it.
  useEffect(() => {
    function onHide() {
      if (document.visibilityState === "hidden" && dirty.current) void flush();
    }
    document.addEventListener("visibilitychange", onHide);
    return () => document.removeEventListener("visibilitychange", onHide);
  }, [flush]);

  return (
    <div className="space-y-4">
      <SummaryStrip
        result={result.active}
        activeScenario={inputs.activeScenario}
        onScenarioChange={(activeScenario: ScenarioIndex) => update({ activeScenario })}
        saveState={saveState}
      />

      {/* Radix Tabs, not NavTabs: switching panels must not navigate.
          A round trip between changing an assumption and seeing the
          answer is the thing this tool exists to remove. */}
      <Tabs defaultValue="lines" className="space-y-4">
        <TabsList>
          <TabsTrigger value="lines">Lines</TabsTrigger>
          <TabsTrigger value="setup">Setup</TabsTrigger>
          <TabsTrigger value="cashflow">Cashflow</TabsTrigger>
          <TabsTrigger value="summary">Summary</TabsTrigger>
        </TabsList>

        <TabsContent value="lines">
          <LinesTab inputs={inputs} result={result.active} onChange={update} />
        </TabsContent>
        <TabsContent value="setup">
          <SetupTab inputs={inputs} onChange={update} />
        </TabsContent>
        <TabsContent value="cashflow">
          <CashflowTable result={result.active} />
        </TabsContent>
        <TabsContent value="summary">
          <SummaryTab result={result} activeScenario={inputs.activeScenario} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
