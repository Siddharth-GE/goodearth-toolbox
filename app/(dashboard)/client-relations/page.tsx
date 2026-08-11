import { LinkButton } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Pagination } from "@/components/ui/pagination";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/components/ui/table";
import { getFilterOptions, listClientsPage } from "@/lib/client-relations/queries";
import { CLIENT_STAGES } from "@/lib/client-relations/stages";
import { Handshake } from "lucide-react";
import Link from "next/link";

import { ClientStageBadge } from "./_components/crm-badges";
import { ClientFormDialog } from "./_components/client-form-dialog";

export default async function ClientRelationsPage({
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
  // Component and a Server Component cannot pass it a function — that
  // fails at runtime, and `next build` does not catch it.
  const hrefForPage = (target: number) => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (stage) params.set("stage", stage);
    if (owner) params.set("owner", owner);
    if (target > 1) params.set("page", String(target));
    const query = params.toString();
    return query ? `/client-relations?${query}` : "/client-relations";
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        {/* GET form: submitting drops `page`, so changing a filter returns
            to page 1 rather than stranding you past the end. */}
        <form action="/client-relations" className="flex flex-wrap items-end gap-2">
          <div className="space-y-1.5">
            <Label htmlFor="q">Search</Label>
            <Input
              id="q"
              name="q"
              defaultValue={q ?? ""}
              placeholder="Name or mobile…"
              autoComplete="off"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="stage">Stage</Label>
            <Select id="stage" name="stage" defaultValue={stage ?? ""}>
              <option value="">All</option>
              {CLIENT_STAGES.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="owner">Handled by</Label>
            <Select id="owner" name="owner" defaultValue={owner ?? ""}>
              <option value="">Anyone</option>
              {options.owners.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.name}
                </option>
              ))}
            </Select>
          </div>
          <Button type="submit" variant="secondary">
            Filter
          </Button>
          {isFiltered && (
            <LinkButton href="/client-relations" variant="ghost">
              Clear
            </LinkButton>
          )}
        </form>

        <ClientFormDialog owners={options.owners} />
      </div>

      {clients.length === 0 ? (
        <EmptyState
          icon={Handshake}
          title={isFiltered ? "Nobody matches those filters" : "No clients yet"}
          description={
            isFiltered
              ? "Try a different name, stage or person."
              : "Add a prospect to start tracking them."
          }
        />
      ) : (
        <Table>
          <TableHead>
            <TableRow>
              <TableHeaderCell>Name</TableHeaderCell>
              <TableHeaderCell>Stage</TableHeaderCell>
              <TableHeaderCell>Plots</TableHeaderCell>
              <TableHeaderCell>Mobile</TableHeaderCell>
              <TableHeaderCell>Handled by</TableHeaderCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {clients.map((client) => (
              <TableRow key={client.id}>
                <TableCell className="text-foreground font-medium">
                  <Link href={`/client-relations/${client.id}`} className="hover:underline">
                    {client.name}
                  </Link>
                </TableCell>
                <TableCell>
                  <ClientStageBadge stage={client.stage} />
                </TableCell>
                <TableCell className="text-muted text-xs">
                  {client.plots.length === 0
                    ? "—"
                    : client.plots.map((plot) => plot.unitName).join(", ")}
                </TableCell>
                {/* Saarang's 34 imported clients carry a name and nothing
                    else, so most of this column is a dash on purpose. */}
                <TableCell className="text-muted">{client.mobile ?? "—"}</TableCell>
                <TableCell className="text-muted">{client.ownerName ?? "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
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
