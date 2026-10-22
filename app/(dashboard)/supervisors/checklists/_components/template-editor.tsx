"use client";

import { RecordFormDialog } from "@/components/masters/record-form-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/form-message";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Section } from "@/components/ui/section";
import { Textarea } from "@/components/ui/textarea";
import { useActionRunner } from "@/lib/hooks/use-action-runner";
import {
  addChecklistTemplateItem,
  createChecklistTemplate,
  setChecklistTemplateActive,
  setChecklistTemplateItemActive,
  updateChecklistTemplate,
} from "@/lib/supervisors/checklist-actions";
import type { TemplateItemRow, TemplateRow } from "@/lib/supervisors/checklist-queries";
import { useState } from "react";

export function TemplateDialog({ template }: { template?: TemplateRow }) {
  return (
    <RecordFormDialog
      label="checklist"
      isEdit={Boolean(template)}
      action={template ? updateChecklistTemplate : createChecklistTemplate}
      trigger={
        template ? (
          <Button variant="ghost" size="sm">
            Edit
          </Button>
        ) : undefined
      }
    >
      {template && <input type="hidden" name="id" value={template.id} />}
      <div className="space-y-1.5">
        <Label htmlFor="template-name">Name</Label>
        <Input
          id="template-name"
          name="name"
          defaultValue={template?.name ?? ""}
          required
          autoComplete="off"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="template-works">Works it covers (optional)</Label>
        <Input
          id="template-works"
          name="work_refs"
          defaultValue={template?.workRefs ?? ""}
          placeholder="e.g. SS.1, SS.2a–SS.2d"
          autoComplete="off"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="template-note">Note shown on every checklist (optional)</Label>
        <Textarea id="template-note" name="note" rows={2} defaultValue={template?.note ?? ""} />
      </div>
    </RecordFormDialog>
  );
}

export function TemplateList({ templates }: { templates: TemplateRow[] }) {
  return (
    <div className="space-y-3">
      {templates.map((template) => {
        const active = template.items.filter((item) => item.isActive).length;
        return (
          <Section
            key={template.id}
            title={template.isActive ? template.name : `${template.name} (switched off)`}
            note={`${active} ${active === 1 ? "check" : "checks"}${template.workRefs ? ` · works ${template.workRefs}` : ""}`}
            collapsible
            defaultOpen={false}
            aside={
              <div className="flex items-center gap-1">
                <TemplateDialog template={template} />
                <ActiveToggle
                  active={template.isActive}
                  onToggle={(next) => setChecklistTemplateActive(template.id, next)}
                />
              </div>
            }
          >
            {template.note && (
              <p className="text-muted mb-3 text-sm whitespace-pre-line">{template.note}</p>
            )}
            <ol className="divide-border divide-y">
              {template.items.map((item, index) => (
                <ItemLine key={item.id} number={index + 1} item={item} />
              ))}
            </ol>
            <AddItem templateId={template.id} />
          </Section>
        );
      })}
    </div>
  );
}

function ItemLine({ number, item }: { number: number; item: TemplateItemRow }) {
  return (
    <li className="flex flex-wrap items-start justify-between gap-2 py-2.5">
      <div className={`min-w-0 flex-1 space-y-1 ${item.isActive ? "" : "opacity-60"}`}>
        <p className="text-foreground text-sm">
          <span className="text-muted mr-1.5 tabular-nums">{number}.</span>
          {item.text}
          {item.origin === "added" && (
            <Badge variant="neutral" className="ml-2">
              Added
            </Badge>
          )}
          {!item.isActive && (
            <Badge variant="neutral" className="ml-2">
              Off
            </Badge>
          )}
        </p>
        {item.reviewNote && (
          <p className="text-warning text-xs font-medium">{`To confirm: ${item.reviewNote}`}</p>
        )}
      </div>
      <ActiveToggle
        active={item.isActive}
        onToggle={(next) => setChecklistTemplateItemActive(item.id, next)}
      />
    </li>
  );
}

function ActiveToggle({
  active,
  onToggle,
}: {
  active: boolean;
  onToggle: (next: boolean) => Promise<{ error?: string } | undefined>;
}) {
  const { pending, error, run } = useActionRunner();
  return (
    <span className="inline-flex items-center gap-2">
      <FormMessage error={error} size="xs" />
      <Button
        variant="ghost"
        size="sm"
        disabled={pending}
        onClick={() => run(() => onToggle(!active))}
      >
        {active ? "Switch off" : "Switch on"}
      </Button>
    </span>
  );
}

function AddItem({ templateId }: { templateId: string }) {
  const [value, setValue] = useState("");
  const { pending, error, run } = useActionRunner();
  const add = async () => {
    const result = await run(() => addChecklistTemplateItem(templateId, value));
    if (!result?.error) setValue("");
  };

  return (
    <div className="border-border mt-3 space-y-2 border-t pt-3">
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="A new check, as it should read on site"
          aria-label="New check"
          autoComplete="off"
        />
        <Button onClick={add} disabled={pending || !value.trim()} variant="secondary">
          {pending ? "Adding…" : "Add check"}
        </Button>
      </div>
      <FormMessage error={error} size="xs" />
    </div>
  );
}
