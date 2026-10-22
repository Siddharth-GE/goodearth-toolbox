import { formatDate, formatQuantity } from "@/lib/format";
import type { SiteConfirmation } from "@/lib/inventory/site-receipt-queries";

/** The site's word on an issue or a delivery to site. A shortage is for the store-keeper and accounts to see; any
 * correction to stock is a stock adjustment, never this. */
export function SiteConfirmationNote({
  confirmation,
  lines,
}: {
  confirmation: SiteConfirmation | null;
  lines: { id: string; item_name: string; quantity: number; uom: string }[];
}) {
  // A header whose lines did not all save is unfinished, never "whole".
  if (!confirmation || lines.some((line) => !confirmation.received.has(line.id))) {
    return (
      <p className="text-muted text-sm">
        {confirmation
          ? "The site started confirming this but did not finish — the supervisor presses Confirm again on the villa page."
          : "The site has not confirmed this yet — the supervisor does it on the villa page."}
      </p>
    );
  }

  const short = lines.filter((line) => {
    const received = confirmation.received.get(line.id);
    return received !== undefined && received < line.quantity;
  });
  const who = `${formatDate(confirmation.confirmedAt)}${confirmation.confirmedByName ? ` by ${confirmation.confirmedByName}` : ""}`;

  if (short.length === 0) {
    return <p className="text-foreground text-sm">{`Confirmed whole at site on ${who}.`}</p>;
  }
  return (
    <div className="border-warning/40 bg-warning/10 space-y-1 rounded-xl border px-4 py-3">
      <p className="text-foreground text-sm font-medium">{`The site says this arrived short — confirmed ${who}.`}</p>
      <ul className="text-foreground/90 space-y-0.5 text-sm">
        {short.map((line) => (
          <li key={line.id}>
            {`${line.item_name}: ${formatQuantity(confirmation.received.get(line.id) ?? 0)} of ${formatQuantity(line.quantity)} ${line.uom} arrived.`}
          </li>
        ))}
      </ul>
      {confirmation.note && <p className="text-muted text-xs">{confirmation.note}</p>}
      <p className="text-muted text-xs">
        Stock still reads what was issued. If material was lost, record it with a stock adjustment.
      </p>
    </div>
  );
}
