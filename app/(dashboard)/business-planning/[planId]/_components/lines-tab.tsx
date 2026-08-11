"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { IconButton } from "@/components/ui/icon-button";
import {
  newHoldLine,
  newSaleLine,
  type HoldLine,
  type PlanInputs,
  type PlanLine,
  type SaleLine,
} from "@/lib/business-planning/inputs";
import type { ScenarioResult } from "@/lib/business-planning/model";
import { formatCrore, formatPercent, formatQuantity } from "@/lib/format";
import { ChevronDown, ChevronRight, Layers, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { HoldLineForm } from "./hold-line-form";
import { SaleLineForm } from "./sale-line-form";

/**
 * The lines. "Some projects may just be one thing, other projects will
 * be a mix of some" — so this is a list you add to, not a fixed set of
 * columns.
 *
 * Two kinds cover every product the founder named. A SALE line is
 * plotted development, row houses, villas, apartments or commercial you
 * sell; a HOLD line is senior living, leased commercial or hospitality.
 * The name is yours — two SALE lines can behave completely differently.
 *
 * Each card's header carries that line's live figures, so what a line
 * contributes is readable without opening it. One line is open at a
 * time: these are twenty-field forms, and three of them unfolded at once
 * is a page nobody can find anything in.
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

  function addLine(kind: "sale" | "hold") {
    const name = `Line ${inputs.lines.length + 1}`;
    const line = kind === "sale" ? newSaleLine(name) : newHoldLine(name);
    onChange({ lines: [...inputs.lines, line] });
    setOpenId(line.id);
  }

  function updateLine(id: string, patch: Partial<SaleLine> | Partial<HoldLine>) {
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
        description="A line is one product. Add one you SELL — plotted development, row houses, apartments, commercial — or one you HOLD and earn from, like senior living. The summary fills in as you go."
        action={
          <div className="flex gap-2">
            <Button onClick={() => addLine("sale")}>Add a line you sell</Button>
            <Button variant="secondary" onClick={() => addLine("hold")}>
              Add one you hold
            </Button>
          </div>
        }
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
                  <Badge variant="neutral">{line.kind === "sale" ? "Sale" : "Hold"}</Badge>
                  {lineResult?.kind === "hold" && lineResult.capex > 0 ? (
                    <Badge variant={lineResult.verdict === "hold" ? "success" : "warning"}>
                      {lineResult.verdict === "hold" ? "Hold it" : "Sell it"}
                    </Badge>
                  ) : null}
                </div>
                {lineResult?.kind === "sale" ? (
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
                        {formatCrore(lineResult.matchedProfit)}
                      </span>{" "}
                      at{" "}
                      <span className="text-foreground font-mono">
                        {formatPercent(lineResult.marginPct)}
                      </span>
                    </span>
                    {lineResult.unitsUnsold > 0.0001 ? (
                      <span className="text-warning">
                        {formatQuantity(lineResult.unitsUnsold)} unsold at the horizon
                      </span>
                    ) : null}
                  </div>
                ) : null}
                {lineResult?.kind === "hold" ? (
                  <div className="text-muted mt-1 flex flex-wrap gap-x-4 gap-y-0.5 pl-6 text-xs">
                    <span>
                      {formatQuantity(line.kind === "hold" ? line.units : 0)} units · capex{" "}
                      <span className="text-foreground font-mono">
                        {formatCrore(lineResult.capex)}
                      </span>
                    </span>
                    <span>
                      NOI{" "}
                      <span className="text-foreground font-mono">
                        {formatCrore(lineResult.stabilisedNoi)}
                      </span>{" "}
                      a year
                    </span>
                    <span>
                      worth{" "}
                      <span className="text-foreground font-mono">
                        {formatCrore(Math.max(lineResult.holdValue, lineResult.sellValue))}
                      </span>
                    </span>
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

            {open ? (
              <div className="border-border border-t px-4 pt-3 pb-4">
                {line.kind === "sale" ? (
                  <SaleLineForm
                    line={line}
                    plan={inputs}
                    result={lineResult?.kind === "sale" ? lineResult : undefined}
                    otherLineCount={inputs.lines.length - 1}
                    onChange={(patch) => updateLine(line.id, patch)}
                  />
                ) : (
                  <HoldLineForm
                    line={line}
                    result={lineResult?.kind === "hold" ? lineResult : undefined}
                    onChange={(patch) => updateLine(line.id, patch)}
                  />
                )}
              </div>
            ) : null}
          </Card>
        );
      })}

      <div className="grid gap-3 sm:grid-cols-2">
        <AddLineButton onClick={() => addLine("sale")} label="Add a line you sell" />
        <AddLineButton onClick={() => addLine("hold")} label="Add a line you hold" />
      </div>
    </div>
  );
}

function AddLineButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="border-border text-muted hover:border-accent hover:text-accent flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed py-3 text-sm font-medium transition-colors"
    >
      <Plus className="size-4" />
      {label}
    </button>
  );
}
