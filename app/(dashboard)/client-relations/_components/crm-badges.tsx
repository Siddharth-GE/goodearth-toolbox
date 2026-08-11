import { Badge } from "@/components/ui/badge";
import {
  ACKNOWLEDGEMENTS,
  BOTTLENECKS,
  CLIENT_STAGES,
  DEED_STATUSES,
  MILESTONE_STAGES,
  ORIGINAL_WITH,
  REGISTRATION_STAGES,
  optionFor,
  type Bottleneck,
} from "@/lib/client-relations/stages";

/**
 * Every stored value rendered as a badge, from one lookup.
 *
 * A per-tool badge wrapper is the house pattern (bills, indents and
 * purchase-orders each have one). This is the same idea with the map
 * living in lib/client-relations/stages.ts instead of here, because the
 * dropdowns need the identical list and two copies would drift.
 */

function Look({
  options,
  value,
}: {
  options: Parameters<typeof optionFor>[0];
  value: string | null;
}) {
  const option = optionFor(options, value);
  if (!option) return <span className="text-muted">—</span>;
  return <Badge variant={option.tone}>{option.label}</Badge>;
}

export function ClientStageBadge({ stage }: { stage: string }) {
  return <Look options={CLIENT_STAGES} value={stage} />;
}

export function DeedBadge({ status }: { status: string }) {
  return <Look options={DEED_STATUSES} value={status} />;
}

export function OriginalWithBadge({ value }: { value: string | null }) {
  return <Look options={ORIGINAL_WITH} value={value} />;
}

export function AckBadge({ value }: { value: string | null }) {
  return <Look options={ACKNOWLEDGEMENTS} value={value} />;
}

export function RegistrationBadge({ stage }: { stage: string }) {
  return <Look options={REGISTRATION_STAGES} value={stage} />;
}

/** The sheet's "Bottleneck" column: several at once, or a dash. */
export function BottleneckChips({ values }: { values: Bottleneck[] }) {
  if (values.length === 0) return <span className="text-muted">—</span>;
  return (
    <span className="flex flex-wrap gap-1">
      {values.map((value) => {
        const option = BOTTLENECKS.find((b) => b.value === value);
        return (
          <Badge key={value} variant={option?.tone ?? "neutral"}>
            {option?.label ?? value}
          </Badge>
        );
      })}
    </span>
  );
}

/**
 * The sheet's "Current Stage of Invoice Raising", derived from the
 * schedule. Null reads as a dash, not as "Booking" — nothing invoiced and
 * standing on the first rung are different answers.
 */
export function InvoiceStageBadge({ stage }: { stage: string | null }) {
  if (!stage) return <span className="text-muted">—</span>;
  const option = MILESTONE_STAGES.find((s) => s.value === stage);
  return <Badge variant="info">{option?.label ?? stage}</Badge>;
}

/** A plot's status in Masters. */
export function UnitStatusBadge({ status }: { status: string }) {
  const tone = status === "sold" ? "success" : status === "reserved" ? "warning" : "info";
  return (
    <Badge variant={tone} className="capitalize">
      {status}
    </Badge>
  );
}
