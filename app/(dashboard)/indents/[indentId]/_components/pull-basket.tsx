"use client";

import { ItemThumb } from "@/components/masters/item-thumb";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { FormMessage } from "@/components/ui/form-message";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/components/ui/table";
import { formatCount, formatQuantity } from "@/lib/format";
import { addBudgetPullLines, addConstructionPullLines } from "@/lib/indents/actions";
import type { BudgetPullLineRow, PullLineRow } from "@/lib/indents/queries";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

type Row = PullLineRow & Partial<Pick<BudgetPullLineRow, "vendor_name">>;
export type PullGroup = { label: string; lines: Row[] };

/**
 * Both pull paths are the same screen: a plan (or an approved budget)
 * laid out group by group, quantities prefilled with what was planned,
 * a local basket and one commit. Nothing is written until Add — ticking
 * costs nothing, exactly like the catalogue picker's basket.
 *
 * `source` rather than an onCommit prop, deliberately: this renders
 * from a Server Component, and a function cannot cross that boundary
 * (the Items-page pagination crash). The component picks its own action.
 */
export function PullBasket({
  indentId,
  reference,
  groups,
  groupNoun,
  source,
  budgetId,
  showVendor = false,
}: {
  indentId: string;
  reference: string;
  groups: PullGroup[];
  /** "stage" or "space" — what a group heading means here. */
  groupNoun: string;
  source: "construction" | "interiors";
  budgetId?: string;
  showVendor?: boolean;
}) {
  const router = useRouter();
  const [picked, setPicked] = useState<Record<string, number>>({});
  const [error, setError] = useState<string>();
  const [saving, startSaving] = useTransition();

  const pickedEntries = useMemo(() => Object.entries(picked), [picked]);

  const toggle = (line: Row, on: boolean) =>
    setPicked((current) => {
      const next = { ...current };
      if (on) next[line.source_id] = line.planned_quantity;
      else delete next[line.source_id];
      return next;
    });

  const setQuantity = (sourceId: string, quantity: number) =>
    setPicked((current) => ({ ...current, [sourceId]: quantity }));

  const toggleGroup = (group: PullGroup, on: boolean) =>
    setPicked((current) => {
      const next = { ...current };
      for (const line of group.lines) {
        if (line.on_this_indent) continue;
        if (on) next[line.source_id] = line.planned_quantity;
        else delete next[line.source_id];
      }
      return next;
    });

  const commit = () =>
    startSaving(async () => {
      const lines = pickedEntries.map(([sourceId, quantity]) => ({ sourceId, quantity }));
      const result =
        source === "construction"
          ? await addConstructionPullLines(indentId, lines)
          : await addBudgetPullLines(indentId, budgetId ?? "", lines);
      if (result?.error) {
        setError(result.error);
        // A partial add still changed the indent: drop what went in so a
        // second press can't ask for it twice.
        router.refresh();
        setPicked({});
        return;
      }
      router.push(`/indents/${indentId}`);
    });

  return (
    <div className="space-y-6 pb-28">
      {groups.map((group) => {
        const available = group.lines.filter((line) => !line.on_this_indent);
        const allPicked =
          available.length > 0 && available.every((line) => picked[line.source_id] != null);
        return (
          <section key={group.label} className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-foreground text-lg font-bold tracking-tight">{group.label}</h2>
              <div className="flex items-center gap-3">
                <span className="text-muted text-xs">
                  {formatCount(group.lines.length)} {group.lines.length === 1 ? "line" : "lines"}
                </span>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={available.length === 0}
                  onClick={() => toggleGroup(group, !allPicked)}
                >
                  {allPicked ? "Clear" : `Select this ${groupNoun}`}
                </Button>
              </div>
            </div>

            <Table>
              <TableHead>
                <TableRow>
                  <TableHeaderCell className="w-10"></TableHeaderCell>
                  <TableHeaderCell className="w-14"></TableHeaderCell>
                  <TableHeaderCell>Item</TableHeaderCell>
                  {showVendor && <TableHeaderCell>Expected vendor</TableHeaderCell>}
                  <TableHeaderCell className="w-28">Planned</TableHeaderCell>
                  <TableHeaderCell className="w-32">Already asked</TableHeaderCell>
                  <TableHeaderCell className="w-32">Request</TableHeaderCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {group.lines.map((line) => {
                  const chosen = picked[line.source_id] != null;
                  return (
                    <TableRow
                      key={line.source_id}
                      className={line.on_this_indent ? "opacity-60" : undefined}
                    >
                      <TableCell>
                        <Checkbox
                          checked={chosen}
                          disabled={line.on_this_indent}
                          onChange={(event) => toggle(line, event.target.checked)}
                          aria-label={`Request ${line.item_name}`}
                        />
                      </TableCell>
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
                          {line.on_this_indent && (
                            <span className="text-accent ml-2 font-medium">
                              already on this indent
                            </span>
                          )}
                        </div>
                      </TableCell>
                      {showVendor && (
                        <TableCell className="text-muted">{line.vendor_name ?? "—"}</TableCell>
                      )}
                      <TableCell className="text-muted">
                        {formatQuantity(line.planned_quantity)} {line.uom}
                      </TableCell>
                      <TableCell className="text-muted">
                        {line.already_requested > 0
                          ? `${formatQuantity(line.already_requested)} ${line.uom}`
                          : "—"}
                      </TableCell>
                      <TableCell>
                        {chosen ? (
                          <Input
                            type="number"
                            step="any"
                            min="0"
                            value={String(picked[line.source_id])}
                            onChange={(event) =>
                              setQuantity(line.source_id, Number(event.target.value))
                            }
                            className="h-9"
                            aria-label={`Quantity to request for ${line.item_name}`}
                          />
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
        );
      })}

      {/* Nothing has been written yet — this bar is the commit point. */}
      <div className="border-border bg-surface fixed inset-x-0 bottom-0 z-10 mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 border-t px-5 py-3 md:rounded-t-2xl md:border">
        <div className="min-w-0">
          {pickedEntries.length === 0 ? (
            <p className="text-muted text-sm">
              Tick the lines to request, or take a whole {groupNoun} at once.
            </p>
          ) : (
            <p className="text-foreground text-sm font-medium">
              {pickedEntries.length} {pickedEntries.length === 1 ? "line" : "lines"} into{" "}
              {reference}
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
            onClick={commit}
            disabled={
              saving ||
              pickedEntries.length === 0 ||
              pickedEntries.some(([, quantity]) => !Number.isFinite(quantity) || quantity <= 0)
            }
          >
            {saving ? "Adding…" : "Add to indent"}
          </Button>
        </div>
      </div>
    </div>
  );
}
