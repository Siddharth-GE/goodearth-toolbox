"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { savePlan } from "@/lib/business-planning/actions";
import type { PlanInputs, ScenarioIndex } from "@/lib/business-planning/inputs";
import { runPlan, velocityOutOfOrder } from "@/lib/business-planning/model";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CashflowTable } from "./cashflow-table";
import { LinesTab } from "./lines-tab";
import { SensitivityGrid } from "./sensitivity-grid";
import { SetupTab } from "./setup-tab";
import { SummaryStrip } from "./summary-strip";
import { SummaryTab } from "./summary-tab";

/**
 * The plan editor: one client component that owns the whole document. Every figure comes from
 * `runPlan(inputs)` recomputed on each keystroke, before anything is saved; the list page runs
 * the same pure engine.
 */

/** Long enough not to save mid-word, short enough to survive a closed tab. */
const SAVE_DELAY_MS = 800;

export function PlanEditor({ planId, initial }: { planId: string; initial: PlanInputs }) {
  const [inputs, setInputs] = useState(initial);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");

  const result = useMemo(() => runPlan(inputs), [inputs]);

  // Autosave on a timer, not on blur: dozens of tiny numbers are tabbed through in a run.
  // `pending` holds the newest document so the timer never sends a stale closure; `inFlight`
  // stops two saves overlapping and landing out of order.
  const pending = useRef(inputs);
  const inFlight = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dirty = useRef(false);

  const flush = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      // A loop: anything typed while a save is in the air is sent next, not left behind.
      while (dirty.current) {
        dirty.current = false;
        const snapshot = pending.current;
        setSaveState("saving");
        const outcome = await savePlan(planId, snapshot);
        if (outcome?.error) {
          // Back in the queue; the next keystroke or the unmount retries.
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
      // Written here, not in a setState updater: updaters run during render and Strict Mode double-invokes them.
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

  // Closing the tab: best effort, the browser may not wait.
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
        velocityWarning={velocityOutOfOrder(inputs)}
      />

      {/* Radix Tabs, not NavTabs: switching panels must not navigate. */}
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
        <TabsContent value="summary" className="space-y-4">
          <SummaryTab result={result} activeScenario={inputs.activeScenario} />
          {inputs.lines.length > 0 ? <SensitivityGrid inputs={inputs} /> : null}
        </TabsContent>
      </Tabs>
    </div>
  );
}
