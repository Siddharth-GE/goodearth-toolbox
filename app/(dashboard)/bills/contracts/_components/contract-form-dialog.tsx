"use client";

import { RecordFormDialog } from "@/components/masters/record-form-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { createLabourContract, updateLabourContract } from "@/lib/bills/actions";
import type { BillContractRow, BillScopedOption, BillVendorOption } from "@/lib/bills/queries";
import { useState } from "react";

function scopeValue(contract?: BillContractRow): string {
  if (contract?.unit_id) return `unit:${contract.unit_id}`;
  if (contract?.plot_id) return `plot:${contract.plot_id}`;
  return "";
}

/**
 * Create/edit a labour contract, inside Bills. New contracts start
 * pending approval; editing is only offered while pending (the DB
 * guard locks the terms on approval).
 */
export function ContractFormDialog({
  vendors,
  projects,
  plots,
  units,
  contract,
}: {
  vendors: BillVendorOption[];
  projects: { id: string; name: string; code: string | null }[];
  plots: BillScopedOption[];
  units: BillScopedOption[];
  contract?: BillContractRow;
}) {
  const isEdit = !!contract;
  // The plot/unit list filters by the chosen project (the units-dialog
  // pattern). One select encodes plot:<id> / unit:<id> / "" (general) —
  // picking both is structurally impossible, like the DB CHECK.
  const [projectId, setProjectId] = useState(contract?.project_id ?? "");
  const filteredPlots = plots.filter((plot) => plot.project_id === projectId);
  const filteredUnits = units.filter((unit) => unit.project_id === projectId);

  return (
    <RecordFormDialog
      label="Labour Contract"
      isEdit={isEdit}
      action={isEdit ? updateLabourContract.bind(null, contract.id) : createLabourContract}
      onOpen={() => setProjectId(contract?.project_id ?? "")}
    >
      <div className="space-y-1.5">
        <Label htmlFor="vendor_id">Contractor</Label>
        <Select id="vendor_id" name="vendor_id" defaultValue={contract?.vendor_id ?? ""} required>
          <option value="" disabled>
            Select a vendor
          </option>
          {vendors.map((vendor) => (
            <option key={vendor.id} value={vendor.id}>
              {vendor.name}
            </option>
          ))}
        </Select>
        <p className="text-muted text-xs">
          Contractors are vendors — add them in Masters → Vendors.
        </p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="project_id">Project</Label>
        <Select
          id="project_id"
          name="project_id"
          value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
          required
        >
          <option value="" disabled>
            Select a project
          </option>
          {projects.map((project) => (
            <option key={project.id} value={project.id}>
              {project.name}
            </option>
          ))}
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="scope">Plot / Unit (optional)</Label>
        <Select id="scope" name="scope" defaultValue={scopeValue(contract)} disabled={!projectId}>
          <option value="">General — whole project</option>
          {filteredUnits.length > 0 && (
            <optgroup label="Units">
              {filteredUnits.map((unit) => (
                <option key={unit.id} value={`unit:${unit.id}`}>
                  {unit.name}
                </option>
              ))}
            </optgroup>
          )}
          {filteredPlots.length > 0 && (
            <optgroup label="Plots">
              {filteredPlots.map((plot) => (
                <option key={plot.id} value={`plot:${plot.id}`}>
                  {plot.name}
                </option>
              ))}
            </optgroup>
          )}
        </Select>
        <p className="text-muted text-xs">
          Bills against this contract take their number&apos;s scope from here, e.g.
          BILL/SAA/V12A/001. A picked plot or unit needs a short code before bills can be recorded.
        </p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="description">Covers</Label>
        <Input
          id="description"
          name="description"
          defaultValue={contract?.description ?? ""}
          required
          autoComplete="off"
          placeholder="e.g. Masonry, phase 2"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="contract_value">Contract value (₹)</Label>
        <Input
          id="contract_value"
          name="contract_value"
          type="number"
          min="0.01"
          step="0.01"
          defaultValue={contract?.contract_value ?? ""}
          required
          autoComplete="off"
        />
        <p className="text-muted text-xs">
          Locks on approval, and the over-billing warning compares against it.
        </p>
      </div>
    </RecordFormDialog>
  );
}
