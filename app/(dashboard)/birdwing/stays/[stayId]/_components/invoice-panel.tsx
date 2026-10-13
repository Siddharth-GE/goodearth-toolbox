"use client";

import { Button, LinkButton } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { FormMessage } from "@/components/ui/form-message";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Section } from "@/components/ui/section";
import { Textarea } from "@/components/ui/textarea";
import { cancelInvoice, issueInvoice } from "@/lib/birdwing/actions";
import type { StayInvoice } from "@/lib/birdwing/queries";
import { formatDate, formatMoney } from "@/lib/format";
import { FileText } from "lucide-react";
import { useActionState } from "react";

/**
 * The invoice. Until it is issued it is only a preview of the charges,
 * watermarked DRAFT; issuing mints the next MEF/GH number in the database
 * and freezes the charges. A mistake is a cancel with a reason and a new
 * issue — the cancelled one stays on the record, never deleted.
 */
export function InvoicePanel({
  stayId,
  guestName,
  issued,
  history,
  blocker,
}: {
  stayId: string;
  guestName: string;
  issued: StayInvoice | null;
  history: StayInvoice[];
  /** Why it cannot be issued yet, or null. */
  blocker: string | null;
}) {
  const pdf = `/birdwing/stays/${stayId}/invoice`;
  const older = history.filter((invoice) => invoice.status === "cancelled" || invoice.historic);

  return (
    <Section
      title="Invoice"
      aside={
        <LinkButton href={pdf} variant="secondary" size="sm" plain>
          <FileText className="size-4" aria-hidden />
          {issued ? "Open PDF" : "Preview"}
        </LinkButton>
      }
    >
      {issued ? (
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="text-sm">
            <p className="text-foreground font-mono text-base font-semibold">{issued.number}</p>
            <p className="text-muted">
              Issued {formatDate(issued.issuedOn)}
              {issued.issuedByName ? ` by ${issued.issuedByName}` : ""} · to {issued.billToName}
            </p>
            <p className="text-muted">
              Payable{" "}
              <span className="text-foreground font-mono">
                {formatMoney(issued.payable, { paise: issued.payable % 1 !== 0 })}
              </span>
            </p>
          </div>
          {!issued.historic && (
            <ConfirmDialog
              trigger={
                <Button variant="ghost" size="sm" className="text-danger">
                  Cancel invoice
                </Button>
              }
              title={`Cancel ${issued.number}?`}
              description="It stays on the record as cancelled and its number is never used again. The charges open up, and the next issue gets a new number."
              confirmLabel="Cancel the invoice"
              pendingLabel="Cancelling…"
              reason={{ label: "Why", placeholder: "e.g. Wrong name on it" }}
              onConfirm={(why) => cancelInvoice(issued.id, why)}
            />
          )}
        </div>
      ) : blocker ? (
        <p className="text-muted text-sm">{blocker}</p>
      ) : (
        <IssueForm stayId={stayId} guestName={guestName} />
      )}

      {older.length > 0 && (
        <ul className="border-border mt-3 space-y-1 border-t pt-3 text-sm">
          {older.map((invoice) => (
            <li key={invoice.id} className="text-muted flex flex-wrap items-center gap-x-2">
              <a
                href={`${pdf}?invoice=${invoice.id}`}
                className="text-foreground hover:text-accent font-mono"
              >
                {invoice.number}
              </a>
              <span>
                {invoice.historic ? "from the old sheet" : "cancelled"} ·{" "}
                {formatDate(invoice.issuedOn)}
                {invoice.cancelReason ? ` · ${invoice.cancelReason}` : ""}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

function IssueForm({ stayId, guestName }: { stayId: string; guestName: string }) {
  const [state, formAction, pending] = useActionState(issueInvoice.bind(null, stayId), undefined);
  return (
    <form action={formAction} className="space-y-3">
      <fieldset disabled={pending} className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="bill-to">Made out to</Label>
          <Input
            id="bill-to"
            name="bill_to_name"
            defaultValue={guestName}
            required
            maxLength={160}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="bill-gstin">Their GSTIN</Label>
          <Input
            id="bill-gstin"
            name="bill_to_gstin"
            maxLength={15}
            placeholder="Only for a business"
            className="uppercase"
          />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="bill-address">Their address</Label>
          <Textarea id="bill-address" name="bill_to_address" rows={2} maxLength={400} />
        </div>
      </fieldset>
      <FormMessage error={state?.error} />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-muted text-xs">
          Issuing takes the next number, and the charges can no longer change.
        </p>
        <Button type="submit" disabled={pending}>
          {pending ? "Issuing…" : "Issue invoice"}
        </Button>
      </div>
    </form>
  );
}
