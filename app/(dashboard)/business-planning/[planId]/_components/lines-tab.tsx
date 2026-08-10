"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { IconButton } from "@/components/ui/icon-button";
import {
  newSaleLine,
  type PlanInputs,
  type PlanLine,
  type SaleLine,
} from "@/lib/business-planning/inputs";
import type { ScenarioResult } from "@/lib/business-planning/model";
import { formatCrore, formatQuantity } from "@/lib/format";
import { ChevronDown, ChevronRight, Layers, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { SaleLineForm } from "./sale-line-form";

/**
 * The lines. "Some projects may just be one thing, other projects will
 * be a mix of some" — so this is a list you add to, not a fixed set of
 * columns.
 *
 * Each card's header carries that line's live revenue and profit, so
 * what a line contributes is readable without opening it. One line is
 * open at a time: these are twenty-field forms, and three of them
 * unfolded at once is a page nobody can find anything in.
 */
export function LinesTab({
  inputs,
  result,
  onChange,
}: {
  inputs: PlanInputs;
  result: ScenarioResult;
  onChange: (patch: Partial<PlanInputs>) => void;
}) {
  const [openId, setOpenId] = useState<string | null>(inputs.lines[0]?.id ?? null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  function addSaleLine() {
    const line = newSaleLine(`Line ${inputs.lines.length + 1}`);
    onChange({ lines: [...inputs.lines, line] });
    setOpenId(line.id);
  }

  function updateLine(id: string, patch: Partial<SaleLine>) {
    onChange({
      lines: inputs.lines.map((line) =>
        line.id === id ? ({ ...line, ...patch } as PlanLine) : line,
      ),
    });
  }

  function removeLine(id: string) {
    onChange({ lines: inputs.lines.filter((line) => line.id !== id) });
    setConfirmingId(null);
    if (openId === id) setOpenId(null);
  }

  if (inputs.lines.length === 0) {
    return (
      <EmptyState
        icon={Layers}
        title="No lines yet"
        description="A line is one product: plotted development, row houses, apartments, commercial. Add the first and the summary starts filling in."
        action={<Button onClick={addSaleLine}>Add a line</Button>}
      />
    );
  }

  return (
    <div className="space-y-3">
      {inputs.lines.map((line) => {
        const lineResult = result.lines.find((row) => row.id === line.id);
        const open = openId === line.id;
        const confirming = confirmingId === line.id;

        return (
          <Card key={line.id} className="overflow-hidden">
            <div className="flex items-start gap-2 p-4">
              <button
                type="button"
                onClick={() => setOpenId(open ? null : line.id)}
                aria-expanded={open}
                className="focus-visible:ring-accent min-w-0 flex-1 rounded-lg text-left focus-visible:ring-2 focus-visible:outline-none"
              >
                <div className="flex flex-wrap items-center gap-2">
                  {open ? (
                    <ChevronDown className="text-muted size-4 shrink-0" />
                  ) : (
                    <ChevronRight className="text-muted size-4 shrink-0" />
                  )}
                  <span className="text-foreground truncate font-medium">
                    {line.name || "Untitled line"}
                  </span>
                  <Badge variant="neutral">Sale</Badge>
                </div>
                {lineResult ? (
                  <div className="text-muted mt-1 flex flex-wrap gap-x-4 gap-y-0.5 pl-6 text-xs">
                    <span>
                      {formatQuantity(lineResult.unitsSold)} units ·{" "}
                      <span className="text-foreground font-mono">
                        {formatCrore(lineResult.revenue)}
                      </span>{" "}
                      revenue
                    </span>
                    <span>
                      gross{" "}
                      <span className="text-foreground font-mono">
                        {formatCrore(lineResult.grossProfit)}
                      </span>
                    </span>
                    {lineResult.unitsUnsold > 0.0001 ? (
                      <span className="text-warning">
                        {formatQuantity(lineResult.unitsUnsold)} unsold at the horizon
                      </span>
                    ) : null}
                  </div>
                ) : null}
              </button>
              <IconButton
                aria-label={`Remove ${line.name || "line"}`}
                tone="danger"
                size="sm"
                onClick={() => setConfirmingId(confirming ? null : line.id)}
              >
                <Trash2 className="size-4" />
              </IconButton>
            </div>

            {/* Confirm inline rather than in a dialog: a line is one of
                several on the page, and a modal loses which one. */}
            {confirming ? (
              <div className="border-border bg-danger/5 flex flex-wrap items-center justify-between gap-2 border-t px-4 py-3">
                <p className="text-sm">Remove “{line.name || "this line"}” and everything in it?</p>
                <div className="flex gap-2">
                  <Button variant="secondary" size="sm" onClick={() => setConfirmingId(null)}>
                    Keep it
                  </Button>
                  <Button size="sm" onClick={() => removeLine(line.id)}>
                    Remove
                  </Button>
                </div>
              </div>
            ) : null}

            {open && line.kind === "sale" ? (
              <div className="border-border border-t px-4 pt-3 pb-4">
                <SaleLineForm
                  line={line}
                  plan={inputs}
                  result={lineResult}
                  otherLineCount={inputs.lines.length - 1}
                  onChange={(patch) => updateLine(line.id, patch)}
                />
              </div>
            ) : null}
          </Card>
        );
      })}

      <button
        type="button"
        onClick={addSaleLine}
        className="border-border text-muted hover:border-accent hover:text-accent flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed py-3 text-sm font-medium transition-colors"
      >
        <Plus className="size-4" />
        Add a line
      </button>
    </div>
  );
}
