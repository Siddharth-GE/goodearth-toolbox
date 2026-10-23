"use client";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ChoiceChips } from "@/components/ui/choice-chips";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { FormMessage } from "@/components/ui/form-message";
import { IconButton } from "@/components/ui/icon-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchSelect } from "@/components/ui/search-select";
import { Select } from "@/components/ui/select";
import { formatQuantity } from "@/lib/format";
import { useActionRunner } from "@/lib/hooks/use-action-runner";
import {
  addSequenceStage,
  moveSequenceStage,
  removeSequenceStage,
  setTypicalSqft,
  updateSequenceStage,
} from "@/lib/supervisors/sequence-actions";
import type { SequenceRow } from "@/lib/supervisors/sequence-queries";
import { SEQUENCE_LINKS, SEQUENCE_LINK_LABEL, type SequenceLink } from "@/lib/supervisors/schedule";
import { ArrowDown, ArrowUp, ChevronRight } from "lucide-react";
import { useState, type ReactNode } from "react";

function describe(row: SequenceRow): string {
  const parts = [
    row.followsGroupId
      ? `${row.link === "alongside" ? "Alongside" : "After"} ${row.followsLabel?.split(" ")[0] ?? "a stage"}`
      : "First — starts on the villa's start date",
    row.waitDays > 0 ? `then ${row.waitDays} ${row.waitDays === 1 ? "day" : "days"} wait` : null,
    row.typicalDays
      ? `${row.typicalDays} ${row.typicalDays === 1 ? "day" : "days"}`
      : "days not set",
  ];
  return parts.filter(Boolean).join(" · ");
}

/** Every stage in site order; a tap opens it, the arrows move it. */
export function SequenceList({ rows }: { rows: SequenceRow[] }) {
  const unset = rows.filter((row) => !row.typicalDays).length;
  return (
    <div className="space-y-2">
      {unset > 0 ? (
        <p className="text-muted text-sm">
          {`${unset} of ${rows.length} stages have no typical days yet. Until they do, a villa's dates stop at the first of them.`}
        </p>
      ) : null}
      <Card className="divide-border divide-y p-0">
        {rows.map((row, index) => (
          <div key={row.groupId} className="flex items-center gap-1 pr-2">
            <StageDialog
              row={row}
              rows={rows}
              trigger={
                <button
                  type="button"
                  className="hover:bg-foreground/[0.025] focus-visible:ring-accent/25 flex min-h-14 min-w-0 flex-1 items-center gap-3 px-4 py-2.5 text-left focus-visible:ring-4 focus-visible:outline-none"
                >
                  <span className="min-w-0 flex-1">
                    <span className="text-foreground block truncate text-sm font-medium">
                      <span className="text-muted font-mono text-xs">{row.code}</span> {row.name}
                    </span>
                    <span
                      className={`block truncate text-xs ${row.typicalDays ? "text-muted" : "text-warning"}`}
                    >
                      {describe(row)}
                    </span>
                  </span>
                  <ChevronRight className="text-muted size-4 shrink-0" aria-hidden />
                </button>
              }
            />
            <MoveButtons row={row} first={index === 0} last={index === rows.length - 1} />
          </div>
        ))}
      </Card>
    </div>
  );
}

function MoveButtons({ row, first, last }: { row: SequenceRow; first: boolean; last: boolean }) {
  const { pending, error, run } = useActionRunner();
  return (
    <div className="flex shrink-0 flex-col items-center">
      <div className="flex gap-0.5">
        <IconButton
          className="size-10"
          aria-label={`Move ${row.code} up`}
          disabled={pending || first}
          onClick={() => run(() => moveSequenceStage({ groupId: row.groupId, direction: "up" }))}
        >
          <ArrowUp className="size-4" aria-hidden />
        </IconButton>
        <IconButton
          className="size-10"
          aria-label={`Move ${row.code} down`}
          disabled={pending || last}
          onClick={() => run(() => moveSequenceStage({ groupId: row.groupId, direction: "down" }))}
        >
          <ArrowDown className="size-4" aria-hidden />
        </IconButton>
      </div>
      <FormMessage error={error} />
    </div>
  );
}

function StageDialog({
  row,
  rows,
  trigger,
}: {
  row: SequenceRow;
  rows: SequenceRow[];
  trigger: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [follows, setFollows] = useState(row.followsGroupId ?? "");
  const [link, setLink] = useState<SequenceLink>(row.link);
  const [waitDays, setWaitDays] = useState(String(row.waitDays));
  const [typicalDays, setTypicalDays] = useState(row.typicalDays ? String(row.typicalDays) : "");
  const { pending, error, run, clearError } = useActionRunner();

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) {
          setFollows(row.followsGroupId ?? "");
          setLink(row.link);
          setWaitDays(String(row.waitDays));
          setTypicalDays(row.typicalDays ? String(row.typicalDays) : "");
          clearError();
        }
        setOpen(next);
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{row.code}</DialogTitle>
          <DialogDescription>{row.name}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor={`follows-${row.groupId}`}>Follows</Label>
            <Select
              id={`follows-${row.groupId}`}
              value={follows}
              onChange={(event) => setFollows(event.target.value)}
            >
              <option value="">Nothing — the villa&apos;s first stage</option>
              {rows
                .filter((other) => other.groupId !== row.groupId)
                .map((other) => (
                  <option key={other.groupId} value={other.groupId}>
                    {`${other.code} ${other.name}`}
                  </option>
                ))}
            </Select>
          </div>
          {follows ? (
            <ChoiceChips
              label="Starts"
              options={SEQUENCE_LINKS.map((value) => ({
                value,
                label: SEQUENCE_LINK_LABEL[value],
              }))}
              value={link}
              onChange={(value) => value && setLink(value)}
              required
            />
          ) : null}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor={`wait-${row.groupId}`}>Wait days</Label>
              <Input
                id={`wait-${row.groupId}`}
                type="number"
                inputMode="numeric"
                min={0}
                value={waitDays}
                onChange={(event) => setWaitDays(event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`typical-${row.groupId}`}>Typical days</Label>
              <Input
                id={`typical-${row.groupId}`}
                type="number"
                inputMode="numeric"
                min={1}
                value={typicalDays}
                placeholder="Not set"
                onChange={(event) => setTypicalDays(event.target.value)}
              />
            </div>
          </div>
          <p className="text-muted text-xs">
            Wait days are for curing: the gap before this stage can start. Typical days are how long
            it takes on a typical villa — once three villas have finished it, their real days are
            used instead.
          </p>
          <FormMessage error={error} />
          <div className="flex flex-wrap gap-2">
            <Button
              variant="primary"
              className="flex-1"
              disabled={pending}
              onClick={async () => {
                const result = await run(() =>
                  updateSequenceStage({
                    groupId: row.groupId,
                    followsGroupId: follows,
                    link: follows ? link : "after",
                    waitDays,
                    typicalDays,
                  }),
                );
                if (!result?.error) setOpen(false);
              }}
            >
              {pending ? "Saving…" : "Save"}
            </Button>
            <ConfirmDialog
              trigger={
                <Button variant="ghost" disabled={pending}>
                  Take out
                </Button>
              }
              title={`Take ${row.code} out of the sequence?`}
              description="Villas whose estimate covers it still list it, at the end. The stages after it will follow what it followed."
              confirmLabel="Take out"
              pendingLabel="Taking out…"
              onConfirm={async () => {
                const result = await removeSequenceStage({ groupId: row.groupId });
                if (!result?.error) setOpen(false);
                return result;
              }}
            />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Adds a work group the sequence does not have, at the end. */
export function AddStage({ missing }: { missing: { id: string; code: string; name: string }[] }) {
  const [open, setOpen] = useState(false);
  const [chosen, setChosen] = useState("");
  const { pending, error, run, clearError } = useActionRunner();
  if (missing.length === 0) return null;
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) {
          setChosen("");
          clearError();
        }
        setOpen(next);
      }}
    >
      <DialogTrigger asChild>
        <Button variant="secondary">Add stage</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a stage</DialogTitle>
          <DialogDescription>
            It goes at the end, after the last stage. Move it and set what it follows after.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <SearchSelect
            options={missing.map((group) => ({
              value: group.id,
              label: `${group.code} ${group.name}`,
            }))}
            value={chosen}
            onChange={setChosen}
            placeholder="Type a code or name…"
          />
          <FormMessage error={error} />
          <Button
            variant="primary"
            className="w-full"
            disabled={pending || !chosen}
            onClick={async () => {
              const result = await run(() => addSequenceStage({ groupId: chosen }));
              if (!result?.error) setOpen(false);
            }}
          >
            {pending ? "Adding…" : "Add"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** The villa size the typical days are for, so a bigger villa takes longer. */
export function TypicalSize({ sqft }: { sqft: number | null }) {
  const [value, setValue] = useState(sqft ? String(sqft) : "");
  const { pending, error, run } = useActionRunner();
  const changed = value.trim() !== (sqft ? String(sqft) : "");
  return (
    <Card className="space-y-2 p-5">
      <Label htmlFor="typical-sqft">Typical days are for a villa of</Label>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Input
            id="typical-sqft"
            type="number"
            inputMode="decimal"
            min={1}
            value={value}
            placeholder="Any size"
            onChange={(event) => setValue(event.target.value)}
            className="pr-12"
          />
          <span className="text-muted pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm">
            sqft
          </span>
        </div>
        <Button
          variant="secondary"
          disabled={pending || !changed}
          onClick={() => run(() => setTypicalSqft({ sqft: value }))}
        >
          {pending ? "Saving…" : "Save"}
        </Button>
      </div>
      <p className="text-muted text-xs">
        {sqft
          ? `A villa whose official estimate has twice the block work of ${formatQuantity(sqft)} sqft gets twice the typical days.`
          : "Blank: every villa gets the typical days as they are, whatever its size."}
      </p>
      <FormMessage error={error} />
    </Card>
  );
}
