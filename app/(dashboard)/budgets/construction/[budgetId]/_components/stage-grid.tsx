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
 * but the text its lines carry, so "adding a stage" is just naming one
 * and putting the first items in it.
 */
export function StageGrid({
  planId,
  stages,
  categories,
  brands,
}: {
  planId: string;
  stages: ConstructionStageGroup[];
  categories: Option[];
  brands: Option[];
}) {
  // Which stage the picker is open for — an existing one, or the name
  // just typed into the add-stage form below.
  const [pickerStage, setPickerStage] = useState<string | null>(null);
  const [newStage, setNewStage] = useState("");

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
          onAddItems={() => setPickerStage(group.stage)}
        />
      ))}

      {/* Adding a stage = naming it and picking its first items. Nothing
          is created until the picker commits, so an abandoned name costs
          nothing. */}
      <div className="border-border bg-surface flex flex-wrap items-end gap-2 rounded-2xl border p-4">
        <div className="min-w-[220px] flex-1 space-y-1.5">
          <label
            htmlFor="new-stage"
            className="text-muted text-xs font-semibold tracking-widest uppercase"
          >
            {stages.length === 0 ? "First stage" : "Add a stage"}
          </label>
          <Input
            id="new-stage"
            value={newStage}
            onChange={(event) => setNewStage(event.target.value)}
            placeholder="Foundation"
            autoComplete="off"
          />
        </div>
        <Button
          variant="secondary"
          disabled={!newStage.trim()}
          onClick={() => setPickerStage(newStage.trim())}
        >
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
  onAddItems,
}: {
  planId: string;
  group: ConstructionStageGroup;
  onAddItems: () => void;
}) {
  return (
    <section className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <StageName planId={planId} stage={group.stage} />
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

/** The stage heading, renameable in place — a rename is one UPDATE over
 * the stage's lines, and renaming onto another stage's name merges them. */
function StageName({ planId, stage }: { planId: string; stage: string }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(stage);
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  const commit = () => {
    setEditing(false);
    const next = value.trim();
    if (!next || next === stage) {
      setValue(stage);
      return;
    }
    startTransition(async () => {
      const result = await renameStage(planId, stage, next);
      if (result?.error) {
        setError(result.error);
        setValue(stage);
      }
    });
  };

  if (editing) {
    return (
      <Input
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
          if (event.key === "Escape") {
            setValue(stage);
            setEditing(false);
          }
        }}
        autoFocus
        className="h-9 w-56"
        aria-label={`Rename stage ${stage}`}
      />
    );
  }

  return (
    <div className="flex items-center gap-1.5">
      <h2
        className={`text-foreground text-lg font-bold tracking-tight ${pending ? "opacity-50" : ""}`}
      >
        {value}
      </h2>
      <IconButton aria-label={`Rename stage ${stage}`} onClick={() => setEditing(true)}>
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
