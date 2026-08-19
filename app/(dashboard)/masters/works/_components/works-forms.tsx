"use client";

import { RecordFormDialog } from "@/components/masters/record-form-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { FormMessage } from "@/components/ui/form-message";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import type { WorkCategoryRow, WorkGroupRow, WorkItemRow } from "@/lib/masters/works";
import {
  addWorkCategory,
  addWorkGroup,
  addWorkItem,
  setWorkCategoryActive,
  setWorkGroupActive,
  setWorkItemActive,
  updateWorkCategory,
  updateWorkGroup,
  updateWorkItem,
} from "@/lib/masters/works-actions";
import { useState, useTransition } from "react";

export function WorkCategoryFormDialog({
  category,
  trigger,
}: {
  category?: WorkCategoryRow;
  trigger?: React.ReactNode;
}) {
  const isEdit = !!category;
  return (
    <RecordFormDialog
      label="Category"
      isEdit={isEdit}
      action={isEdit ? updateWorkCategory.bind(null, category.id) : addWorkCategory}
      trigger={trigger}
    >
      <div className="space-y-1.5">
        <Label htmlFor="code">Code</Label>
        <Input
          id="code"
          name="code"
          defaultValue={category?.code}
          required
          autoComplete="off"
          placeholder="e.g. FD"
          maxLength={10}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="name">Name</Label>
        <Input
          id="name"
          name="name"
          defaultValue={category?.name}
          required
          autoComplete="off"
          placeholder="e.g. Foundation"
        />
      </div>
      {isEdit && (
        <label className="text-foreground flex items-center gap-2 text-sm">
          <Checkbox name="is_active" value="1" defaultChecked={category.is_active} />
          Active
        </label>
      )}
    </RecordFormDialog>
  );
}

export function WorkGroupFormDialog({
  categories,
  group,
  defaultCategoryId,
  trigger,
}: {
  categories: WorkCategoryRow[];
  group?: WorkGroupRow;
  defaultCategoryId?: string;
  trigger?: React.ReactNode;
}) {
  const isEdit = !!group;
  return (
    <RecordFormDialog
      label="Group"
      isEdit={isEdit}
      action={isEdit ? updateWorkGroup.bind(null, group.id) : addWorkGroup}
      trigger={trigger}
    >
      <div className="space-y-1.5">
        <Label htmlFor="category_id">Category</Label>
        {/* A group cannot move category once created — its items' codes
            and the composite FK both belong to this category. */}
        <Select
          id="category_id"
          name="category_id"
          defaultValue={group?.category_id ?? defaultCategoryId ?? ""}
          disabled={isEdit}
          required
        >
          <option value="" disabled>
            Choose a category
          </option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.code} — {category.name}
            </option>
          ))}
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="code">Code</Label>
        <Input
          id="code"
          name="code"
          defaultValue={group?.code}
          required
          autoComplete="off"
          placeholder="e.g. FD.3"
          maxLength={20}
        />
        <p className="text-muted text-xs">
          One numbering runs through a category&apos;s groups and works — a code can&apos;t repeat.
        </p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="name">Name</Label>
        <Input
          id="name"
          name="name"
          defaultValue={group?.name}
          required
          autoComplete="off"
          placeholder="e.g. Dry rubble footing"
        />
      </div>
      {isEdit && (
        <label className="text-foreground flex items-center gap-2 text-sm">
          <Checkbox name="is_active" value="1" defaultChecked={group.is_active} />
          Active
        </label>
      )}
    </RecordFormDialog>
  );
}

export function WorkItemFormDialog({
  categories,
  groups,
  item,
  defaultCategoryId,
  defaultGroupId,
  trigger,
}: {
  categories: WorkCategoryRow[];
  groups: WorkGroupRow[];
  item?: WorkItemRow;
  defaultCategoryId?: string;
  defaultGroupId?: string;
  trigger?: React.ReactNode;
}) {
  const isEdit = !!item;
  // The one dependent field, same shape as Units: the group list is
  // filtered by the chosen category. Editing keeps the category fixed
  // (moving an item across categories means giving it a new code — do
  // that as delete + add).
  const [categoryId, setCategoryId] = useState(item?.category_id ?? defaultCategoryId ?? "");
  const filteredGroups = groups.filter((group) => group.category_id === categoryId);

  return (
    <RecordFormDialog
      label="Work Item"
      isEdit={isEdit}
      action={isEdit ? updateWorkItem.bind(null, item.id) : addWorkItem}
      trigger={trigger}
      onOpen={() => setCategoryId(item?.category_id ?? defaultCategoryId ?? "")}
    >
      <div className="space-y-1.5">
        <Label htmlFor="category_id">Category</Label>
        <Select
          id="category_id"
          name="category_id"
          value={categoryId}
          onChange={(event) => setCategoryId(event.target.value)}
          disabled={isEdit}
          required
        >
          <option value="" disabled>
            Choose a category
          </option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.code} — {category.name}
            </option>
          ))}
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="group_id">Group (optional)</Label>
        <Select
          id="group_id"
          name="group_id"
          defaultValue={item?.group_id ?? defaultGroupId ?? ""}
          disabled={!categoryId}
        >
          <option value="">None — directly under the category</option>
          {filteredGroups.map((group) => (
            <option key={group.id} value={group.id}>
              {group.code} — {group.name}
            </option>
          ))}
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="code">Code</Label>
        <Input
          id="code"
          name="code"
          defaultValue={item?.code}
          required
          autoComplete="off"
          placeholder="e.g. FD.4"
          maxLength={20}
        />
        <p className="text-muted text-xs">
          One numbering runs through a category&apos;s groups and works — a code can&apos;t repeat.
        </p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="name">Description</Label>
        <Input
          id="name"
          name="name"
          defaultValue={item?.name}
          required
          autoComplete="off"
          placeholder="e.g. Excavation for rubble foundation"
        />
      </div>
      {isEdit && (
        <label className="text-foreground flex items-center gap-2 text-sm">
          <Checkbox name="is_active" value="1" defaultChecked={item.is_active} />
          Active
        </label>
      )}
    </RecordFormDialog>
  );
}

const TOGGLE_ACTIONS = {
  category: setWorkCategoryActive,
  group: setWorkGroupActive,
  item: setWorkItemActive,
} as const;

export function WorksToggle({
  kind,
  id,
  isActive,
}: {
  kind: keyof typeof TOGGLE_ACTIONS;
  id: string;
  isActive: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();

  return (
    <div className="flex items-center justify-end gap-2">
      <FormMessage error={error} />
      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await TOGGLE_ACTIONS[kind](id, !isActive);
            setError(result?.error);
          })
        }
      >
        {pending ? "Saving…" : isActive ? "Deactivate" : "Activate"}
      </Button>
    </div>
  );
}
