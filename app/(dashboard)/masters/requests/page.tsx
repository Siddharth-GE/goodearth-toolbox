import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { NavTabs } from "@/components/ui/tabs";
import { requireApp } from "@/lib/auth/access";
import { requireUser } from "@/lib/auth/dal";
import { listItemRequests, type ItemRequestStatus } from "@/lib/masters/item-requests";
import { Inbox } from "lucide-react";
import { ResolveRequest } from "./_components/resolve-request";

const TABS: { label: string; status: ItemRequestStatus }[] = [
  { label: "Pending", status: "pending" },
  { label: "Approved", status: "approved" },
  { label: "Merged", status: "merged" },
  { label: "Rejected", status: "rejected" },
];

export default async function ItemRequestsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  // listItemRequests has no gate, following the masters read convention,
  // so this page states its own.
  const user = await requireUser();
  await requireApp(user, "/masters");

  const { status } = await searchParams;
  const active = (TABS.find((tab) => tab.status === status)?.status ??
    "pending") as ItemRequestStatus;
  const requests = await listItemRequests(active);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-foreground text-sm font-semibold">Item requests</h2>
        <p className="text-muted text-sm">
          Items designers added that weren&apos;t in the catalogue. Approving is tidying, not a gate
          — the item is already in use.
        </p>
      </div>

      <NavTabs
        tabs={TABS.map((tab) => ({
          key: tab.status,
          href:
            tab.status === "pending"
              ? "/masters/requests"
              : `/masters/requests?status=${tab.status}`,
          label: tab.label,
        }))}
        active={active}
      />

      {requests.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title={active === "pending" ? "Nothing waiting" : `No ${active} requests`}
          description={
            active === "pending"
              ? "When a designer adds an item the catalogue doesn't have, it appears here."
              : undefined
          }
        />
      ) : (
        <div className="space-y-3">
          {requests.map((request) => (
            <div key={request.id} className="border-border bg-surface rounded-2xl border p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-foreground font-medium">{request.requested_name}</p>
                    {request.status === "pending" && <Badge variant="warning">Provisional</Badge>}
                    {/* Usage is what makes a merge consequential: this item
                        is already sitting on issued revisions. */}
                    {request.usage_count > 0 && (
                      <span className="text-muted text-xs">
                        used on {request.usage_count} {request.usage_count === 1 ? "line" : "lines"}
                      </span>
                    )}
                  </div>
                  <p className="text-muted mt-0.5 text-xs">
                    {request.category_name ?? "No category"}
                    {request.brand_name && ` · ${request.brand_name}`}
                    {" · "}
                    {new Date(request.created_at).toLocaleDateString("en-IN")}
                  </p>
                  {request.spec_note && (
                    <p className="text-muted mt-2 max-w-prose text-sm">{request.spec_note}</p>
                  )}
                </div>

                {request.status === "pending" && (
                  <ResolveRequest
                    requestId={request.id}
                    provisionalItemId={request.provisional_item_id}
                    requestedName={request.requested_name}
                  />
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
