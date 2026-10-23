"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChoiceChips } from "@/components/ui/choice-chips";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { FormMessage } from "@/components/ui/form-message";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Section } from "@/components/ui/section";
import { Textarea } from "@/components/ui/textarea";
import { UploadButton } from "@/components/ui/upload-button";
import { formatDate } from "@/lib/format";
import { useSaveOnBlur } from "@/lib/hooks/use-save-on-blur";
import {
  answerChecklistItem,
  deleteChecklist,
  signOffChecklist,
  updateChecklistDetails,
  uploadChecklistFile,
} from "@/lib/supervisors/checklist-actions";
import type { ChecklistDetail, ChecklistItemRow } from "@/lib/supervisors/checklist-queries";
import {
  CHECK_STATUS_LABEL,
  checklistProgress,
  needsRemark,
  signOffProblem,
  type CheckAnswer,
  type CheckStatus,
} from "@/lib/supervisors/checklists";
import { FileText, ImageIcon } from "lucide-react";
import { useState } from "react";

type Answer = { status: CheckStatus; remarks: string | null };

const ANSWER_OPTIONS = [
  { value: "pass", label: "Pass", good: true },
  { value: "fail", label: "Fail" },
  { value: "na", label: "N/A" },
] as const;

export function ChecklistForm({ checklist }: { checklist: ChecklistDetail }) {
  const open = checklist.status === "open";
  const [answers, setAnswers] = useState<Record<string, Answer>>(() =>
    Object.fromEntries(
      checklist.items.map((item) => [item.id, { status: item.status, remarks: item.remarks }]),
    ),
  );
  const current = checklist.items.map((item) => answers[item.id]);
  const progress = checklistProgress(current);
  const problem = signOffProblem(current);

  return (
    <div className="space-y-4 pb-6">
      <Details checklist={checklist} editable={open} />

      {checklist.templateNote && (
        <p className="text-muted text-sm whitespace-pre-line">{checklist.templateNote}</p>
      )}

      <Section
        title="Checks"
        note={`${progress.answered} of ${progress.total} checked${progress.failed ? ` · ${progress.failed} failed` : ""}`}
        bodyClassName="p-0"
      >
        <ol className="divide-border divide-y">
          {checklist.items.map((item, index) => (
            <ItemRow
              key={item.id}
              number={index + 1}
              item={item}
              answer={answers[item.id]}
              editable={open}
              onSaved={(answer) => setAnswers((all) => ({ ...all, [item.id]: answer }))}
            />
          ))}
        </ol>
      </Section>

      <Section title="Attachment" note="A test certificate or a photo — one file, PDF or picture.">
        <div className="flex flex-wrap items-center gap-3">
          {checklist.hasAttachment ? (
            <a
              href={`/supervisors/checklists/files/${checklist.id}`}
              target="_blank"
              rel="noreferrer"
              className="border-border bg-background text-foreground hover:border-accent hover:text-accent inline-flex min-h-11 items-center gap-1.5 rounded-xl border px-3 text-sm font-medium"
            >
              <FileText className="size-4 shrink-0" aria-hidden />
              Open the attachment
            </a>
          ) : (
            <p className="text-muted text-sm">Nothing attached.</p>
          )}
          {open && (
            <UploadButton
              action={uploadChecklistFile.bind(null, checklist.id)}
              label={checklist.hasAttachment ? "Replace" : "Attach a file"}
            />
          )}
        </div>
      </Section>

      {open ? (
        <div className="border-border bg-surface flex flex-wrap items-center justify-between gap-3 rounded-2xl border p-4">
          <p className="text-muted text-sm">
            {problem ?? "Every check is answered — sign off to make this the record."}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <ConfirmDialog
              trigger={
                <Button variant="ghost" size="sm">
                  Delete
                </Button>
              }
              title="Delete this checklist?"
              description="Only for one started by mistake. Its answers go with it."
              confirmLabel="Delete"
              pendingLabel="Deleting…"
              onConfirm={() => deleteChecklist(checklist.id, checklist.plotId)}
            />
            <ConfirmDialog
              trigger={<Button disabled={Boolean(problem)}>Sign off</Button>}
              title="Sign this checklist off?"
              description="It becomes the record of this inspection and can no longer change."
              confirmLabel="Sign off"
              pendingLabel="Signing off…"
              tone="primary"
              onConfirm={() => signOffChecklist(checklist.id)}
            />
          </div>
        </div>
      ) : (
        <p className="text-muted text-sm">
          {`Signed off ${formatDate(checklist.signedOffAt)}${checklist.signedOffByName ? ` by ${checklist.signedOffByName}` : ""} — this is the record and can no longer change.`}
        </p>
      )}
    </div>
  );
}

function Details({ checklist, editable }: { checklist: ChecklistDetail; editable: boolean }) {
  const initial = {
    location: checklist.location ?? "",
    drawingRevision: checklist.drawingRevision ?? "",
    finishedOn: checklist.finishedOn ?? "",
    inspectedOn: checklist.inspectedOn ?? "",
    note: checklist.note ?? "",
  };
  const [value, setValue] = useState(initial);
  const { flush, error, saved } = useSaveOnBlur({
    initial,
    save: (next) =>
      updateChecklistDetails(checklist.id, {
        location: next.location || null,
        drawingRevision: next.drawingRevision || null,
        finishedOn: next.finishedOn || null,
        inspectedOn: next.inspectedOn || null,
        note: next.note || null,
      }),
  });
  const set = (patch: Partial<typeof initial>) => setValue((current) => ({ ...current, ...patch }));
  const save = () => flush(value);

  if (!editable) {
    return (
      <Section title="Details">
        <dl className="grid gap-3 text-sm sm:grid-cols-3">
          <Fact label="Location or floor" value={checklist.location} />
          <Fact label="Drawing and revision" value={checklist.drawingRevision} />
          <Fact label="Work references" value={checklist.workRefs} />
          <Fact label="Finished" value={checklist.finishedOn && formatDate(checklist.finishedOn)} />
          <Fact
            label="Inspected"
            value={checklist.inspectedOn && formatDate(checklist.inspectedOn)}
          />
          <Fact label="Started by" value={checklist.createdByName} />
          {checklist.note && <Fact label="Note" value={checklist.note} />}
        </dl>
      </Section>
    );
  }

  return (
    <Section title="Details" note={checklist.workRefs ? `Works: ${checklist.workRefs}` : undefined}>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="checklist-location">Location or floor</Label>
          <Input
            id="checklist-location"
            value={value.location}
            onChange={(event) => set({ location: event.target.value })}
            onBlur={save}
            autoComplete="off"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="checklist-drawing">Drawing and revision</Label>
          <Input
            id="checklist-drawing"
            value={value.drawingRevision}
            onChange={(event) => set({ drawingRevision: event.target.value })}
            onBlur={save}
            autoComplete="off"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="checklist-finished">Work finished on</Label>
          <Input
            id="checklist-finished"
            type="date"
            value={value.finishedOn}
            onChange={(event) => set({ finishedOn: event.target.value })}
            onBlur={save}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="checklist-inspected">Inspected on</Label>
          <Input
            id="checklist-inspected"
            type="date"
            value={value.inspectedOn}
            onChange={(event) => set({ inspectedOn: event.target.value })}
            onBlur={save}
          />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="checklist-note">Note (optional)</Label>
          <Input
            id="checklist-note"
            value={value.note}
            onChange={(event) => set({ note: event.target.value })}
            onBlur={save}
            placeholder="Next stage, who else was there…"
            autoComplete="off"
          />
        </div>
      </div>
      <FormMessage error={error} success={saved ? "Saved" : undefined} size="xs" />
    </Section>
  );
}

function Fact({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <dt className="text-muted text-[11px] font-medium tracking-[0.14em] uppercase">{label}</dt>
      <dd className="text-foreground mt-1 whitespace-pre-line">{value || "—"}</dd>
    </div>
  );
}

/** A tap on Pass, Fail or N/A saves at once; the remark saves when the field is left. */
function ItemRow({
  number,
  item,
  answer,
  editable,
  onSaved,
}: {
  number: number;
  item: ChecklistItemRow;
  answer: Answer;
  editable: boolean;
  onSaved: (answer: Answer) => void;
}) {
  const [remarks, setRemarks] = useState(answer.remarks ?? "");
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  const save = async (next: Answer) => {
    setBusy(true);
    setError(undefined);
    const result = await answerChecklistItem(item.id, {
      status: next.status,
      remarks: next.remarks,
    });
    setBusy(false);
    if (result?.error) setError(result.error);
    else onSaved(next);
  };

  const missingRemark = needsRemark({ status: answer.status, remarks: remarks || null });

  return (
    <li className="space-y-2 px-4 py-3">
      <p className="text-foreground text-sm">
        <span className="text-muted mr-1.5 tabular-nums">{number}.</span>
        {item.text}
      </p>
      {item.hasPhoto && (
        <a
          href={`/supervisors/checklists/photos/${item.id}`}
          target="_blank"
          rel="noreferrer"
          className="text-accent inline-flex items-center gap-1 text-xs font-medium"
        >
          <ImageIcon className="size-3.5" aria-hidden />
          Photo
        </a>
      )}
      {item.reviewNote && (
        <p className="border-warning/40 bg-warning/5 text-foreground rounded-lg border px-2.5 py-1.5 text-xs">
          <span className="font-medium">To confirm: </span>
          {item.reviewNote}
        </p>
      )}
      {editable ? (
        <div className="space-y-2">
          <ChoiceChips
            label={`Answer for check ${number}`}
            options={ANSWER_OPTIONS}
            value={answer.status === "not_checked" ? null : answer.status}
            disabled={busy}
            onChange={(status: CheckAnswer | null) =>
              void save({ status: status ?? "not_checked", remarks: remarks || null })
            }
          />
          <Textarea
            rows={1}
            value={remarks}
            onChange={(event) => setRemarks(event.target.value)}
            onBlur={() => {
              if ((remarks || null) !== (answer.remarks || null)) {
                void save({ status: answer.status, remarks: remarks || null });
              }
            }}
            placeholder={
              answer.status === "fail"
                ? "What was found, and what was done"
                : answer.status === "na"
                  ? "Why it does not apply"
                  : "Remarks (optional)"
            }
            aria-label={`Remarks for check ${number}`}
            className="min-h-11"
          />
          {missingRemark && !error && (
            <p className="text-warning text-xs font-medium">
              {answer.status === "fail"
                ? "Say what was found before signing off."
                : "Say why it does not apply before signing off."}
            </p>
          )}
          <FormMessage error={error} size="xs" />
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <Badge
            variant={
              answer.status === "pass" ? "success" : answer.status === "fail" ? "danger" : "neutral"
            }
          >
            {CHECK_STATUS_LABEL[answer.status]}
          </Badge>
          {answer.remarks && <span className="text-muted text-sm">{answer.remarks}</span>}
        </div>
      )}
    </li>
  );
}
