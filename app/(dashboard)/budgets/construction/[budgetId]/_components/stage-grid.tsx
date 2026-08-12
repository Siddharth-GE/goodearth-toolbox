"use client";

import { CataloguePickerDialog } from "@/components/masters/catalogue-picker";
import { ItemThumb } from "@/components/masters/item-thumb";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { FormMessage } from "@/components/ui/form-message";
import { IconButton } from "@/components/ui/icon-button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/components/ui/table";
import { Select } from "@/components/ui/select";
import type { ConstructionLineRow, ConstructionStageGroup } from "@/lib/budgets/construction";
import {
  addConstructionLines,
  removeConstructionLine,
  renameStage,
  updateConstructionLine,
} from "@/lib/budgets/construction-actions";
import { formatCount } from "@/lib/format";
import { useSaveOnBlur } from "@/lib/hooks/use-save-on-blur";
import { HardHat, Pencil, Trash2 } from "lucide-react";
import { useState, useTransition } from "react";

type Option = { id: string; name: string };

/**
 * The stage-wise plan editor: one section per stage, rows saved on blur,
 * items added through the shared catalogue picker — a stage is nothing
 * but the text its lines carry, so "adding a stage" is picking one from
 * the construction stages master (0053; managed in Masters → Stages)
 * and putting the first items in it. Picked, never typed — the founder's
 * rule, and the database enforces it either way.
 */
export function StageGrid({
  planId,
  stages,
  stageOptions,
  categories,
  brands,
}: {
  planId: string;
  stages: ConstructionStageGroup[];
  /** Active names from the construction stages master. */
  stageOptions: string[];
  categories: Option[];
  brands: Option[];
}) {
  // Which stage the picker is open for — an existing one, or the one
  // just picked in the add-stage form below.
  const [pickerStage, setPickerStage] = useState<string | null>(null);
  const [newStage, setNewStage] = useState("");

  const unusedStages = stageOptions.filter((name) => !stages.some((group) => group.stage === name));

  return (
    <div className="space-y-6">
      {stages.length === 0 && (
        <EmptyState
          icon={HardHat}
          title="No stages yet"
          description="Name the first stage below — Foundation, say — and add its materials."
        />
      )}

      {stages.map((group) => (
        <StageSection
          key={group.stage}
          planId={planId}
          group={group}
          stageOptions={stageOptions}
          onAddItems={() => setPickerStage(group.stage)}
        />
      ))}

      {/* Adding a stage = picking it and choosing its first items.
          Nothing is created until the picker commits, so an abandoned
          pick costs nothing. */}
      <div className="border-border bg-surface flex flex-wrap items-end gap-2 rounded-2xl border p-4">
        <div className="min-w-[220px] flex-1 space-y-1.5">
          <label
            htmlFor="new-stage"
            className="text-muted text-xs font-semibold tracking-widest uppercase"
          >
            {stages.length === 0 ? "First stage" : "Add a stage"}
          </label>
          <Select
            id="new-stage"
            value={newStage}
            onChange={(event) => setNewStage(event.target.value)}
          >
            <option value="">
              {unusedStages.length === 0 ? "Every stage is already in the plan" : "Pick a stage…"}
            </option>
            {unusedStages.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </Select>
        </div>
        <Button variant="secondary" disabled={!newStage} onClick={() => setPickerStage(newStage)}>
          Add items…
        </Button>
      </div>

      <CataloguePickerDialog
        open={pickerStage !== null}
        onOpenChange={(open) => {
          if (!open) setPickerStage(null);
        }}
        title={pickerStage ? `Add items — ${pickerStage}` : "Add items"}
        targetLabel={pickerStage ? `the “${pickerStage}” stage` : "this stage"}
        categories={categories}
        brands={brands}
        onCommit={async (lines) => {
          if (!pickerStage) return undefined;
          const result = await addConstructionLines(
            planId,
            pickerStage,
            lines.map((line) => ({ itemId: line.item.id, quantity: line.quantity })),
          );
          if (!result?.error) setNewStage("");
          return result;
        }}
      />
    </div>
  );
}

function StageSection({
  planId,
  group,
  stageOptions,
  onAddItems,
}: {
  planId: string;
  group: ConstructionStageGroup;
  stageOptions: string[];
  onAddItems: () => void;
}) {
  return (
    <section className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <StageName planId={planId} stage={group.stage} stageOptions={stageOptions} />
        <div className="flex items-center gap-3">
          <span className="text-muted text-xs">
            {formatCount(group.lines.length)} {group.lines.length === 1 ? "line" : "lines"}
          </span>
          <Button size="sm" variant="secondary" onClick={onAddItems}>
            Add items
          </Button>
        </div>
      </div>
      <Table>
        <TableHead>
          <TableRow>
            <TableHeaderCell className="w-14"></TableHeaderCell>
            <TableHeaderCell>Item</TableHeaderCell>
            <TableHeaderCell className="w-28">Qty</TableHeaderCell>
            <TableHeaderCell className="w-20">Unit</TableHeaderCell>
            <TableHeaderCell>Note</TableHeaderCell>
            <TableHeaderCell className="w-12"></TableHeaderCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {group.lines.map((line) => (
            // Keyed on quantity too: the picker can raise an existing
            // line's quantity server-side, and a remount is the honest way
            // to show it — the row's own edits never revalidate, so this
            // can't steal focus mid-typing.
            <LineRow key={`${line.id}-${line.quantity}`} planId={planId} line={line} />
          ))}
        </TableBody>
      </Table>
    </section>
  );
}

/** The stage heading, movable to another stage from the master list —
 * one UPDATE over the stage's lines, and moving onto a stage already in
 * the plan merges the two sections. */
function StageName({
  planId,
  stage,
  stageOptions,
}: {
  planId: string;
  stage: string;
  stageOptions: string[];
}) {
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  const commit = (next: string) => {
    setEditing(false);
    if (!next || next === stage) return;
    startTransition(async () => {
      const result = await renameStage(planId, stage, next);
      if (result?.error) setError(result.error);
    });
  };

  if (editing) {
    return (
      <Select
        value={stage}
        onChange={(event) => commit(event.target.value)}
        onBlur={() => setEditing(false)}
        onKeyDown={(event) => {
          if (event.key === "Escape") setEditing(false);
        }}
        autoFocus
        className="h-9 w-56"
        aria-label={`Move the ${stage} lines to another stage`}
      >
        {/* The current name stays pickable even if deactivated since. */}
        {!stageOptions.includes(stage) && <option value={stage}>{stage}</option>}
        {stageOptions.map((name) => (
          <option key={name} value={name}>
            {name}
          </option>
        ))}
      </Select>
    );
  }

  return (
    <div className="flex items-center gap-1.5">
      <h2
        className={`text-foreground text-lg font-bold tracking-tight ${pending ? "opacity-50" : ""}`}
      >
        {stage}
      </h2>
      <IconButton
        aria-label={`Move the ${stage} lines to another stage`}
        onClick={() => setEditing(true)}
      >
        <Pencil className="size-3.5" />
      </IconButton>
      <FormMessage error={error} size="xs" />
    </div>
  );
}

function LineRow({ planId, line }: { planId: string; line: ConstructionLineRow }) {
  const [quantity, setQuantity] = useState(String(line.quantity));
  const [note, setNote] = useState(line.note ?? "");
  const [removing, startTransition] = useTransition();

  const { flush, error, setError } = useSaveOnBlur({
    initial: { quantity: line.quantity, note: line.note ?? "" },
    validate: ({ quantity: value }) =>
      Number.isFinite(value) && value > 0 ? undefined : "Quantity must be more than 0",
    save: ({ quantity: value, note: text }) =>
      updateConstructionLine(line.id, { quantity: value, note: text || null }),
  });

  const save = () => {
    const parsed = Number(quantity.trim());
    if (!Number.isFinite(parsed) || !(parsed > 0)) {
      setQuantity(String(line.quantity));
    }
    flush({ quantity: parsed, note });
  };

  return (
    <TableRow className={removing ? "opacity-50" : undefined}>
      <TableCell>
        <ItemThumb
          code={line.item_code}
          name={line.item_name}
          thumbUrl={line.item_thumb_url}
          sizes="48px"
          className="w-10"
        />
      </TableCell>
      <TableCell>
        <span className="text-foreground font-medium">{line.item_name}</span>
        <div className="text-muted text-xs">
          {line.item_code ?? "—"}
          {line.item_brand && <span className="ml-2">{line.item_brand}</span>}
        </div>
      </TableCell>
      <TableCell>
        <Input
          type="number"
          step="any"
          min="0"
          value={quantity}
          onChange={(event) => setQuantity(event.target.value)}
          onBlur={save}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur();
          }}
          className="h-9"
          aria-label={`Quantity for ${line.item_name}`}
        />
        <FormMessage error={error} size="xs" className="mt-1" />
      </TableCell>
      <TableCell className="text-muted">{line.uom}</TableCell>
      <TableCell>
        <Input
          value={note}
          onChange={(event) => setNote(event.target.value)}
          onBlur={save}
          placeholder="—"
          className="h-9"
          aria-label={`Note for ${line.item_name}`}
        />
      </TableCell>
      <TableCell>
        <IconButton
          aria-label={`Remove ${line.item_name}`}
          tone="danger"
          disabled={removing}
          onClick={() =>
            startTransition(async () => {
              const result = await removeConstructionLine(planId, line.id);
              if (result?.error) setError(result.error);
            })
          }
        >
          <Trash2 className="size-4" />
        </IconButton>
      </TableCell>
    </TableRow>
  );
}
