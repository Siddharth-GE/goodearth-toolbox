"use client";

import { SitePicker } from "@/components/masters/site-picker";
import { Button, LinkButton } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/form-message";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { buildSiteOptions, decodeSite } from "@/lib/masters/site-options";
import { createPurchaseOrder } from "@/lib/purchase-orders/actions";
import type { PoFormOptions } from "@/lib/purchase-orders/queries";
import { GENERAL_SCOPE, resolveScopeCode } from "@/lib/purchase-orders/reference";
import { useMemo, useState, useTransition } from "react";

/**
 * Project → scope → vendor. The scope (one place — a unit with its
 * plot, a unit-less plot, or a general purchase) is part of the PO
 * number and permanent once created — the form says so, and previews
 * the number as it's chosen.
 */
export function PoForm({ options }: { options: PoFormOptions }) {
  const [projectId, setProjectId] = useState("");
  // "" = general, "unit:<id>" or "plot:<id>" otherwise — one select, so
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
  const siteOptions = useMemo(
    () => buildSiteOptions(options.units, options.plots, projectId),
    [options.units, options.plots, projectId],
  );

  const { plotId, unitId } = decodeSite(scope);
  const scopedSite = siteOptions.find((option) => option.value === scope);

  const missingProjectCode = Boolean(project) && !project?.code;
  // The picked place's code fills whichever slot its kind reads — the
  // unit-first resolution order itself is unchanged.
  const scopeCode = resolveScopeCode(
    scopedSite?.code ?? null,
    scopedSite?.code ?? null,
    unitId ? "unit" : plotId ? "plot" : "general",
  );
  const missingScopeCode = scope !== "" && scopeCode === null;

  const create = () =>
    startTransition(async () => {
      // A success redirects to the new PO, so only errors come back.
      const result = await createPurchaseOrder({
        projectId,
        plotId,
        unitId,
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
        <SitePicker
          id="po-scope"
          value={scope}
          onChange={(event) => setScope(event.target.value)}
          disabled={!projectId}
          options={siteOptions}
          showCodes
        />
        {missingScopeCode ? (
          <p className="text-warning text-xs font-medium" role="alert">
            {scopedSite?.name} has no short code yet, so it can&apos;t number purchase orders. Set
            one in Masters first.
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
