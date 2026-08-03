"use client";

import { ItemThumb } from "@/components/masters/item-thumb";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { FormMessage } from "@/components/ui/form-message";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/components/ui/table";
import { formatQuantity } from "@/lib/format";
import { recordStockIssue } from "@/lib/inventory/actions";
import type { IssueFormOptions, StoreHolding } from "@/lib/inventory/queries";
import { wouldGoNegative } from "@/lib/inventory/stock";
import { useMemo, useState, useTransition } from "react";

type Destination = "plot" | "store";

/**
 * Issuing material: tick what is going, say where. Only what the store
 * actually holds is listed, and each quantity is capped at the balance
 * on screen — the negative-stock guard is still the boundary, this just
 * means a store-keeper rarely meets it.
 */
export function IssueForm({
  store,
  holdings,
  options,
}: {
  store: { id: string; name: string; project_id: string | null };
  holdings: StoreHolding[];
  options: IssueFormOptions;
}) {
  const [destination, setDestination] = useState<Destination>("plot");
  const [plotId, setPlotId] = useState("");
  const [toStoreId, setToStoreId] = useState("");
  const [projectId, setProjectId] = useState(store.project_id ?? "");
  const [issuedAt, setIssuedAt] = useState(() => new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState("");
  const [picked, setPicked] = useState<Record<string, number>>({});
  const [error, setError] = useState<string>();
  const [saving, startSaving] = useTransition();

  const pickedEntries = useMemo(() => Object.entries(picked), [picked]);
  const availableById = useMemo(
    () => new Map(holdings.map((row) => [row.item_id, row.quantity])),
    [holdings],
  );

  const otherStores = options.stores.filter((s) => s.id !== store.id);
  /** Only a transfer out of a store with no project of its own needs
   * one picked by hand — otherwise the number's project is derived. */
  const needsProject = destination === "store" && !store.project_id;

  const overAvailable = pickedEntries.some(([itemId, quantity]) =>
    wouldGoNegative(availableById.get(itemId) ?? 0, quantity),
  );

  const destinationChosen =
    destination === "plot"
      ? plotId !== ""
      : toStoreId !== "" && (!needsProject || projectId !== "");

  const toggle = (row: StoreHolding, on: boolean) =>
    setPicked((current) => {
      const next = { ...current };
      if (on) next[row.item_id] = row.quantity;
      else delete next[row.item_id];
      return next;
    });

  const submit = () =>
    startSaving(async () => {
      const result = await recordStockIssue({
        storeId: store.id,
        toStoreId: destination === "store" ? toStoreId : null,
        plotId: destination === "plot" ? plotId : null,
        projectId: needsProject ? projectId : null,
        issuedAt: issuedAt || null,
        note: note || null,
        lines: pickedEntries.map(([itemId, quantity]) => ({
          itemId,
          quantity,
          uom: holdings.find((row) => row.item_id === itemId)?.uom ?? "each",
        })),
      });
      if (result?.error) setError(result.error);
      // On success the action redirects to the issue note.
    });

  return (
    <div className="space-y-6 pb-28">
      <section className="border-border bg-surface space-y-4 rounded-2xl border p-4">
        <h2 className="text-muted text-xs font-semibold tracking-widest uppercase">
          Out of {store.name} — where to?
        </h2>

        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant={destination === "plot" ? "primary" : "secondary"}
            onClick={() => setDestination("plot")}
          >
            To a plot
          </Button>
          <Button
            size="sm"
            variant={destination === "store" ? "primary" : "secondary"}
            onClick={() => setDestination("store")}
            disabled={otherStores.length === 0}
          >
            Transfer to another store
          </Button>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {destination === "plot" ? (
            <div className="space-y-1.5">
              <Label htmlFor="issue-plot">Plot</Label>
              <Select
                id="issue-plot"
                value={plotId}
                onChange={(event) => setPlotId(event.target.value)}
              >
                <option value="">Pick a plot…</option>
                {options.plots.map((plot) => (
                  <option key={plot.id} value={plot.id}>
                    {plot.name} · {plot.project_name}
                  </option>
                ))}
              </Select>
              <p className="text-muted text-xs">
                It leaves this store and shows against the plot in Stock, where it stays — site
                material is used where it goes.
              </p>
            </div>
          ) : (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="issue-to-store">Receiving store</Label>
                <Select
                  id="issue-to-store"
                  value={toStoreId}
                  onChange={(event) => setToStoreId(event.target.value)}
                >
                  <option value="">Pick a store…</option>
                  {otherStores.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </Select>
                <p className="text-muted text-xs">
                  A transfer moves stock between stores — the total across the company does not
                  change.
                </p>
              </div>
              {needsProject && (
                <div className="space-y-1.5">
                  <Label htmlFor="issue-project">Project</Label>
                  <Select
                    id="issue-project"
                    value={projectId}
                    onChange={(event) => setProjectId(event.target.value)}
                  >
                    <option value="">Pick a project…</option>
                    {options.projects.map((project) => (
                      <option key={project.id} value={project.id}>
                        {project.name}
                      </option>
                    ))}
                  </Select>
                  <p className="text-muted text-xs">
                    {store.name} is not tied to a project, so the issue number needs one.
                  </p>
                </div>
              )}
            </>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="issued-at">Issued on</Label>
            <Input
              id="issued-at"
              type="date"
              value={issuedAt}
              onChange={(event) => setIssuedAt(event.target.value)}
            />
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="issue-note">Note</Label>
            <Input
              id="issue-note"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Who collected it, what it is for"
            />
          </div>
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="text-muted text-xs font-semibold tracking-widest uppercase">
          What is going out
        </h2>
        <Table>
          <TableHead>
            <TableRow>
              <TableHeaderCell className="w-10"></TableHeaderCell>
              <TableHeaderCell className="w-14"></TableHeaderCell>
              <TableHeaderCell>Item</TableHeaderCell>
              <TableHeaderCell className="w-32">In store</TableHeaderCell>
              <TableHeaderCell className="w-36">Issuing</TableHeaderCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {holdings.map((row) => {
              const chosen = picked[row.item_id] != null;
              const tooMuch = chosen && wouldGoNegative(row.quantity, picked[row.item_id] ?? 0);
              return (
                <TableRow key={row.item_id}>
                  <TableCell>
                    <Checkbox
                      checked={chosen}
                      onChange={(event) => toggle(row, event.target.checked)}
                      aria-label={`Issue ${row.item_name}`}
                    />
                  </TableCell>
                  <TableCell>
                    <ItemThumb
                      code={row.item_code}
                      name={row.item_name}
                      thumbUrl={row.item_thumb_url}
                      sizes="48px"
                      className="w-10"
                    />
                  </TableCell>
                  <TableCell>
                    <span className="text-foreground font-medium">{row.item_name}</span>
                    <div className="text-muted text-xs">
                      {row.item_code ?? "—"}
                      {row.item_brand && <span className="ml-2">{row.item_brand}</span>}
                    </div>
                  </TableCell>
                  <TableCell className="text-muted">
                    {formatQuantity(row.quantity)} {row.uom}
                  </TableCell>
                  <TableCell>
                    {chosen ? (
                      <>
                        <div className="flex items-center gap-2">
                          <Input
                            type="number"
                            step="any"
                            min="0"
                            max={row.quantity}
                            value={String(picked[row.item_id])}
                            onChange={(event) =>
                              setPicked((current) => ({
                                ...current,
                                [row.item_id]: Number(event.target.value),
                              }))
                            }
                            className="h-9"
                            aria-label={`Quantity to issue for ${row.item_name}`}
                          />
                          <span className="text-muted text-xs whitespace-nowrap">{row.uom}</span>
                        </div>
                        {tooMuch && (
                          <p className="text-warning mt-1 text-xs font-medium">
                            Only {formatQuantity(row.quantity)} {row.uom} in this store
                          </p>
                        )}
                      </>
                    ) : (
                      <span className="text-muted/50 text-sm">—</span>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </section>

      {/* Nothing has been written yet — this bar is the commit point. */}
      <div className="border-border bg-surface fixed inset-x-0 bottom-0 z-10 mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 border-t px-5 py-3 md:rounded-t-2xl md:border">
        <div className="min-w-0">
          {pickedEntries.length === 0 ? (
            <p className="text-muted text-sm">Tick what is leaving {store.name}.</p>
          ) : (
            <p className="text-foreground text-sm font-medium">
              {pickedEntries.length} {pickedEntries.length === 1 ? "item" : "items"} out of{" "}
              {store.name}
            </p>
          )}
          <FormMessage error={error} size="xs" />
        </div>
        <div className="flex items-center gap-2">
          {pickedEntries.length > 0 && (
            <Button variant="ghost" onClick={() => setPicked({})} disabled={saving}>
              Clear
            </Button>
          )}
          <Button
            onClick={submit}
            disabled={
              saving ||
              pickedEntries.length === 0 ||
              !destinationChosen ||
              overAvailable ||
              pickedEntries.some(([, quantity]) => !Number.isFinite(quantity) || quantity <= 0)
            }
          >
            {saving ? "Recording…" : "Record issue"}
          </Button>
        </div>
      </div>
    </div>
  );
}
