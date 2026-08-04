"use client";

import { ProjectPicker } from "@/components/masters/project-picker";
import { RecordFormDialog } from "@/components/masters/record-form-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import type { LabourContractRow } from "@/lib/masters/labour-contracts";
import { createLabourContract, updateLabourContract } from "@/lib/masters/labour-contracts-actions";
import type { PlotRow } from "@/lib/masters/plots";
import type { ProjectRow } from "@/lib/masters/projects";
import type { UnitRow } from "@/lib/masters/units";
import type { VendorRow } from "@/lib/masters/vendors";
import { useState } from "react";

function scopeValue(contract?: LabourContractRow): string {
  if (contract?.unit_id) return `unit:${contract.unit_id}`;
  if (contract?.plot_id) return `plot:${contract.plot_id}`;
  return "";
}

export function LabourContractFormDialog({
  vendors,
  projects,
  plots,
  units,
  contract,
}: {
  vendors: VendorRow[];
  projects: ProjectRow[];
  plots: PlotRow[];
  units: UnitRow[];
  contract?: LabourContractRow;
}) {
  const isEdit = !!contract;
  // The units-dialog pattern: the plot/unit list filters by the chosen
  // project, so this dialog keeps a little state on top of the shared
  // shell. One select encodes plot:<id> / unit:<id> / "" (general) —
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
          {vendors
            .filter((vendor) => vendor.is_active || vendor.id === contract?.vendor_id)
            .map((vendor) => (
              <option key={vendor.id} value={vendor.id}>
                {vendor.name}
              </option>
            ))}
        </Select>
        <p className="text-muted text-xs">Contractors are vendors — add them in the Vendors tab.</p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="project_id">Project</Label>
        <ProjectPicker
          id="project_id"
          name="project_id"
          projects={projects}
          value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
          required
        />
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
          Bills against this contract take their number's scope from here, e.g. BILL/SAA/V12A/001. A
          picked plot or unit needs a short code before bills can be recorded.
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
          What the over-billing warning compares against when bills are recorded.
        </p>
      </div>
      <label className="text-foreground flex items-center gap-2 text-sm">
        <Checkbox name="is_active" value="1" defaultChecked={contract?.is_active ?? true} />
        Active — new bills can be recorded against it
      </label>
    </RecordFormDialog>
  );
}
