"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FormMessage } from "@/components/ui/form-message";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { bounceBaton, finishTrail, handBaton, pushBaton } from "@/lib/relay/actions";
import { BOUNCE_REASONS } from "@/lib/relay/events";
import { POINTS, previewPoints } from "@/lib/relay/points";
import { cn } from "@/lib/utils";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { useCelebrate } from "./celebrate";

/**
 * The three things a baton-holder can do, plus the admin rescue.
 *
 * Every one of these is refused at the database if the rules are not met
 * (migration 0036 §8) — this component only decides what to offer and
 * how to phrase it. When the guard does refuse, its message is shown
 * verbatim: it was written to be read.
 */

export type MoveTarget = {
  chainId: string;
  /** The leg the baton is on, as this page last saw it. */
  fromLeg: number;
  legCount: number;
  daysInLeg: number;
  expectedDays: number;
  /** Legs behind the baton, bounce-able. */
  bounceTargets: { legNo: number; label: string; assigneeName: string }[];
  /** Who leg N+1 belongs to, for "the baton passes to …". */
  nextLegLabel: string | null;
  nextLegAssignee: string | null;
  nextLegDays: number | null;
  trailName: string;
};

type Mode = "push" | "bounce" | "finish" | "hand";

export function MoveBatonButtons({
  target,
  people,
  canPush,
  canBounce,
  canFinish,
  canHand,
  size = "md",
}: {
  target: MoveTarget;
  people: { id: string; name: string }[];
  canPush: boolean;
  canBounce: boolean;
  canFinish: boolean;
  canHand: boolean;
  size?: "sm" | "md";
}) {
  const [mode, setMode] = useState<Mode | null>(null);

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {canBounce && (
          <Button variant="secondary" size={size} onClick={() => setMode("bounce")}>
            Bounce
          </Button>
        )}
        {canHand && (
          <Button variant="ghost" size={size} onClick={() => setMode("hand")}>
            Hand over
          </Button>
        )}
        {canPush && (
          <Button size={size} onClick={() => setMode("push")}>
            Push
          </Button>
        )}
        {canFinish && (
          <Button size={size} onClick={() => setMode("finish")}>
            Finish
          </Button>
        )}
      </div>

      <MoveDialog mode={mode} onClose={() => setMode(null)} target={target} people={people} />
    </>
  );
}

function MoveDialog({
  mode,
  onClose,
  target,
  people,
}: {
  mode: Mode | null;
  onClose: () => void;
  target: MoveTarget;
  people: { id: string; name: string }[];
}) {
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [reason, setReason] = useState<string>("");
  const [toLeg, setToLeg] = useState<string>("");
  const [toUser, setToUser] = useState<string>("");
  const [pending, startTransition] = useTransition();
  const celebrate = useCelebrate();
  const router = useRouter();

  const close = () => {
    setError(null);
    setNote("");
    setReason("");
    setToLeg("");
    setToUser("");
    onClose();
  };

  if (!mode) return null;

  const preview = previewPoints(
    mode === "finish" ? "finish" : "push",
    target.daysInLeg,
    target.expectedDays,
  );

  const run = () => {
    setError(null);
    startTransition(async () => {
      let result;
      if (mode === "push") {
        result = await pushBaton(target.chainId, target.fromLeg, note);
      } else if (mode === "finish") {
        result = await finishTrail(target.chainId, target.fromLeg, note);
      } else if (mode === "bounce") {
        const back = Number(toLeg || target.bounceTargets.at(-1)?.legNo);
        result = await bounceBaton(target.chainId, target.fromLeg, back, reason, note);
      } else {
        result = await handBaton(target.chainId, toUser, note);
      }

      if (result?.error) {
        setError(result.error);
        return;
      }

      // revalidatePath in the action marks the data stale, but the page
      // the mover is standing on is rendered dynamically and its RSC
      // payload is already in the router cache — without this the baton
      // moves in the database and the screen keeps showing the old leg,
      // which is the one thing this tool cannot afford to get wrong.
      router.refresh();

      if (mode === "finish") {
        celebrate.banner("TRAIL COMPLETE");
        celebrate.toast(`${target.trailName} is done.`);
      } else if (mode === "push") {
        celebrate.flow(
          preview.onTime ? `+${POINTS.pushOnTime} FLOW · ON TIME` : `+${POINTS.pushLate} FLOW`,
        );
        celebrate.toast(
          target.nextLegAssignee
            ? `Baton passed to ${target.nextLegAssignee}.`
            : "Baton pushed forward.",
        );
      } else if (mode === "bounce") {
        celebrate.flow(`+${POINTS.bounce} FLOW · HONEST BOUNCE`);
        celebrate.toast("Sent back, with your reason.");
      } else {
        celebrate.toast("Baton handed over.");
      }
      close();
    });
  };

  const titles: Record<Mode, string> = {
    push: "Push forward",
    bounce: "Bounce back",
    finish: "Finish the trail",
    hand: "Hand the baton over",
  };

  return (
    <Dialog open onOpenChange={(open) => !open && close()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{titles[mode]}</DialogTitle>
          <DialogDescription>
            {mode === "push" && (
              <>
                {target.nextLegAssignee ? (
                  <>
                    The baton passes to <b className="text-foreground">{target.nextLegAssignee}</b>{" "}
                    for {target.nextLegLabel}
                    {target.nextLegDays ? ` (${target.nextLegDays} days)` : ""}.
                  </>
                ) : (
                  "The baton moves to the next leg."
                )}{" "}
                {preview.onTime
                  ? `+${preview.points} flow, on time.`
                  : `+${preview.points} flow — the clock ran over.`}
              </>
            )}
            {mode === "finish" && (
              <>
                This is the finish line.{" "}
                {preview.onTime ? `+${preview.points} flow, on time.` : `+${preview.points} flow.`}
              </>
            )}
            {mode === "bounce" &&
              "Send the baton back down the trail. An honest bounce earns +5 flow — sitting on a problem earns nothing."}
            {mode === "hand" &&
              "Move this baton to someone else without moving the trail. The leg's clock keeps running."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {mode === "bounce" && (
            <>
              <div>
                <Label htmlFor="bounce-to">Back to</Label>
                <Select
                  id="bounce-to"
                  className="mt-1 w-full"
                  value={toLeg || String(target.bounceTargets.at(-1)?.legNo ?? "")}
                  onChange={(e) => setToLeg(e.target.value)}
                >
                  {target.bounceTargets.map((t) => (
                    <option key={t.legNo} value={t.legNo}>
                      {t.legNo} · {t.label} — {t.assigneeName}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label>Reason</Label>
                <div className="mt-1.5 flex flex-wrap gap-2">
                  {BOUNCE_REASONS.map((r) => (
                    <button
                      key={r.value}
                      type="button"
                      onClick={() => setReason(r.value)}
                      className={cn(
                        "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                        reason === r.value
                          ? "border-danger bg-danger text-danger-foreground"
                          : "border-border text-muted hover:text-foreground",
                      )}
                    >
                      {r.label}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          {mode === "hand" && (
            <div>
              <Label htmlFor="hand-to">Hand to</Label>
              <Select
                id="hand-to"
                className="mt-1 w-full"
                value={toUser}
                onChange={(e) => setToUser(e.target.value)}
              >
                <option value="">Choose…</option>
                {people.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </div>
          )}

          <div>
            <Label htmlFor="move-note">
              Note{" "}
              <span className="text-muted font-normal">
                {mode === "bounce" || mode === "hand" ? "(required)" : "(optional)"}
              </span>
            </Label>
            <Textarea
              id="move-note"
              className="mt-1 min-h-20 w-full"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={
                mode === "bounce"
                  ? "What needs to change before it comes back?"
                  : mode === "hand"
                    ? "Why is the baton changing hands?"
                    : "Anything the next person should know?"
              }
            />
          </div>

          <FormMessage error={error} />
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={close} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={run} disabled={pending}>
            {pending ? "Working…" : titles[mode]}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
