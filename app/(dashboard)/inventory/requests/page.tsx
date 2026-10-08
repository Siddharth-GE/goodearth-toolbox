import { Badge } from "@/components/ui/badge";
import { LinkButton } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ListToolbar } from "@/components/ui/list-toolbar";
import { PageTitle } from "@/components/ui/page-title";
import { Section } from "@/components/ui/section";
import { formatDate, formatQuantity } from "@/lib/format";
import { getInventoryFilterOptions } from "@/lib/inventory/queries";
import { listSiteRequests, type SiteRequestRow } from "@/lib/inventory/requests-queries";
import { idParam, searchParam } from "@/lib/list-params";
import { Inbox } from "lucide-react";
import Link from "next/link";
import { DeclineRequestDialog } from "./_components/request-actions";

const STATUSES: { value: SiteRequestRow["status"]; label: string }[] = [
  { value: "requested", label: "Waiting" },
  { value: "fulfilled", label: "Issued" },
  { value: "declined", label: "Declined" },
];

// The store-keeper's queue (Phase 2 Step H): what the site is asking
// for, oldest first. Fulfil walks into the issue form with the villa,
// work, item and quantity already filled — the store stays the
// keeper's choice. Decline needs a reason the supervisor sees.
export default async function RequestsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; plot?: string; status?: string }>;
}) {
  const raw = await searchParams;
  const q = searchParam(raw.q);
  const plot = idParam(raw.plot);
  const status = STATUSES.find((option) => option.value === raw.status)?.value;
  const filtered = Boolean(q || plot || status);

  const [{ open, answered, answeredTotal, searchCapped }, filterOptions] = await Promise.all([
    listSiteRequests({ plotId: plot, status, q }),
    getInventoryFilterOptions(),
  ]);

  return (
    <div className="space-y-4">
      <PageTitle
        title="Requests from site"
        description="What supervisors are asking for, oldest first."
        backHref="/inventory"
        backLabel="Inventory"
      />

      <ListToolbar
        action="/inventory/requests"
        values={{ q, plot, status }}
        search={{ placeholder: "Item name…" }}
        filters={[
          {
            param: "plot",
            label: "Villa",
            allLabel: "All villas",
            options: filterOptions.plots.map((row) => ({ value: row.id, label: row.name })),
          },
          {
            param: "status",
            label: "Status",
            allLabel: "Any status",
            options: STATUSES,
          },
        ]}
      />

      {searchCapped && (
        <p className="text-muted text-xs">
          That search matches a lot of items, so only the first few are shown. Type more of the name
          to narrow it down.
        </p>
      )}

      {filtered && open.length === 0 && answered.length === 0 && (
        <EmptyState
          icon={Inbox}
          title="No requests match these filters"
          description="Try a different villa or status, or clear the filters."
        />
      )}

      {open.length === 0 ? (
        !filtered && (
          <EmptyState
            icon={Inbox}
            title="Nothing waiting"
            description="When a supervisor requests material for their villa, it lands here."
          />
        )
      ) : (
        <ul className="space-y-3">
          {open.map((request) => (
            <li
              key={request.id}
              className="border-border bg-surface flex flex-wrap items-center justify-between gap-3 rounded-2xl border p-4"
            >
              <div>
                <p className="text-foreground text-sm font-medium">
                  {formatQuantity(request.quantity)} {request.itemUom} · {request.itemName}
                </p>
                <p className="text-muted text-xs">
                  {request.plotName} · {request.projectName} — {request.workLabel}
                </p>
                <p className="text-muted text-xs">
                  {request.requesterName}, {formatDate(request.createdAt)}
                  {request.note ? ` · “${request.note}”` : ""}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <DeclineRequestDialog requestId={request.id} what={request.itemName} />
                <LinkButton href={`/inventory/issues/new?request=${request.id}`} variant="primary">
                  Fulfil
                </LinkButton>
              </div>
            </li>
          ))}
        </ul>
      )}

      {answered.length > 0 && (
        <Section
          title="Answered"
          note={`Showing ${answered.length} of ${answeredTotal}, newest first.`}
          collapsible
          defaultOpen={filtered}
        >
          <ul className="divide-border divide-y">
            {answered.map((request) => (
              <li
                key={request.id}
                className="flex flex-wrap items-center justify-between gap-2 py-2.5"
              >
                <div>
                  <p className="text-foreground text-sm">
                    {formatQuantity(request.quantity)} {request.itemUom} · {request.itemName}
                    <span className="text-muted"> — {request.plotName}</span>
                  </p>
                  <p className="text-muted text-xs">
                    {request.requesterName}, {formatDate(request.createdAt)}
                    {request.status === "declined" && request.declinedReason
                      ? ` · ${request.declinedReason}`
                      : ""}
                  </p>
                </div>
                <AnsweredBadge request={request} />
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}

function AnsweredBadge({ request }: { request: SiteRequestRow }) {
  if (request.status === "fulfilled") {
    return request.fulfilledIssueId ? (
      <Link href={`/inventory/issues/${request.fulfilledIssueId}`}>
        <Badge variant="success">Issued</Badge>
      </Link>
    ) : (
      <Badge variant="success">Issued</Badge>
    );
  }
  return <Badge variant="danger">Declined</Badge>;
}
