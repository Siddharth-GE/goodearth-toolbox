"use client";

import { RecordFormDialog } from "@/components/masters/record-form-dialog";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { PillButton } from "@/components/ui/pill";
import { SearchSelect } from "@/components/ui/search-select";
import { X } from "lucide-react";
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
  setTemplateStages,
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

type Stage = { id: string; code: string; name: string };

export function TemplateList({
  templates,
  stages,
  stagesByTemplate,
}: {
  templates: TemplateRow[];
  stages: Stage[];
  stagesByTemplate: Record<string, string[]>;
}) {
  const stageById = new Map(stages.map((stage) => [stage.id, stage]));
  return (
    <div className="space-y-3">
      {templates.map((template) => {
        const active = template.items.filter((item) => item.isActive).length;
        const linked = (stagesByTemplate[template.id] ?? []).flatMap((id) => {
          const stage = stageById.get(id);
          return stage ? [stage] : [];
        });
        return (
          <Section
            key={template.id}
            title={template.isActive ? template.name : `${template.name} (switched off)`}
            note={`${active} ${active === 1 ? "check" : "checks"} · ${linked.length ? `stages ${linked.map((stage) => stage.code).join(", ")}` : "no stage yet"}`}
            collapsible
            defaultOpen={false}
            aside={
              <div className="flex items-center gap-1">
                <StagesDialog
                  templateId={template.id}
                  name={template.name}
                  linkedIds={stagesByTemplate[template.id] ?? []}
                  stages={stages}
                />
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

/** The stages this checklist inspects: a working stage offers it, and Done asks once while it is unsigned. */
function StagesDialog({
  templateId,
  name,
  linkedIds,
  stages,
}: {
  templateId: string;
  name: string;
  /** Every linked stage, a switched-off one included, so saving never drops it unseen. */
  linkedIds: string[];
  stages: Stage[];
}) {
  const [open, setOpen] = useState(false);
  const [chosen, setChosen] = useState<string[]>([]);
  const [adding, setAdding] = useState("");
  const { pending, error, run, clearError } = useActionRunner();
  const stageById = new Map(stages.map((stage) => [stage.id, stage]));

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) {
          setChosen(linkedIds);
          setAdding("");
          clearError();
        }
        setOpen(next);
      }}
    >
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          Stages
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Stages it inspects</DialogTitle>
          <DialogDescription>{name}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {chosen.length === 0 ? (
            <p className="text-muted text-sm">
              No stage yet — add the stages this checklist is for.
            </p>
          ) : (
            <ul className="flex flex-wrap gap-2">
              {chosen.map((id) => {
                const stage = stageById.get(id);
                return (
                  <li key={id}>
                    <PillButton
                      tone="plain"
                      aria-label={`Take ${stage?.code ?? "this stage"} off`}
                      onClick={() => setChosen((all) => all.filter((other) => other !== id))}
                    >
                      {stage ? `${stage.code} ${stage.name}` : "A stage switched off"}
                      <X className="size-3.5" aria-hidden />
                    </PillButton>
                  </li>
                );
              })}
            </ul>
          )}
          <SearchSelect
            options={stages
              .filter((stage) => !chosen.includes(stage.id))
              .map((stage) => ({ value: stage.id, label: `${stage.code} ${stage.name}` }))}
            value={adding}
            onChange={(value) => {
              if (value) setChosen((all) => [...all, value]);
              setAdding("");
            }}
            placeholder="Add a stage — type a code or name…"
          />
          <FormMessage error={error} />
          <Button
            variant="primary"
            className="w-full"
            disabled={pending}
            onClick={async () => {
              const result = await run(() => setTemplateStages(templateId, chosen));
              if (!result?.error) setOpen(false);
            }}
          >
            {pending ? "Saving…" : "Save"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
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
