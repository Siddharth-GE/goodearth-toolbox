"use client";

import { CataloguePickerDialog, type PickedLine } from "@/components/masters/catalogue-picker";
import { RecordFormDialog } from "@/components/masters/record-form-dialog";
import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/form-message";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { createIssueRequest, withdrawIssueRequest } from "@/lib/supervisors/actions";
import type { EstimateQuickPick, WorkOption } from "@/lib/supervisors/queries";
import { useState, useTransition } from "react";

type ChosenItem = { id: string; name: string; uom: string };

/**
 * "Request an issue": pick the work, then the material — from the
 * official estimate's list for that work (the common case, one tap) or
 * from the whole catalogue when the site needs something the estimate
 * never named. The chosen item lives OUTSIDE the dialog content (Radix
 * unmounts it on close), so onOpen resets it.
 */
export function RequestIssueDialog({
  plotId,
  works,
  quickPicks,
  categories,
  brands,
}: {
  plotId: string;
  works: WorkOption[];
  quickPicks: EstimateQuickPick[];
  categories: { id: string; name: string }[];
  brands: { id: string; name: string }[];
}) {
  const [workItemId, setWorkItemId] = useState("");
  const [item, setItem] = useState<ChosenItem | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  const workPicks = quickPicks.filter((pick) => pick.workItemId === workItemId);
  const workCategories = [...new Set(works.map((work) => work.categoryName))];

  const choose = (picked: PickedLine[]) => {
    const first = picked[0];
    if (first) {
      setItem({ id: first.item.id, name: first.item.name, uom: first.item.default_uom });
    }
    return Promise.resolve(undefined);
  };

  return (
    <>
      <RecordFormDialog
        label="Request"
        isEdit={false}
        action={createIssueRequest}
        trigger={<Button variant="secondary">Request material</Button>}
        onOpen={() => {
          setWorkItemId("");
          setItem(null);
        }}
      >
        <input type="hidden" name="plot_id" value={plotId} />
        <input type="hidden" name="item_id" value={item?.id ?? ""} />

        <div className="space-y-1.5">
          <Label htmlFor="work_item_id">What work is the material for?</Label>
          <Select
            id="work_item_id"
            name="work_item_id"
            value={workItemId}
            onChange={(event) => {
              setWorkItemId(event.target.value);
              setItem(null);
            }}
            required
          >
            <option value="" disabled>
              Pick the work…
            </option>
            {workCategories.map((category) => (
              <optgroup key={category} label={category}>
                {works
                  .filter((work) => work.categoryName === category)
                  .map((work) => (
                    <option key={work.id} value={work.id}>
                      {work.label}
                    </option>
                  ))}
              </optgroup>
            ))}
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="quick_pick">Material</Label>
          {workPicks.length > 0 && (
            <Select
              id="quick_pick"
              value={item && workPicks.some((pick) => pick.itemId === item.id) ? item.id : ""}
              onChange={(event) => {
                const pick = workPicks.find((entry) => entry.itemId === event.target.value);
                setItem(pick ? { id: pick.itemId, name: pick.itemName, uom: pick.itemUom } : null);
              }}
            >
              <option value="">From the estimate…</option>
              {workPicks.map((pick) => (
                <option key={pick.itemId} value={pick.itemId}>
                  {pick.materialName} — estimate says {pick.estimatedLabel}
                </option>
              ))}
            </Select>
          )}
          <div className="flex items-center gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={() => setPickerOpen(true)}>
              {workPicks.length > 0 ? "Or browse the catalogue" : "Pick from the catalogue"}
            </Button>
            {item && (
              <span className="text-muted text-sm">
                {item.name} · in {item.uom}
              </span>
            )}
          </div>
          {!item && workItemId && (
            <p className="text-muted text-xs">
              {workPicks.length > 0
                ? "Pick from the estimate's list, or browse the whole catalogue."
                : "This work has no materials in the estimate — browse the catalogue."}
            </p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="quantity">Quantity{item ? ` (${item.uom})` : ""}</Label>
          <Input id="quantity" name="quantity" inputMode="decimal" required />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="note">Note for the store (optional)</Label>
          <Textarea id="note" name="note" rows={2} />
        </div>
      </RecordFormDialog>

      <CataloguePickerDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        title="Pick the material to request"
        targetLabel="this request"
        categories={categories}
        brands={brands}
        onCommit={choose}
      />
    </>
  );
}

export function WithdrawRequestButton({ requestId }: { requestId: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();

  return (
    <span className="inline-flex items-center gap-2">
      <FormMessage error={error} />
      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await withdrawIssueRequest(requestId);
            setError(result?.error);
          })
        }
      >
        Withdraw
      </Button>
    </span>
  );
}
