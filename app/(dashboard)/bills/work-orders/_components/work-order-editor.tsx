"use client";

import { SitePicker } from "@/components/masters/site-picker";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { FormMessage } from "@/components/ui/form-message";
import { IconButton } from "@/components/ui/icon-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchSelect } from "@/components/ui/search-select";
import { Select } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { createWorkOrder, saveWorkOrder } from "@/lib/bills/work-order-actions";
import type { WorkOrderFormOptions } from "@/lib/bills/work-order-queries";
import {
  workOrderLineAmount,
  workOrderProblem,
  workOrderTotal,
  type WorkOrderLineInput,
} from "@/lib/bills/work-orders";
import { formatMoney } from "@/lib/format";
import { buildSiteOptions, decodeSite } from "@/lib/masters/site-options";
import { Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

/**
 * The work order, being written: who, where, what it covers, its works
 * and its terms. Works come from the Masters list, each offered at the
 * rate book's unit and labour rate; a template fills the works and terms
 * in one go. Nothing is saved until Create (or Save, on a pending order)
 * — the value at the foot is always the lines' sum, which is what the
 * database stores.
 */

type LineState = {
  key: string;
  workItemId: string | null;
  description: string;
  isLumpSum: boolean;
  quantity: string;
  uom: string;
  rate: string;
};

export type WorkOrderEditorInitial = {
  vendorId: string;
  projectId: string;
  /** "unit:<id>", "plot:<id>" or "" — the SitePicker value. */
  site: string;
  description: string;
  terms: string;
  lines: Omit<LineState, "key">[];
};

let nextKey = 0;
const keyed = (line: Omit<LineState, "key">): LineState => ({ ...line, key: `l${nextKey++}` });
const blankLine = (): LineState =>
  keyed({ workItemId: null, description: "", isLumpSum: false, quantity: "", uom: "", rate: "" });
const typed = (text: string) => (text.trim() === "" ? null : Number(text.trim()));

const asInput = (line: LineState): WorkOrderLineInput => ({
  workItemId: line.workItemId,
  description: line.description,
  isLumpSum: line.isLumpSum,
  quantity: line.isLumpSum ? null : typed(line.quantity),
  uom: line.isLumpSum ? null : line.uom || null,
  rate: typed(line.rate),
});

export function WorkOrderEditor({
  options,
  initial,
  orderId,
}: {
  options: WorkOrderFormOptions;
  initial: WorkOrderEditorInitial;
  /** Present: saving a pending order. Absent: making a new one. */
  orderId?: string;
}) {
  const router = useRouter();
  const [vendorId, setVendorId] = useState(initial.vendorId);
  const [projectId, setProjectId] = useState(initial.projectId);
  const [site, setSite] = useState(initial.site);
  const [description, setDescription] = useState(initial.description);
  const [terms, setTerms] = useState(initial.terms);
  const [lines, setLines] = useState<LineState[]>(() =>
    initial.lines.length ? initial.lines.map(keyed) : [blankLine()],
  );
  const [error, setError] = useState<string>();
  const [saved, setSaved] = useState(false);
  const [saving, startSaving] = useTransition();

  const workOptions = useMemo(
    () =>
      options.works.map((work) => ({
        value: work.id,
        label: work.label,
        group: work.category,
        hint:
          work.labour_rate != null
            ? `${formatMoney(work.labour_rate)} per ${work.uom ?? "unit"} in the rate book`
            : "no labour rate in the rate book",
      })),
    [options.works],
  );
  const workById = useMemo(
    () => new Map(options.works.map((work) => [work.id, work])),
    [options.works],
  );
  const siteOptions = buildSiteOptions(options.units, options.plots, projectId);

  const update = (key: string, patch: Partial<LineState>) =>
    setLines((current) => current.map((line) => (line.key === key ? { ...line, ...patch } : line)));

  /** A picked work brings its name, unit and labour rate from the rate book. */
  const pickWork = (line: LineState, workItemId: string) => {
    const work = workById.get(workItemId);
    const previous = line.workItemId ? workById.get(line.workItemId) : undefined;
    update(line.key, {
      workItemId: workItemId || null,
      description:
        !line.description.trim() || line.description === previous?.name
          ? (work?.name ?? line.description)
          : line.description,
      uom: work?.uom ?? line.uom,
      rate: work?.labour_rate != null ? String(work.labour_rate) : line.rate,
    });
  };

  const applyTemplate = (templateId: string) => {
    const template = options.templates.find((candidate) => candidate.id === templateId);
    if (!template) return;
    const hasWorks = lines.some((line) => line.workItemId || line.description.trim());
    if (hasWorks && !window.confirm(`Replace these works with the "${template.name}" template?`)) {
      return;
    }
    setLines(
      template.lines.length
        ? template.lines.map((line) => {
            const work = line.work_item_id ? workById.get(line.work_item_id) : undefined;
            return keyed({
              workItemId: line.work_item_id,
              description: line.description,
              isLumpSum: line.is_lump_sum,
              quantity: "",
              uom: line.uom ?? work?.uom ?? "",
              rate: work?.labour_rate != null && !line.is_lump_sum ? String(work.labour_rate) : "",
            });
          })
        : [blankLine()],
    );
    if (template.terms) setTerms(template.terms);
  };

  const inputs = lines.map(asInput);
  const total = workOrderTotal(inputs);
  const problem = workOrderProblem({ vendorId, projectId, description, lines: inputs });

  const save = () =>
    startSaving(async () => {
      setError(undefined);
      setSaved(false);
      const { plotId, unitId } = decodeSite(site);
      const input = {
        vendorId,
        projectId,
        plotId,
        unitId,
        description,
        terms: terms || null,
        lines: inputs,
      };
      // A new order lands on its own page; only a refusal comes back.
      const result = orderId ? await saveWorkOrder(orderId, input) : await createWorkOrder(input);
      if (result?.error) {
        setError(result.error);
        return;
      }
      if (orderId) {
        setSaved(true);
        router.refresh();
      }
    });

  return (
    <div className="space-y-4">
      <div className="border-border bg-surface grid gap-4 rounded-2xl border p-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="wo-vendor">Contractor</Label>
          <Select
            id="wo-vendor"
            value={vendorId}
            onChange={(event) => setVendorId(event.target.value)}
          >
            <option value="" disabled>
              Pick the contractor…
            </option>
            {options.contractors.map((vendor) => (
              <option key={vendor.id} value={vendor.id}>
                {vendor.name}
              </option>
            ))}
          </Select>
          <p className="text-muted text-xs">
            Contractors are vendors marked as contractors in Masters → Vendors.
          </p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="wo-project">Project</Label>
          <Select
            id="wo-project"
            value={projectId}
            disabled={Boolean(orderId)}
            onChange={(event) => {
              setProjectId(event.target.value);
              setSite("");
            }}
          >
            <option value="" disabled>
              Pick the project…
            </option>
            {options.projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </Select>
          {orderId && (
            <p className="text-muted text-xs">Part of the number, so it stays as it was made.</p>
          )}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="wo-site">Villa</Label>
          <SitePicker
            id="wo-site"
            value={site}
            onChange={(event) => setSite(event.target.value)}
            disabled={!projectId}
            options={siteOptions}
            generalLabel="General — the whole project"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="wo-description">Covers</Label>
          <Input
            id="wo-description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="e.g. Masonry, ground floor"
            autoComplete="off"
          />
        </div>
      </div>

      <div className="flex flex-wrap items-end justify-between gap-2">
        <h2 className="text-foreground text-lg font-bold tracking-tight">Works</h2>
        {options.templates.length > 0 && (
          // A picker that resets itself: choosing fills the works below.
          <Select
            value=""
            onChange={(event) => applyTemplate(event.target.value)}
            className="h-9 w-auto text-sm"
            aria-label="Start from a template"
          >
            <option value="">Start from a template…</option>
            {options.templates.map((template) => (
              <option key={template.id} value={template.id}>
                {template.name}
              </option>
            ))}
          </Select>
        )}
      </div>

      <Table>
        <TableHead>
          <TableRow>
            <TableHeaderCell className="min-w-72 px-3">Work</TableHeaderCell>
            <TableHeaderCell className="w-24 px-3">Lump sum</TableHeaderCell>
            <TableHeaderCell className="w-28 px-3">Quantity</TableHeaderCell>
            <TableHeaderCell className="w-28 px-3">Unit</TableHeaderCell>
            <TableHeaderCell className="w-32 px-3">Rate</TableHeaderCell>
            <TableHeaderCell className="w-32 px-3">Amount</TableHeaderCell>
            <TableHeaderCell className="w-12 px-3"></TableHeaderCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {lines.map((line) => {
            const amount = workOrderLineAmount(asInput(line));
            return (
              <TableRow key={line.key} className="align-top">
                <TableCell className="space-y-2 px-3">
                  <SearchSelect
                    options={workOptions}
                    value={line.workItemId ?? ""}
                    onChange={(workItemId) => pickWork(line, workItemId)}
                    placeholder="Type a work's code or name…"
                  />
                  <Input
                    value={line.description}
                    onChange={(event) => update(line.key, { description: event.target.value })}
                    placeholder="What the contractor does"
                    className="h-9"
                    aria-label="Description"
                  />
                </TableCell>
                <TableCell className="px-3">
                  <Checkbox
                    checked={line.isLumpSum}
                    onChange={(event) => update(line.key, { isLumpSum: event.target.checked })}
                    aria-label="Lump sum"
                  />
                </TableCell>
                <TableCell className="px-3">
                  {line.isLumpSum ? (
                    <span className="text-muted text-sm">—</span>
                  ) : (
                    <Input
                      type="number"
                      step="any"
                      min="0"
                      value={line.quantity}
                      onChange={(event) => update(line.key, { quantity: event.target.value })}
                      className="h-9 min-w-20"
                      aria-label="Quantity"
                    />
                  )}
                </TableCell>
                <TableCell className="px-3">
                  {line.isLumpSum ? (
                    <span className="text-muted text-sm">—</span>
                  ) : (
                    <Select
                      value={line.uom}
                      onChange={(event) => update(line.key, { uom: event.target.value })}
                      className="h-9 min-w-20 px-2.5"
                      aria-label="Unit"
                    >
                      <option value="">—</option>
                      {[...new Set([...options.uoms, ...(line.uom ? [line.uom] : [])])].map(
                        (uom) => (
                          <option key={uom} value={uom}>
                            {uom}
                          </option>
                        ),
                      )}
                    </Select>
                  )}
                </TableCell>
                <TableCell className="px-3">
                  <Input
                    type="number"
                    step="any"
                    min="0"
                    value={line.rate}
                    onChange={(event) => update(line.key, { rate: event.target.value })}
                    placeholder="—"
                    className="h-9 min-w-24"
                    aria-label={line.isLumpSum ? "Lump sum amount" : "Rate"}
                  />
                  <p className="text-muted mt-1 text-xs">
                    {line.isLumpSum ? "the whole amount" : `per ${line.uom || "unit"}`}
                  </p>
                </TableCell>
                <TableCell className="px-3 font-mono whitespace-nowrap">
                  {formatMoney(amount, { paise: amount !== null && amount % 1 !== 0 })}
                </TableCell>
                <TableCell className="px-3">
                  <IconButton
                    aria-label="Remove this work"
                    tone="danger"
                    disabled={lines.length === 1}
                    onClick={() =>
                      setLines((current) => current.filter((other) => other.key !== line.key))
                    }
                  >
                    <Trash2 className="size-4" />
                  </IconButton>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => setLines((current) => [...current, blankLine()])}
        >
          <Plus className="size-4" />
          Add a work
        </Button>
        <p className="text-foreground text-sm font-semibold">
          Value <span className="font-mono">{formatMoney(total, { paise: total % 1 !== 0 })}</span>
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="wo-terms">Terms and conditions</Label>
        <Textarea
          id="wo-terms"
          rows={5}
          value={terms}
          onChange={(event) => setTerms(event.target.value)}
          placeholder="Scope, payment stages, retention, safety…"
        />
        <p className="text-muted text-xs">
          Reusable terms are kept in Masters → Terms; this order&apos;s copy is its own, and locks
          on approval with its works and value.
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-3">
        {/* What still stops saving reads as a quiet hint; a refusal is an error. */}
        {!error && problem && <p className="text-muted text-xs">{problem}</p>}
        <FormMessage error={error} success={saved ? "Saved" : undefined} size="xs" />
        <Button onClick={save} disabled={saving || Boolean(problem)}>
          {saving ? "Saving…" : orderId ? "Save changes" : "Make the work order"}
        </Button>
      </div>
    </div>
  );
}
