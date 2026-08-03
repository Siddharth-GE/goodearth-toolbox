"use client";

import { Button, LinkButton } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/form-message";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { createPurchaseOrder } from "@/lib/purchase-orders/actions";
import type { PoFormOptions } from "@/lib/purchase-orders/queries";
import { GENERAL_SCOPE, resolveScopeCode } from "@/lib/purchase-orders/reference";
import { useMemo, useState, useTransition } from "react";

/**
 * Project → scope → vendor. The scope (one plot, one unit, or a general
 * purchase) is part of the PO number and permanent once created — the
 * form says so, and previews the number as it's chosen.
 */
export function PoForm({ options }: { options: PoFormOptions }) {
  const [projectId, setProjectId] = useState("");
  // "" = general, "plot:<id>" or "unit:<id>" otherwise — one select, so
  // it's impossible to pick a plot AND a unit.
  const [scope, setScope] = useState("");
  const [vendorId, setVendorId] = useState("");
  const [deliverStoreId, setDeliverStoreId] = useState("");
  const [deliverNote, setDeliverNote] = useState("");
  const [expectedBy, setExpectedBy] = useState("");
  const [terms, setTerms] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string>();
  const [creating, startTransition] = useTransition();

  const project = options.projects.find((candidate) => candidate.id === projectId);
  const plots = useMemo(
    () => options.plots.filter((plot) => plot.project_id === projectId),
    [options.plots, projectId],
  );
  const units = useMemo(
    () => options.units.filter((unit) => unit.project_id === projectId),
    [options.units, projectId],
  );

  const [scopeKind, scopeId]: ["plot" | "unit" | "", string] = scope
    ? (scope.split(":") as ["plot" | "unit", string])
    : ["", ""];
  const scopedPlot = scopeKind === "plot" ? plots.find((plot) => plot.id === scopeId) : undefined;
  const scopedUnit = scopeKind === "unit" ? units.find((unit) => unit.id === scopeId) : undefined;

  const missingProjectCode = Boolean(project) && !project?.code;
  const scopeCode = resolveScopeCode(
    scopedPlot?.code ?? null,
    scopedUnit?.code ?? null,
    scopeKind === "" ? "general" : scopeKind,
  );
  const missingScopeCode = scope !== "" && scopeCode === null;

  const create = () =>
    startTransition(async () => {
      // A success redirects to the new PO, so only errors come back.
      const result = await createPurchaseOrder({
        projectId,
        plotId: scopeKind === "plot" ? scopeId : null,
        unitId: scopeKind === "unit" ? scopeId : null,
        vendorId,
        deliverStoreId: deliverStoreId || null,
        deliverNote: deliverNote || null,
        expectedBy: expectedBy || null,
        terms: terms || null,
        note: note || null,
      });
      if (result?.error) setError(result.error);
    });

  return (
    <div className="border-border bg-surface max-w-xl space-y-4 rounded-2xl border p-5">
      <div className="space-y-1.5">
        <Label htmlFor="po-project">Project</Label>
        <Select
          id="po-project"
          value={projectId}
          onChange={(event) => {
            setProjectId(event.target.value);
            setScope("");
          }}
        >
          <option value="" disabled>
            Choose a project
          </option>
          {options.projects.map((candidate) => (
            <option key={candidate.id} value={candidate.id}>
              {candidate.name}
              {candidate.code ? ` (${candidate.code})` : " — no code yet"}
            </option>
          ))}
        </Select>
        {missingProjectCode && (
          <p className="text-warning text-xs font-medium" role="alert">
            {project?.name} has no short code yet, so it can&apos;t number purchase orders. Set one
            in Masters → Projects first.
          </p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="po-scope">For</Label>
        <Select
          id="po-scope"
          value={scope}
          onChange={(event) => setScope(event.target.value)}
          disabled={!projectId}
        >
          <option value="">General — not for one plot or unit</option>
          {plots.length > 0 && (
            <optgroup label="Plots">
              {plots.map((plot) => (
                <option key={plot.id} value={`plot:${plot.id}`}>
                  {plot.name}
                  {plot.code ? ` (${plot.code})` : " — no code yet"}
                </option>
              ))}
            </optgroup>
          )}
          {units.length > 0 && (
            <optgroup label="Units">
              {units.map((unit) => (
                <option key={unit.id} value={`unit:${unit.id}`}>
                  {unit.name}
                  {unit.code ? ` (${unit.code})` : " — no code yet"}
                </option>
              ))}
            </optgroup>
          )}
        </Select>
        {missingScopeCode ? (
          <p className="text-warning text-xs font-medium" role="alert">
            {scopedPlot?.name ?? scopedUnit?.name} has no short code yet, so it can&apos;t number
            purchase orders. Set one in Masters first.
          </p>
        ) : (
          project?.code && (
            <p className="text-muted text-xs">
              Will be numbered PO/{project.code}/{scopeCode ?? GENERAL_SCOPE}/… — the scope is part
              of the number and can&apos;t change later.
            </p>
          )
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="po-vendor">Vendor</Label>
        <Select
          id="po-vendor"
          value={vendorId}
          onChange={(event) => setVendorId(event.target.value)}
        >
          <option value="" disabled>
            Choose a vendor
          </option>
          {options.vendors.map((vendor) => (
            <option key={vendor.id} value={vendor.id}>
              {vendor.name}
            </option>
          ))}
        </Select>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="po-deliver-store">Deliver to store (optional)</Label>
          <Select
            id="po-deliver-store"
            value={deliverStoreId}
            onChange={(event) => setDeliverStoreId(event.target.value)}
          >
            <option value="">None — see delivery note</option>
            {options.stores.map((store) => (
              <option key={store.id} value={store.id}>
                {store.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="po-expected-by">Expected by</Label>
          <Input
            id="po-expected-by"
            type="date"
            value={expectedBy}
            onChange={(event) => setExpectedBy(event.target.value)}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="po-deliver-note">Delivery note (optional)</Label>
        <Input
          id="po-deliver-note"
          value={deliverNote}
          onChange={(event) => setDeliverNote(event.target.value)}
          placeholder="Site address, who to call at the gate…"
          autoComplete="off"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="po-terms">Payment terms (optional)</Label>
        <Textarea
          id="po-terms"
          value={terms}
          onChange={(event) => setTerms(event.target.value)}
          placeholder="e.g. 50% advance, balance on delivery"
          rows={2}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="po-note">Note</Label>
        <Textarea
          id="po-note"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="Anything the vendor or the store should know"
          rows={2}
        />
      </div>

      <FormMessage error={error} />

      <div className="flex items-center justify-end gap-2">
        <LinkButton href="/purchase-orders" variant="ghost">
          Cancel
        </LinkButton>
        <Button
          onClick={create}
          disabled={creating || !projectId || !vendorId || missingProjectCode || missingScopeCode}
        >
          {creating ? "Creating…" : "Create purchase order"}
        </Button>
      </div>
    </div>
  );
}
