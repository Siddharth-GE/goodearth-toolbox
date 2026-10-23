"use client";

import { Button, LinkButton } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { FormMessage } from "@/components/ui/form-message";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { UploadButton } from "@/components/ui/upload-button";
import {
  answerChecklistItem,
  signOffChecklist,
  uploadChecklistItemPhoto,
} from "@/lib/supervisors/checklist-actions";
import type { ChecklistDetail } from "@/lib/supervisors/checklist-queries";
import {
  CHECK_STATUS_LABEL,
  checklistProgress,
  signOffProblem,
  type CheckStatus,
} from "@/lib/supervisors/checklists";
import { cn } from "@/lib/utils";
import { Check, ChevronLeft, ChevronRight, ImageIcon, X } from "lucide-react";
import { useState, type ReactNode } from "react";

type Answer = { status: CheckStatus; remarks: string | null };

/** A ring that fills as the checks are answered. */
function ProgressRing({ answered, total }: { answered: number; total: number }) {
  const radius = 20;
  const circumference = 2 * Math.PI * radius;
  const share = total ? answered / total : 0;
  return (
    <div className="relative size-14 shrink-0">
      <svg viewBox="0 0 48 48" className="size-14 -rotate-90" aria-hidden="true">
        <circle
          cx="24"
          cy="24"
          r={radius}
          fill="none"
          strokeWidth="5"
          className="stroke-foreground/10"
        />
        <circle
          cx="24"
          cy="24"
          r={radius}
          fill="none"
          strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - share)}
          className="stroke-success transition-[stroke-dashoffset] duration-200"
        />
      </svg>
      <span className="text-foreground absolute inset-0 flex items-center justify-center text-xs font-semibold tabular-nums">
        {`${answered}/${total}`}
      </span>
    </div>
  );
}

/**
 * One check per screen, for a phone on site: Pass moves straight on; Fail and N/A ask for the remark first; a photo can go with
 * any check. Every answer saves at once. The list view stays for review and the checklist's details.
 */
export function ChecklistRunner({
  checklist,
  listHref,
}: {
  checklist: ChecklistDetail;
  listHref: string;
}) {
  const { items } = checklist;
  const [answers, setAnswers] = useState<Record<string, Answer>>(() =>
    Object.fromEntries(
      items.map((item) => [item.id, { status: item.status, remarks: item.remarks }]),
    ),
  );
  const firstOpen = items.findIndex((item) => answers[item.id].status === "not_checked");
  const [index, setIndex] = useState(firstOpen === -1 ? items.length : firstOpen);
  const [asking, setAsking] = useState<"fail" | "na" | null>(null);
  const [remark, setRemark] = useState("");
  const [saving, setSaving] = useState(false);
  // A photo still uploading holds the screen, so its refusal is never lost by moving on.
  const [uploading, setUploading] = useState(false);
  const busy = saving || uploading;
  const [error, setError] = useState<string>();

  const current = items.map((item) => answers[item.id]);
  const progress = checklistProgress(current);
  const problem = signOffProblem(current);
  const item = items[index] ?? null;
  const answer = item ? answers[item.id] : null;

  const go = (to: number) => {
    setIndex(to);
    setAsking(null);
    setError(undefined);
  };

  // The next check not yet answered after this one, else the end.
  const advance = (saved: Record<string, Answer>) => {
    for (let step = 1; step <= items.length; step++) {
      const at = (index + step) % items.length;
      if (saved[items[at].id].status === "not_checked") return go(at);
    }
    go(items.length);
  };

  const save = async (next: Answer) => {
    if (!item) return;
    setSaving(true);
    setError(undefined);
    const result = await answerChecklistItem(item.id, next);
    setSaving(false);
    if (result?.error) return setError(result.error);
    const saved = { ...answers, [item.id]: next };
    setAnswers(saved);
    advance(saved);
  };

  const ask = (status: "fail" | "na") => {
    if (asking === status) return;
    setAsking(status);
    setRemark(answer?.status === status ? (answer.remarks ?? "") : "");
    setError(undefined);
  };

  if (!item || !answer) {
    return (
      <div className="space-y-4">
        <Card className="space-y-4 p-6 text-center">
          {problem ? (
            <>
              <p className="text-foreground text-lg font-semibold">Nearly there</p>
              <p className="text-muted text-sm">{problem}</p>
            </>
          ) : (
            <div className="motion-safe:animate-pop-in space-y-2">
              <span className="bg-success text-success-foreground mx-auto flex size-14 items-center justify-center rounded-full">
                <Check className="size-7" aria-hidden />
              </span>
              <p className="text-foreground text-xl font-semibold">All clear</p>
              <p className="text-muted text-sm">
                {`${progress.total} checks answered${progress.failed ? ` · ${progress.failed} failed` : ""}. Sign off to make this the record.`}
              </p>
            </div>
          )}
          <div className="flex flex-col gap-2">
            <ConfirmDialog
              trigger={
                <Button size="lg" className="w-full" disabled={Boolean(problem)}>
                  Sign off
                </Button>
              }
              title="Sign this checklist off?"
              description="It becomes the record of this inspection and can no longer change."
              confirmLabel="Sign off"
              pendingLabel="Signing off…"
              tone="primary"
              onConfirm={() => signOffChecklist(checklist.id)}
            />
            <LinkButton href={listHref} variant="secondary" size="lg" className="w-full">
              Review every check
            </LinkButton>
            {items.length > 0 ? (
              <Button variant="ghost" onClick={() => go(0)}>
                Start again from the first check
              </Button>
            ) : null}
          </div>
        </Card>
      </div>
    );
  }

  const answerButton = (status: "pass" | "fail" | "na", icon: ReactNode) => {
    const chosen = answer.status === status;
    return (
      <Button
        variant="secondary"
        size="lg"
        disabled={busy}
        aria-pressed={chosen}
        onClick={() =>
          status === "pass" ? void save({ status: "pass", remarks: answer.remarks }) : ask(status)
        }
        className={cn(
          "h-16 w-full flex-col gap-0.5 px-2 text-base",
          chosen && status === "pass" && "border-success bg-success text-success-foreground",
          chosen && status !== "pass" && "border-foreground bg-foreground text-background",
          asking === status && "border-foreground",
        )}
      >
        {icon}
        {CHECK_STATUS_LABEL[status]}
      </Button>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <ProgressRing answered={progress.answered} total={progress.total} />
        <div className="min-w-0 flex-1">
          <p className="text-foreground text-sm font-semibold">{`Check ${index + 1} of ${items.length}`}</p>
          <p className="text-muted text-xs">
            {progress.failed
              ? `${progress.failed} failed so far`
              : "Pass moves straight to the next"}
          </p>
        </div>
        <LinkButton href={listHref} variant="ghost" size="sm">
          All checks
        </LinkButton>
      </div>

      <Card key={item.id} className="motion-safe:animate-fade-in space-y-4 p-5">
        <p className="text-foreground text-xl leading-snug font-semibold">{item.text}</p>
        {item.reviewNote ? (
          <p className="border-warning/40 bg-warning/5 text-foreground rounded-lg border px-2.5 py-1.5 text-sm">
            <span className="font-medium">To confirm: </span>
            {item.reviewNote}
          </p>
        ) : null}
        {answer.status !== "not_checked" && !asking ? (
          <p className="text-muted text-sm">
            {`Answered ${CHECK_STATUS_LABEL[answer.status]}${answer.remarks ? ` — ${answer.remarks}` : ""}`}
          </p>
        ) : null}

        <div className="grid grid-cols-3 gap-2">
          {answerButton("pass", <Check className="size-5" aria-hidden />)}
          {answerButton("fail", <X className="size-5" aria-hidden />)}
          {answerButton(
            "na",
            <span className="text-xs font-semibold" aria-hidden>
              —
            </span>,
          )}
        </div>

        {asking ? (
          <div className="space-y-2">
            <Label htmlFor={`remark-${item.id}`}>
              {asking === "fail" ? "What was found, and what was done?" : "Why does it not apply?"}
            </Label>
            <Textarea
              id={`remark-${item.id}`}
              rows={3}
              autoFocus
              value={remark}
              onChange={(event) => setRemark(event.target.value)}
            />
            <Button
              variant="primary"
              size="lg"
              className="w-full"
              disabled={busy || !remark.trim()}
              onClick={() => void save({ status: asking, remarks: remark.trim() })}
            >
              {busy ? "Saving…" : `Save ${CHECK_STATUS_LABEL[asking]} and go on`}
            </Button>
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          <UploadButton
            photo
            action={uploadChecklistItemPhoto.bind(null, item.id)}
            label={item.photo ? "Retake photo" : "Photo"}
            onBusyChange={setUploading}
          />
          {item.photo ? (
            <a
              href={`/supervisors/checklists/photos/${item.id}?v=${item.photo}`}
              target="_blank"
              rel="noreferrer"
              className="text-accent inline-flex min-h-9 items-center gap-1 text-sm font-medium"
            >
              <ImageIcon className="size-4" aria-hidden />
              See the photo
            </a>
          ) : null}
        </div>
        <FormMessage error={error} />
      </Card>

      <div className="flex justify-between gap-2">
        <Button variant="ghost" disabled={busy || index === 0} onClick={() => go(index - 1)}>
          <ChevronLeft className="size-4" aria-hidden />
          Back
        </Button>
        <Button variant="ghost" disabled={busy} onClick={() => go(index + 1)}>
          {index + 1 < items.length ? "Skip" : "Finish"}
          <ChevronRight className="size-4" aria-hidden />
        </Button>
      </div>
    </div>
  );
}
