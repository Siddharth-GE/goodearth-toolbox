"use client";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { FormMessage } from "@/components/ui/form-message";
import { Input } from "@/components/ui/input";
import {
  addEstimateLines,
  removeEstimateLine,
  updateEstimateLineQty,
} from "@/lib/estimator/estimate-actions";
import { formatCount } from "@/lib/format";
import { useMemo, useState, useTransition } from "react";

export type PickableWork = {
  workItemId: string;
  code: string;
  name: string;
  groupName: string | null;
  categoryCode: string;
  categoryName: string;
  /** Null = not in the rate book yet; it can still be listed. */
  uom: string | null;
};

/**
 * Put works on the estimate — any of them, all at once, ticked from a
 * searchable list (0097). They arrive "to measure": no throwaway number
 * to get past the form, and a work not yet in the rate book can be listed
 * and priced later. Works already on the estimate show ticked and fixed.
 */
export function AddWorksDialog({
  estimateId,
  works,
  onEstimate,
}: {
  estimateId: string;
  works: PickableWork[];
  /** Work ids already on this estimate. */
  onEstimate: string[];
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();
  const already = useMemo(() => new Set(onEstimate), [onEstimate]);

  const groups = useMemo(() => {
    const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const byGroup = new Map<string, PickableWork[]>();
    for (const work of works) {
      const haystack =
        `${work.code} ${work.name} ${work.groupName ?? ""} ${work.categoryName}`.toLowerCase();
      if (!words.every((word) => haystack.includes(word))) continue;
      const key = work.groupName
        ? `${work.categoryCode} — ${work.groupName}`
        : `${work.categoryCode} — ${work.categoryName}`;
      byGroup.set(key, [...(byGroup.get(key) ?? []), work]);
    }
    return [...byGroup];
  }, [works, query]);

  const toggle = (ids: string[], on: boolean) =>
    setPicked((current) =>
      on ? [...new Set([...current, ...ids])] : current.filter((id) => !ids.includes(id)),
    );

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setPicked([]);
          setQuery("");
          setError(undefined);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button>Add works</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-h-[90dvh] sm:overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add works</DialogTitle>
        </DialogHeader>
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Find a work — lintel, plaster, FD.…"
          aria-label="Find a work"
        />
        <div className="max-h-[50dvh] space-y-3 overflow-y-auto">
          {groups.length === 0 ? (
            <p className="text-muted text-sm">Nothing matches “{query.trim()}”.</p>
          ) : (
            groups.map(([group, rows]) => {
              const open = rows.filter((row) => !already.has(row.workItemId));
              const allPicked =
                open.length > 0 && open.every((row) => picked.includes(row.workItemId));
              return (
                <div key={group} className="space-y-1">
                  <label className="text-foreground flex items-center gap-2 text-sm font-semibold">
                    <Checkbox
                      checked={allPicked}
                      disabled={open.length === 0}
                      onChange={(event) =>
                        toggle(
                          open.map((row) => row.workItemId),
                          event.target.checked,
                        )
                      }
                    />
                    {group}
                  </label>
                  <ul className="space-y-1 pl-6">
                    {rows.map((work) => {
                      const on = already.has(work.workItemId);
                      return (
                        <li key={work.workItemId}>
                          <label className="flex items-center gap-2 text-sm">
                            <Checkbox
                              checked={on || picked.includes(work.workItemId)}
                              disabled={on}
                              onChange={(event) => toggle([work.workItemId], event.target.checked)}
                            />
                            <span className={on ? "text-muted" : "text-foreground"}>
                              {work.code} — {work.name}
                            </span>
                            <span className="text-muted text-xs">
                              {on ? "on the estimate" : (work.uom ?? "not in the rate book yet")}
                            </span>
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })
          )}
        </div>
        <FormMessage error={error} />
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="secondary">Cancel</Button>
          </DialogClose>
          <Button
            disabled={pending || picked.length === 0}
            onClick={() =>
              startTransition(async () => {
                const result = await addEstimateLines(estimateId, picked);
                if (result?.error) setError(result.error);
                else setOpen(false);
              })
            }
          >
            {pending
              ? "Adding…"
              : `Add ${formatCount(picked.length)} ${picked.length === 1 ? "work" : "works"}`}
          </Button>
        </DialogFooter>
        <p className="text-muted text-xs">
          They come in to measure — open each one&apos;s sheet, or type its quantity, on the
          estimate.
        </p>
      </DialogContent>
    </Dialog>
  );
}

/** A typed quantity, saved on blur — blank means "to measure". */
export function LineQtyField({
  id,
  qty,
  label,
}: {
  id: string;
  qty: number | null;
  label: string;
}) {
  const shown = qty === null ? "" : String(qty);
  const [value, setValue] = useState(shown);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();

  const save = () => {
    const cleaned = value.replace(/[,\s]/g, "");
    const next = cleaned === "" ? null : Number(cleaned);
    if (next === qty) return;
    if (next !== null && (!Number.isFinite(next) || next <= 0)) {
      setValue(shown);
      return;
    }
    startTransition(async () => {
      const result = await updateEstimateLineQty(id, next);
      if (result?.error) {
        setError(result.error);
        setValue(shown);
      } else {
        setError(undefined);
      }
    });
  };

  return (
    <div className="space-y-1">
      <Input
        aria-label={`Quantity of ${label}`}
        value={value}
        inputMode="decimal"
        placeholder="to measure"
        onChange={(event) => setValue(event.target.value)}
        onBlur={save}
        onKeyDown={(event) => {
          if (event.key === "Enter") (event.target as HTMLInputElement).blur();
          if (event.key === "Escape") setValue(shown);
        }}
        disabled={pending}
        className="h-9 max-w-28 text-sm"
      />
      <FormMessage error={error} size="xs" />
    </div>
  );
}

export function RemoveLineButton({ id, label }: { id: string; label: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();

  return (
    <div className="flex items-center justify-end gap-2">
      <FormMessage error={error} />
      <Button
        type="button"
        variant="ghost"
        size="sm"
        aria-label={`Remove ${label}`}
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await removeEstimateLine(id);
            setError(result?.error);
          })
        }
      >
        {pending ? "Removing…" : "Remove"}
      </Button>
    </div>
  );
}
