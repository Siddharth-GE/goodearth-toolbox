"use client";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FormMessage } from "@/components/ui/form-message";
import { IconButton } from "@/components/ui/icon-button";
import { Select } from "@/components/ui/select";
import { applyTrailSet, discardTrail, startTrail } from "@/lib/pusher/actions";
import type { ChainRow } from "@/lib/pusher/queries";
import { Play, Plus, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

type Trail = ChainRow & { projectStageId: string | null };

/**
 * The waiting half of a house: trails that exist, are staffed, and have
 * no clock running.
 *
 * Deliberately plain about that last part. A queued trail gets no
 * TimerDial and no day count — it has not elapsed anything, and a dial
 * reading "0 of 4 days" would look like a clock that had started. Its
 * line says "not started" instead.
 *
 * `useState` rather than `useTransition` for the pending flag: this form
 * stays mounted across the router.refresh() that follows every write, and
 * isPending stays true while a refresh is in flight, which greys the
 * whole panel out permanently (Pusher's PLAN.md records that one).
 */
export function HouseQueue({
  projectId,
  unitId,
  queued,
  sets,
}: {
  projectId: string;
  unitId: string;
  queued: Trail[];
  sets: { id: string; name: string; count: number }[];
}) {
  const router = useRouter();
  const [setId, setSetId] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async (key: string, fn: () => Promise<{ error?: string } | undefined>) => {
    setBusy(key);
    setError(null);
    const result = await fn();
    setBusy(null);
    if (result?.error) {
      setError(result.error);
      return;
    }
    // revalidatePath alone leaves this page showing the old queue — the
    // router cache holds its payload. Same fix as every other write here.
    router.refresh();
  };

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-2">
        <h2 className="text-foreground text-sm font-semibold">
          Waiting
          {queued.length > 0 && (
            <span className="text-muted ml-2 font-normal">
              {queued.length} trail{queued.length === 1 ? "" : "s"}, no clock running
            </span>
          )}
        </h2>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Select
            aria-label="Trail type"
            value={setId}
            onChange={(e) => setSetId(e.target.value)}
            disabled={busy !== null || sets.length === 0}
          >
            <option value="">
              {sets.length === 0 ? "No trail types yet" : "Add a trail type…"}
            </option>
            {sets.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.count})
              </option>
            ))}
          </Select>
          <Button
            size="sm"
            disabled={!setId || busy !== null}
            onClick={() => run("apply", () => applyTrailSet(projectId, unitId, setId))}
          >
            <Plus className="size-4" />
            {busy === "apply" ? "Adding…" : "Add"}
          </Button>
        </div>
      </div>

      <FormMessage error={error} />

      {queued.length === 0 ? (
        <p className="text-muted border-border mt-3 rounded-xl border border-dashed p-4 text-center text-sm">
          Nothing waiting. Add a trail type and this house&apos;s whole run of activities lands here
          as one trail, staffed and ready — not counting a day until you start it.
        </p>
      ) : (
        <div className="divide-border mt-3 divide-y">
          {queued.map((trail) => (
            <div key={trail.chainId} className="flex flex-wrap items-center gap-3 py-2.5">
              <span
                className="border-border size-2 shrink-0 rounded-full border"
                aria-hidden="true"
              />
              <Link href={`/pusher/trails/${trail.chainId}`} className="min-w-0 flex-1">
                <p className="text-foreground hover:text-accent text-sm font-medium">
                  {trail.activityName}
                  {trail.title ? (
                    <span className="text-muted font-normal"> · {trail.title}</span>
                  ) : null}
                </p>
                <p className="text-muted mt-0.5 text-xs">
                  {trail.legCount} activit{trail.legCount === 1 ? "y" : "ies"} · not started
                </p>
              </Link>
              <Button
                size="sm"
                variant="ghost"
                disabled={busy !== null}
                onClick={() =>
                  run(trail.chainId, () => startTrail(trail.chainId, projectId, unitId))
                }
              >
                <Play className="size-4" />
                {busy === trail.chainId ? "Starting…" : "Start"}
              </Button>
              <IconButton
                tone="danger"
                aria-label={`Remove ${trail.activityName}`}
                disabled={busy !== null}
                onClick={() =>
                  run(`x-${trail.chainId}`, () => discardTrail(trail.chainId, projectId, unitId))
                }
              >
                <X className="size-4" />
              </IconButton>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
