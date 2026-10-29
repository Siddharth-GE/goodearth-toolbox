"use client";

import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/form-message";
import { consolidateBills, takeBillOffSheet } from "@/lib/bills/sheet-actions";
import { useActionRunner } from "@/lib/hooks/use-action-runner";
import { useRouter } from "next/navigation";

/** A contractor's loose labour bill goes onto its sheet (a new one, or the contractor's one still waiting). */
export function PutOnSheet({ billId }: { billId: string }) {
  const router = useRouter();
  const { run, pending, error, setError } = useActionRunner();
  const put = async () => {
    const answer = await run(() => consolidateBills([billId]));
    const sheet = answer && "result" in answer ? answer.result?.sheets[0] : undefined;
    const skipped = answer && "result" in answer ? answer.result?.skipped[0] : undefined;
    if (sheet) router.push(`/bills/sheets/${sheet.id}`);
    else if (skipped) setError(`It can't go on a sheet: ${skipped.reason}.`);
  };
  return (
    <div className="space-y-1 text-right">
      <Button variant="secondary" size="sm" disabled={pending} onClick={put}>
        {pending ? "Putting it on…" : "Put on a sheet"}
      </Button>
      <FormMessage error={error} size="xs" />
    </div>
  );
}

/** While its sheet waits for approval. */
export function TakeOffSheet({ billId }: { billId: string }) {
  const router = useRouter();
  const { run, pending, error } = useActionRunner();
  return (
    <div className="space-y-1">
      <Button
        variant="secondary"
        size="sm"
        disabled={pending}
        onClick={async () => {
          const result = await run(() => takeBillOffSheet(billId));
          if (!result?.error) router.refresh();
        }}
      >
        {pending ? "Taking it off…" : "Take it off the sheet"}
      </Button>
      <FormMessage error={error} size="xs" />
    </div>
  );
}
