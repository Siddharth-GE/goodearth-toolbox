"use client";

import { ChoiceChips, type ChoiceOption } from "@/components/ui/choice-chips";
import { IconButton } from "@/components/ui/icon-button";
import { Input } from "@/components/ui/input";
import { Section } from "@/components/ui/section";
import { Textarea } from "@/components/ui/textarea";
import {
  renameClient,
  updatePlot,
  type PlotPatch,
} from "@/lib/client-relations/next-steps-actions";
import type { EngagementDetail } from "@/lib/client-relations/queries";
import {
  ACKNOWLEDGEMENTS,
  BOTTLENECKS,
  DEED_STATUSES,
  KAADAL_STAGES,
  ORIGINAL_WITH,
  REGISTRATION_STAGES,
} from "@/lib/client-relations/stages";
import { formatDate, todayInIndia } from "@/lib/format";
import type { ProgressStageRow } from "@/lib/masters/progress-stages";
import { cn } from "@/lib/utils";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useState, useTransition, type ReactNode } from "react";

import { Avatar } from "@/components/ui/avatar";
import { useBoard, useToast } from "./board-context";
import { SideIcon } from "./side-mark";

/** A plot's record as the tracker's drawer laid it out: chips save when tapped, boxes when you leave them. A refused save reverts the chip and says why. */

/** Only what the cards edit, not the whole plot record. */
export type PlotFields = Pick<
  EngagementDetail,
  | "id"
  | "ownerId"
  | "ownerName"
  | "bottlenecks"
  | "registrationStage"
  | "registrationOn"
  | "registrationNote"
  | "saleDeedStatus"
  | "saleDeedOriginalWith"
  | "saleDeedAck"
  | "saleDeedSignedOn"
  | "caStatus"
  | "caOriginalWith"
  | "caAck"
  | "caSignedOn"
  | "designConfirmedOn"
  | "permitOn"
  | "workingDrawingOn"
  | "progressStageId"
  | "kaadalStage"
  | "kaadalOwnerId"
  | "kaadalOwnerName"
  | "kaadalNote"
  | "details"
  | "designSupport"
  | "checkInOn"
  | "plotValue"
  | "constructionValue"
>;

type Person = { id: string; name: string };

function useSavePlot(engagementId: string) {
  const toast = useToast();
  const [, startTransition] = useTransition();
  return (patch: PlotPatch, revert?: () => void, message?: string) =>
    startTransition(async () => {
      const result = await updatePlot(engagementId, patch);
      if (result?.error) {
        revert?.();
        toast(result.error);
      } else if (message) {
        toast(message);
      }
    });
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <p className="text-muted text-xs font-medium">
        {label}
        {hint ? <span className="text-muted/80 font-normal"> · {hint}</span> : null}
      </p>
      {children}
    </div>
  );
}

function SavedChoice<T extends string>({
  engagementId,
  label,
  hint,
  options,
  initial,
  patch,
  disabled,
  required,
}: {
  engagementId: string;
  label: string;
  hint?: string;
  options: readonly ChoiceOption<T>[];
  initial: T | null;
  patch: (value: T | null) => PlotPatch;
  disabled?: boolean;
  required?: boolean;
}) {
  const save = useSavePlot(engagementId);
  const [value, setValue] = useState<T | null>(initial);
  return (
    <Field label={label} hint={hint}>
      <ChoiceChips
        label={label}
        options={options}
        value={value}
        required={required}
        disabled={disabled}
        onChange={(next) => {
          const before = value;
          setValue(next);
          save(patch(next), () => setValue(before));
        }}
      />
    </Field>
  );
}

function SavedText({
  engagementId,
  label,
  initial,
  patch,
  type = "text",
  multiline,
  placeholder,
  maxLength,
}: {
  engagementId: string;
  label: string;
  initial: string | null;
  patch: (value: string) => PlotPatch;
  type?: "text" | "date" | "number";
  multiline?: boolean;
  placeholder?: string;
  maxLength?: number;
}) {
  const save = useSavePlot(engagementId);
  const [saved, setSaved] = useState(initial ?? "");
  const commit = (raw: string, reset: (value: string) => void) => {
    const value = raw.trim();
    if (value === saved) return;
    const before = saved;
    setSaved(value);
    save(patch(value), () => {
      setSaved(before);
      reset(before);
    });
  };
  return (
    <Field label={label}>
      {multiline ? (
        <Textarea
          defaultValue={initial ?? ""}
          aria-label={label}
          placeholder={placeholder}
          maxLength={maxLength}
          onBlur={(event) => {
            const box = event.currentTarget;
            commit(box.value, (value) => (box.value = value));
          }}
          className="min-h-24 text-sm"
        />
      ) : (
        <Input
          type={type}
          defaultValue={initial ?? ""}
          aria-label={label}
          placeholder={placeholder}
          maxLength={maxLength}
          inputMode={type === "number" ? "decimal" : undefined}
          onKeyDown={(event) => event.key === "Enter" && event.currentTarget.blur()}
          onBlur={(event) => {
            const box = event.currentTarget;
            commit(box.value, (value) => (box.value = value));
          }}
          className={cn(type === "date" && "max-w-48", type === "number" && "max-w-48 font-mono")}
        />
      )}
    </Field>
  );
}

function peopleOptions(team: Person[], current: string | null, currentName: string | null) {
  const people = [...team];
  // A former team member who still owns the plot is shown, so nothing is silently dropped.
  if (current && !people.some((p) => p.id === current)) {
    people.push({ id: current, name: currentName ?? "Someone no longer on the team" });
  }
  return people.map((person) => ({
    value: person.id,
    label: (
      <>
        <Avatar name={person.name} size={20} letters={2} />
        {person.name.split(" ")[0]}
      </>
    ),
  }));
}

export function ClientNameField({ clientId, name }: { clientId: string; name: string }) {
  const toast = useToast();
  const [, startTransition] = useTransition();
  const [saved, setSaved] = useState(name);
  return (
    <input
      defaultValue={name}
      aria-label="Client name"
      maxLength={200}
      onKeyDown={(event) => event.key === "Enter" && event.currentTarget.blur()}
      onBlur={(event) => {
        const box = event.currentTarget;
        const value = box.value.trim();
        if (!value) {
          box.value = saved;
          toast("A client needs a name.");
          return;
        }
        if (value === saved) return;
        const before = saved;
        setSaved(value);
        startTransition(async () => {
          const result = await renameClient(clientId, value);
          if (result?.error) {
            setSaved(before);
            box.value = before;
            toast(result.error);
          }
        });
      }}
      className="text-foreground hover:bg-foreground/[0.03] focus:bg-surface-raised focus:ring-accent/15 -ml-1.5 w-full min-w-0 rounded-lg border-0 bg-transparent px-1.5 py-0.5 text-xl font-semibold tracking-tight focus:ring-4 focus:outline-none"
    />
  );
}

export function ConstructionCard({ engagement }: { engagement: PlotFields }) {
  const { team } = useBoard();
  return (
    <Section title="Construction">
      <div className="space-y-5">
        <SavedChoice
          engagementId={engagement.id}
          label="Construction owner"
          hint="owns every construction step here; change it to hand them all over"
          options={peopleOptions(team, engagement.ownerId, engagement.ownerName)}
          initial={engagement.ownerId}
          patch={(value) => ({ ownerId: value })}
        />
        <BottleneckChoice engagement={engagement} />
        <SavedChoice
          engagementId={engagement.id}
          label="Registration"
          options={REGISTRATION_STAGES}
          initial={engagement.registrationStage as (typeof REGISTRATION_STAGES)[number]["value"]}
          patch={(value) => ({ registrationStage: value ?? "not_due" })}
          required
        />
        <div className="grid gap-4 sm:grid-cols-[12rem_minmax(0,1fr)]">
          <SavedText
            engagementId={engagement.id}
            label="Registered on"
            type="date"
            initial={engagement.registrationOn}
            patch={(value) => ({ registrationOn: value || null })}
          />
          <SavedText
            engagementId={engagement.id}
            label="Registration note"
            initial={engagement.registrationNote}
            patch={(value) => ({ registrationNote: value })}
            placeholder="Who, where, what is still needed"
          />
        </div>
      </div>
    </Section>
  );
}

function BottleneckChoice({ engagement }: { engagement: PlotFields }) {
  const save = useSavePlot(engagement.id);
  const [value, setValue] = useState<string[]>(engagement.bottlenecks);
  return (
    <Field label="Waiting on" hint="as many as apply">
      <ChoiceChips
        label="Waiting on"
        multiple
        options={BOTTLENECKS}
        value={value as (typeof BOTTLENECKS)[number]["value"][]}
        onChange={(next) => {
          const before = value;
          setValue(next);
          save({ bottlenecks: next }, () => setValue(before));
        }}
      />
    </Field>
  );
}

/** Sale deed and construction agreement share one shape (0050's two-column split). */
export function DocumentCard({
  engagement,
  kind,
}: {
  engagement: PlotFields;
  kind: "deed" | "ca";
}) {
  const save = useSavePlot(engagement.id);
  const deed = kind === "deed";
  const [status, setStatus] = useState(deed ? engagement.saleDeedStatus : engagement.caStatus);
  const [original, setOriginal] = useState<string | null>(
    deed ? engagement.saleDeedOriginalWith : engagement.caOriginalWith,
  );
  const [ack, setAck] = useState<string | null>(deed ? engagement.saleDeedAck : engagement.caAck);
  const signed = status === "signed";
  const statuses = DEED_STATUSES.map((option) => ({ ...option, good: option.value === "signed" }));

  return (
    <Section title={deed ? "Sale deed" : "Construction agreement"}>
      <div className="space-y-5">
        <Field label="Status">
          <ChoiceChips
            label="Status"
            options={statuses}
            value={status as (typeof DEED_STATUSES)[number]["value"]}
            required
            onChange={(next) => {
              if (!next) return;
              const before = { status, original };
              setStatus(next);
              // Only a signed document has an original with someone (0050).
              if (next !== "signed") setOriginal(null);
              save(deed ? { saleDeedStatus: next } : { caStatus: next }, () => {
                setStatus(before.status);
                setOriginal(before.original);
              });
            }}
          />
        </Field>
        <div className="space-y-5">
          <Field label="Original is with" hint={signed ? undefined : "once it is signed"}>
            <ChoiceChips
              label="Original is with"
              options={ORIGINAL_WITH}
              value={original as (typeof ORIGINAL_WITH)[number]["value"] | null}
              disabled={!signed}
              onChange={(next) => {
                const before = original;
                setOriginal(next);
                save(deed ? { saleDeedOriginalWith: next } : { caOriginalWith: next }, () =>
                  setOriginal(before),
                );
              }}
            />
          </Field>
          <Field label="Acknowledgement">
            <ChoiceChips
              label="Acknowledgement"
              options={ACKNOWLEDGEMENTS}
              value={ack as (typeof ACKNOWLEDGEMENTS)[number]["value"] | null}
              onChange={(next) => {
                const before = ack;
                setAck(next);
                save(deed ? { saleDeedAck: next } : { caAck: next }, () => setAck(before));
              }}
            />
          </Field>
        </div>
        {signed ? (
          <SavedText
            engagementId={engagement.id}
            label="Signed on"
            type="date"
            initial={deed ? engagement.saleDeedSignedOn : engagement.caSignedOn}
            patch={(value) =>
              deed ? { saleDeedSignedOn: value || null } : { caSignedOn: value || null }
            }
          />
        ) : null}
        {deed ? null : <DesignChecks engagement={engagement} />}
      </div>
    </Section>
  );
}

const CHECKS = [
  { key: "designConfirmed", label: "Client confirmed design" },
  { key: "permit", label: "Permit" },
  { key: "workingDrawing", label: "Working drawing" },
] as const;

function DesignChecks({ engagement }: { engagement: PlotFields }) {
  const save = useSavePlot(engagement.id);
  const [on, setOn] = useState({
    designConfirmed: engagement.designConfirmedOn,
    permit: engagement.permitOn,
    workingDrawing: engagement.workingDrawingOn,
  });
  const chosen = CHECKS.filter((check) => on[check.key]).map((check) => check.key);
  const since = CHECKS.filter((check) => on[check.key])
    .map((check) => `${check.label.toLowerCase()} since ${formatDate(on[check.key])}`)
    .join(" · ");

  return (
    <Field label="Design checks" hint={since || undefined}>
      <ChoiceChips
        label="Design checks"
        multiple
        options={CHECKS.map((check) => ({
          value: check.key,
          good: true,
          label: (
            <>
              {on[check.key] ? "✓ " : ""}
              {check.label}
            </>
          ),
        }))}
        value={chosen}
        onChange={(next) => {
          const changed = CHECKS.find(
            (check) => next.includes(check.key) !== chosen.includes(check.key),
          );
          if (!changed) return;
          const turnOn = next.includes(changed.key);
          const before = on;
          setOn({ ...on, [changed.key]: turnOn ? todayInIndia() : null });
          save({ [changed.key]: turnOn }, () => setOn(before));
        }}
      />
    </Field>
  );
}

export function BuildCard({
  engagement,
  stages,
}: {
  engagement: PlotFields;
  stages: ProgressStageRow[];
}) {
  const save = useSavePlot(engagement.id);
  const toast = useToast();
  const [stageId, setStageId] = useState<string | null>(engagement.progressStageId);
  // The active list, plus the plot's own stage if Masters has since switched it off.
  const shown = stages.filter((stage) => stage.is_active || stage.id === stageId);
  const at = shown.findIndex((stage) => stage.id === stageId);

  const go = (index: number) => {
    const next = index < 0 ? null : (shown[index]?.id ?? null);
    if (next === stageId) return;
    const before = stageId;
    setStageId(next);
    save({ progressStageId: next }, () => setStageId(before));
    toast(next ? `Build: ${shown[index].name}` : "Build: not started");
  };

  if (shown.length === 0) {
    return (
      <Section title="Build progress">
        <p className="text-muted text-sm">
          Masters has no build stages yet — add them in Masters → Stages.
        </p>
      </Section>
    );
  }

  return (
    <Section
      title="Build progress"
      note="Where the build has got to, as the team last heard it. The stages are Masters' list."
    >
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <IconButton
            aria-label="Previous stage"
            bordered
            disabled={at < 0}
            onClick={() => go(at - 1)}
          >
            <ChevronLeft className="size-4" />
          </IconButton>
          <p className="min-w-0 flex-1 truncate text-base font-semibold tracking-tight">
            {at >= 0 ? shown[at].name : "Not started"}
          </p>
          <span className="text-muted text-xs whitespace-nowrap tabular-nums">
            {at >= 0 ? `${at + 1} of ${shown.length}` : `0 of ${shown.length}`}
          </span>
          <IconButton
            aria-label="Next stage"
            bordered
            disabled={at >= shown.length - 1}
            onClick={() => go(at + 1)}
          >
            <ChevronRight className="size-4" />
          </IconButton>
        </div>
        <div
          className="grid gap-1"
          style={{ gridTemplateColumns: `repeat(${shown.length}, minmax(0, 1fr))` }}
        >
          {shown.map((stage, index) => (
            <button
              key={stage.id}
              type="button"
              title={stage.name}
              aria-label={`Set the build stage: ${stage.name}`}
              aria-pressed={index === at}
              onClick={() => go(index)}
              className="focus-visible:ring-accent/25 group py-2 focus-visible:ring-4 focus-visible:outline-none"
            >
              <span
                className={cn(
                  "block h-2.5 rounded-sm",
                  index <= at ? "bg-accent" : "bg-foreground/[0.08] group-hover:bg-foreground/15",
                )}
              />
            </button>
          ))}
        </div>
      </div>
    </Section>
  );
}

/** Stored as kaadal_* (stages.ts). */
export function InteriorCard({ engagement }: { engagement: PlotFields }) {
  const { team } = useBoard();
  return (
    <Section title="Interior">
      <div className="space-y-5">
        <p className="text-muted -mt-1 flex items-center gap-1.5 text-xs">
          <SideIcon track="kaadal" /> Where things stand with the interiors pitch and work
        </p>
        <SavedChoice
          engagementId={engagement.id}
          label="Stage"
          options={KAADAL_STAGES}
          initial={engagement.kaadalStage}
          patch={(value) => ({ kaadalStage: value })}
        />
        <SavedChoice
          engagementId={engagement.id}
          label="Interior owner"
          hint="owns every interior step here; change it to hand them all over"
          options={peopleOptions(team, engagement.kaadalOwnerId, engagement.kaadalOwnerName)}
          initial={engagement.kaadalOwnerId}
          patch={(value) => ({ kaadalOwnerId: value })}
        />
        <SavedText
          engagementId={engagement.id}
          label="Interior note"
          initial={engagement.kaadalNote}
          patch={(value) => ({ kaadalNote: value })}
          placeholder="Where things stand with interiors"
          maxLength={500}
        />
      </div>
    </Section>
  );
}

export function ContextCard({
  engagement,
  updatedLine,
}: {
  engagement: PlotFields;
  updatedLine: string;
}) {
  return (
    <Section title="Context">
      <div className="space-y-5">
        <SavedText
          engagementId={engagement.id}
          label="Details"
          multiline
          initial={engagement.details}
          patch={(value) => ({ details: value })}
          placeholder="Background only. To-dos go in Next steps above."
          maxLength={8000}
        />
        <SavedText
          engagementId={engagement.id}
          label="Design support needed"
          multiline
          initial={engagement.designSupport}
          patch={(value) => ({ designSupport: value })}
          maxLength={4000}
        />
        <div className="grid gap-4 sm:grid-cols-3">
          <SavedText
            engagementId={engagement.id}
            label="Check-in done"
            type="date"
            initial={engagement.checkInOn}
            patch={(value) => ({ checkInOn: value || null })}
          />
          <SavedText
            engagementId={engagement.id}
            label="Plot value (₹)"
            type="number"
            initial={engagement.plotValue === null ? null : String(engagement.plotValue)}
            patch={(value) => ({ plotValue: value === "" ? null : Number(value) })}
          />
          <SavedText
            engagementId={engagement.id}
            label="Construction value (₹)"
            type="number"
            initial={
              engagement.constructionValue === null ? null : String(engagement.constructionValue)
            }
            patch={(value) => ({ constructionValue: value === "" ? null : Number(value) })}
          />
        </div>
        <p className="text-muted text-xs">{updatedLine}</p>
      </div>
    </Section>
  );
}
