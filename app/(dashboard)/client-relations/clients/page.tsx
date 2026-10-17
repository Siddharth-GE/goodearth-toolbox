import { Avatar } from "@/components/ui/avatar";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ListToolbar } from "@/components/ui/list-toolbar";
import { Pagination } from "@/components/ui/pagination";
import { getFilterOptions, listClientsPage } from "@/lib/client-relations/queries";
import { CLIENT_STAGES } from "@/lib/client-relations/stages";
import { formatCount } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Handshake, Phone } from "lucide-react";
import Link from "next/link";

import { ClientFormDialog } from "../_components/client-form-dialog";
import { ClientStageBadge } from "../_components/crm-badges";
import { PersonName, Pill } from "../_components/pill";

/**
 * The people, as cards — a face, a name, their plots by number, who looks
 * after them and how many promises are open (root plan.md, seventh piece:
 * "edit the current tool to match the vibe"). Prospects and clients share
 * one list (Client Relations' decision 1).
 */
export default async function ClientsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; stage?: string; owner?: string; page?: string }>;
}) {
  const { q, stage, owner, page } = await searchParams;

  const [result, options] = await Promise.all([
    listClientsPage({ search: q, stage, owner, page: Number(page) || 1 }),
    getFilterOptions(),
  ]);
  const { rows: clients, total, page: currentPage, pageSize, pageCount } = result;
  const isFiltered = Boolean(q || stage || owner);

  // Precomputed href STRINGS, not a callback: Pagination is a Client
  // Component and a Server Component cannot pass it a function.
  const hrefForPage = (target: number) => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (stage) params.set("stage", stage);
    if (owner) params.set("owner", owner);
    if (target > 1) params.set("page", String(target));
    const query = params.toString();
    return query ? `/client-relations/clients?${query}` : "/client-relations/clients";
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <ListToolbar
          action="/client-relations/clients"
          values={{ q, stage, owner }}
          search={{ placeholder: "Name or mobile…" }}
          filters={[
            {
              param: "stage",
              label: "Stage",
              allLabel: "Everyone",
              options: CLIENT_STAGES.map((option) => ({
                value: option.value,
                label: option.label,
              })),
            },
            {
              param: "owner",
              label: "Handled by",
              allLabel: "Anyone",
              options: options.owners.map((person) => ({ value: person.id, label: person.name })),
            },
          ]}
        />
        <ClientFormDialog
          owners={options.owners}
          defaultOwnerId={options.me.seesAll ? null : options.me.id}
        />
      </div>

      {clients.length === 0 ? (
        <EmptyState
          icon={Handshake}
          title={
            isFiltered
              ? "Nobody matches those filters"
              : options.me.seesAll
                ? "No clients yet"
                : "No clients of yours yet"
          }
          description={
            isFiltered
              ? "Try a different name, stage or person."
              : options.me.seesAll
                ? "Add a prospect to start tracking them."
                : "Your clients show here: the ones you look after and the buyers of your plots. Add a prospect to start tracking them."
          }
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {clients.map((client) => (
            <Link
              key={client.id}
              href={`/client-relations/${client.id}`}
              className="focus-visible:ring-accent/25 block rounded-2xl focus-visible:ring-4 focus-visible:outline-none"
            >
              <Card interactive className="flex h-full min-w-0 flex-col gap-3 p-4">
                <div className="flex items-start gap-3">
                  <Avatar name={client.name} size={40} />
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-2 text-[15px] leading-snug font-semibold tracking-tight">
                      {client.name}
                    </p>
                    {client.mobile ? (
                      <p className="text-muted mt-0.5 flex items-center gap-1 text-xs">
                        <Phone className="size-3" /> {client.mobile}
                      </p>
                    ) : null}
                  </div>
                  <ClientStageBadge stage={client.stage} />
                </div>

                {client.plots.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {client.plots.map((plot) => (
                      <Pill key={plot.unitId} className="bg-foreground/[0.05] border-transparent">
                        <span className="text-foreground font-mono font-bold">{plot.number}</span>
                        <span className="text-muted font-normal">{plot.projectName}</span>
                      </Pill>
                    ))}
                  </div>
                ) : (
                  <p className="text-muted text-xs">No plot yet</p>
                )}

                <div className="text-muted mt-auto flex min-w-0 items-center gap-2 text-xs">
                  {client.ownerName ? (
                    <PersonName name={client.ownerName} size={18} />
                  ) : (
                    <span>Nobody assigned</span>
                  )}
                  {client.openSteps > 0 ? (
                    <span className="ml-auto whitespace-nowrap">
                      {formatCount(client.openSteps)} open
                      {client.overdueSteps > 0 ? (
                        <span className={cn("text-danger font-semibold")}>
                          {" · "}
                          {formatCount(client.overdueSteps)} overdue
                        </span>
                      ) : null}
                    </span>
                  ) : null}
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}

      <Pagination
        page={currentPage}
        pageCount={pageCount}
        total={total}
        pageSize={pageSize}
        unit="people"
        prevHref={currentPage > 1 ? hrefForPage(currentPage - 1) : null}
        nextHref={currentPage < pageCount ? hrefForPage(currentPage + 1) : null}
      />
    </div>
  );
}
